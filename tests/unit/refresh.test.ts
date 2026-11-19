import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { refresh } from '../../scripts/refresh';
import { exportPublic } from '../../scripts/export-public';
import type { CatalogItem, ScheduleFile } from '../../src/lib/types';

const fx = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8');
const CH = 'UC6ygpyydpFHCJK_KiXRUVNQ';
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

function makeRoot(channels: { id: string }[] = [{ id: CH }]) {
  const root = mkdtempSync(join(tmpdir(), 'radio-'));
  mkdirSync(join(root, 'config'));
  const base = JSON.parse(readFileSync(join(__dirname, '../../config/stations.json'), 'utf8'));
  base.channels = channels.map((c) => ({ ...c, label: { en: 'X', te: 'ఎక్స్' } }));
  writeFileSync(join(root, 'config/stations.json'), JSON.stringify(base));
  return root;
}

const res = (body: string, status = 200) => new Response(status === 200 ? body : null, { status });

function mockFetch(overrides: Record<string, number> = {}) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    if (url.includes('/feeds/videos.xml')) return res(fx('rss.xml'));
    if (url.includes('/oembed')) {
      const id = decodeURIComponent(url).split('v=')[1] ?? '';
      return res('{}', overrides[id] ?? 200);
    }
    if (url.includes('/shorts/')) return res('', overrides.shortsProbe ?? 303);
    if (url.includes('/playlistItems')) return res(fx('api-playlist.json'));
    if (url.includes('/videos?')) return res(fx('api-videos.json'));
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fn, calls };
}

const execOk = async (_cmd: string, args: string[]) => {
  const url = args[args.length - 1] ?? '';
  return url.endsWith('/shorts') ? fx('shorts-tab.json') : fx('videos-tab.json');
};
const execFail = async () => {
  throw new Error('Sign in to confirm you’re not a bot');
};

const read = <T>(root: string, f: string) => JSON.parse(readFileSync(join(root, f), 'utf8')) as T;

describe('refresh (integration, mocked network)', () => {
  it('keyless path: lists Videos tab, skips Shorts/unembeddable/upcoming, builds schedules', async () => {
    const root = makeRoot();
    const { fn } = mockFetch({ vidNOEMBED1: 401 });
    const r = await refresh({ root, now: NOW, fetch: fn, exec: execOk, log: () => {} });
    expect(r.source[CH]).toBe('ytdlp');
    const cat = read<CatalogItem[]>(root, 'data/catalog.json');
    const by = Object.fromEntries(cat.map((c) => [c.id, c]));
    expect(by.vidNEW00001?.eligible).toBe(true);
    expect(by.vidNEW00001?.publishedAt).toBe('2026-11-19T10:00:00.000Z');
    expect(by.vidSONG0150?.eligible).toBe(true); // on Videos tab ⇒ not a Short
    expect(by.vidNOEMBED1).toMatchObject({ eligible: false, reason: 'not_embeddable' });
    expect(by.vidUPCOMING).toBeUndefined();
    expect(by.vidSHORT045).toBeUndefined();
    const sched = read<ScheduleFile>(root, 'data/schedule.json');
    expect(Object.keys(sched.stations).sort()).toEqual(['all', 'ch1']);
    const ids = new Set(sched.stations.all!.slots.map((s) => s.id));
    expect(ids).toEqual(new Set(['vidNEW00001', 'vidSONG0150']));
    exportPublic(root, NOW);
    const info = read<{ stations: { id: string }[] }>(root, 'public/data/station.json');
    expect(info.stations.map((s) => s.id)).toEqual(['all', 'ch1']);
    expect(readFileSync(join(root, 'public/data/catalog.min.json'), 'utf8')).not.toContain(
      'vidNOEMBED1',
    );
  });

  it('API path: classifies Shorts and live, never calls yt-dlp', async () => {
    const root = makeRoot();
    const { fn, calls } = mockFetch({ shortsProbe: 200 });
    let execCalled = false;
    const r = await refresh({
      root,
      now: NOW,
      fetch: fn,
      exec: async () => ((execCalled = true), ''),
      apiKey: 'TESTKEY',
      log: () => {},
    });
    expect(r.source[CH]).toBe('api');
    expect(execCalled).toBe(false);
    const by = Object.fromEntries(
      read<CatalogItem[]>(root, 'data/catalog.json').map((c) => [c.id, c]),
    );
    expect(by.apiSONG0001?.eligible).toBe(true);
    expect(by.apiSHORT001?.reason).toBe('short');
    expect(by.apiLIVE0001?.reason).toBe('live');
    expect(calls.some((u) => u.includes('playlistId=UU6ygpyydpFHCJK_KiXRUVNQ'))).toBe(true);
  });

  it('degrades gracefully: no key + yt-dlp blocked keeps previous data and does not throw', async () => {
    const root = makeRoot();
    const { fn } = mockFetch();
    await refresh({ root, now: NOW, fetch: fn, exec: execOk, log: () => {} });
    const before = read<CatalogItem[]>(root, 'data/catalog.json');
    const r = await refresh({
      root,
      now: NOW + 3_600_000,
      fetch: fn,
      exec: execFail,
      log: () => {},
    });
    expect(r.source[CH]).toBe('rss-only');
    expect(read<CatalogItem[]>(root, 'data/catalog.json').map((c) => c.id)).toEqual(
      before.map((c) => c.id),
    );
    expect(
      read<ScheduleFile>(root, 'data/schedule.json').stations.all!.slots.length,
    ).toBeGreaterThan(0);
  });

  it('skips discovery without failing when no channel IDs are configured', async () => {
    const root = makeRoot([{ id: '{{CHANNEL_ID_1}}' }]);
    const { fn, calls } = mockFetch();
    const r = await refresh({ root, now: NOW, fetch: fn, exec: execFail, log: () => {} });
    expect(calls).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/No real channel IDs/);
    exportPublic(root, NOW);
  });
});
