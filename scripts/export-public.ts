// Copies committed data/* into public/data/* for the static site (run before every build).
import { pathToFileURL } from 'node:url';
import { activeChannels, activeStations } from '../src/lib/config';
import type { CatalogMinItem, PublicStationInfo } from '../src/lib/types';
import { loadAll, paths, writeJson } from './io';
import { join } from 'node:path';

export function exportPublic(root: string, now = Date.now()): void {
  const { config, catalog, schedule } = loadAll(root);
  const p = paths(root);
  const stations = activeStations(config).filter(
    (s) => schedule.stations[s.id] || schedule.fallbackOrder[s.id],
  );
  const info: PublicStationInfo = {
    stationName: config.stationName,
    tagline: config.tagline,
    artistName: config.artistName,
    channels: activeChannels(config),
    stations,
  };
  const min: CatalogMinItem[] = catalog
    .filter((c) => c.eligible)
    .map(({ id, title, channelId, durationSec, thumb }) => ({
      id,
      title,
      channelId,
      durationSec,
      thumb,
    }));
  writeJson(join(p.publicDir, 'station.json'), info);
  writeJson(join(p.publicDir, 'catalog.min.json'), min, false);
  writeJson(join(p.publicDir, 'schedule.json'), schedule, false);
  writeJson(join(p.publicDir, 'time.json'), { t: now }, false);
  console.log(`[export] ${stations.length} station(s), ${min.length} songs → public/data/`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) exportPublic(process.cwd());
