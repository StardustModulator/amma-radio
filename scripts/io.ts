import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CatalogItem, ScheduleFile, StateFile, StationsConfig } from '../src/lib/types';

export const DEFAULT_EPOCH = Date.UTC(2026, 0, 1);

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeJson(path: string, data: unknown, pretty = true): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, pretty ? 2 : undefined)}\n`);
}

export const paths = (root: string) => ({
  config: join(root, 'config/stations.json'),
  catalog: join(root, 'data/catalog.json'),
  state: join(root, 'data/state.json'),
  schedule: join(root, 'data/schedule.json'),
  publicDir: join(root, 'public/data'),
});

export function loadAll(root: string) {
  const p = paths(root);
  const config = readJson<StationsConfig | null>(p.config, null);
  if (!config) throw new Error(`Missing ${p.config}`);
  const catalog = readJson<CatalogItem[]>(p.catalog, []);
  const state = readJson<StateFile>(p.state, { version: 1, epoch: DEFAULT_EPOCH, stations: {} });
  const schedule = readJson<ScheduleFile>(p.schedule, {
    version: 1,
    generatedAt: 0,
    epoch: state.epoch,
    stations: {},
    fallbackOrder: {},
  });
  return { config, catalog, state, schedule };
}

/** One slot per line so the hourly git diffs stay tiny (history trimmed at the top, appended at the bottom). */
export function writeScheduleFile(path: string, sched: ScheduleFile): void {
  const lines: string[] = ['{'];
  lines.push(`"version":1,"generatedAt":${sched.generatedAt},"epoch":${sched.epoch},`);
  lines.push(`"fallbackOrder":${JSON.stringify(sched.fallbackOrder)},`);
  lines.push('"stations":{');
  const ids = Object.keys(sched.stations);
  ids.forEach((id, i) => {
    const st = sched.stations[id]!;
    lines.push(`${JSON.stringify(id)}:{"stationId":${JSON.stringify(st.stationId)},"slots":[`);
    st.slots.forEach((sl, j) =>
      lines.push(`${JSON.stringify(sl)}${j < st.slots.length - 1 ? ',' : ''}`),
    );
    lines.push(`]}${i < ids.length - 1 ? ',' : ''}`);
  });
  lines.push('}}');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join('\n')}\n`);
}
