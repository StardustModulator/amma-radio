// Weekly health check: re-validates every catalogue item and writes health-report.md listing
// songs that can no longer play. The workflow turns that report into a single GitHub issue.
// Never fails the build for network problems.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadAll } from './io';
import { apiGetVideos, oembedStatus, type FetchLike } from './youtube';

export async function checkHealth(
  root: string,
  fetchFn: FetchLike,
  apiKey?: string,
): Promise<string[]> {
  const { catalog } = loadAll(root);
  const eligible = catalog.filter((c) => c.eligible);
  const broken: string[] = [];
  if (apiKey) {
    const vids = await apiGetVideos(
      fetchFn,
      apiKey,
      eligible.map((c) => c.id),
    );
    const byId = new Map(vids.map((v) => [v.id, v]));
    for (const c of eligible) {
      const v = byId.get(c.id);
      if (!v) broken.push(`${c.id} — removed or private — ${c.title}`);
      else if (!v.embeddable) broken.push(`${c.id} — embedding disabled — ${c.title}`);
      else if (v.privacyStatus !== 'public')
        broken.push(`${c.id} — ${v.privacyStatus} — ${c.title}`);
    }
  } else {
    for (const c of eligible) {
      const s = await oembedStatus(fetchFn, c.id);
      if (s === 'gone') broken.push(`${c.id} — removed or private — ${c.title}`);
      if (s === 'not_embeddable') broken.push(`${c.id} — embedding disabled — ${c.title}`);
    }
  }
  return broken;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const key = (process.env.YOUTUBE_API_KEY || '').trim() || undefined;
  checkHealth(process.cwd(), (u, i) => fetch(u, i), key)
    .then((broken) => {
      const body = broken.length
        ? `These songs can no longer play on the radio. The hourly job already skips them; fix them on YouTube (make public / allow embedding) or add them to \`denyVideoIds\`.\n\n${broken.map((b) => `- https://youtu.be/${b}`).join('\n')}\n`
        : '';
      writeFileSync('health-report.md', body);
      console.log(broken.length ? `${broken.length} broken video(s)` : 'All songs healthy.');
    })
    .catch((e) => {
      console.log(`::warning::health check skipped: ${String(e)}`);
      writeFileSync('health-report.md', '');
    });
}
