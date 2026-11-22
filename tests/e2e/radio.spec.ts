import { expect, test } from '@playwright/test';

// Stub of the YouTube IFrame API: renders a real <iframe> and fakes playback state.
const YT_STUB = `
(function () {
  function Player(el, opts) {
    var f = document.createElement('iframe');
    f.setAttribute('title', 'YouTube video player');
    f.style.width = '100%'; f.style.height = '100%'; f.style.border = '0'; f.style.background = '#111';
    el.replaceWith(f);
    this.f = f; this.opts = opts; this.state = -1; this.t = 0; this.d = 0; this.vid = '';
    var self = this;
    setTimeout(function () { opts.events && opts.events.onReady && opts.events.onReady({ target: self }); }, 50);
  }
  Player.prototype.loadVideoById = function (o) {
    this.vid = o.videoId; this.t = o.startSeconds || 0; this.state = 1; this.d = 0;
    window.__ytLoads = (window.__ytLoads || []).concat([o]);
    var self = this;
    setTimeout(function () { self.opts.events.onStateChange({ target: self, data: 1 }); }, 10);
  };
  Player.prototype.seekTo = function (t) { this.t = t; };
  Player.prototype.playVideo = function () { this.state = 1; };
  Player.prototype.pauseVideo = function () { this.state = 2; };
  Player.prototype.stopVideo = function () { this.state = 5; };
  Player.prototype.getCurrentTime = function () { return this.t; };
  Player.prototype.getDuration = function () { return 0; };
  Player.prototype.getPlayerState = function () { return this.state; };
  Player.prototype.setVolume = function () {};
  Player.prototype.mute = function () {};
  Player.prototype.unMute = function () {};
  Player.prototype.destroy = function () {};
  Player.prototype.getIframe = function () { return this.f; };
  window.YT = { Player: Player, PlayerState: { PLAYING: 1 } };
  setTimeout(function () { window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 0);
})();`;

test.beforeEach(async ({ page }) => {
  await page.route('https://www.youtube.com/iframe_api', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: YT_STUB }),
  );
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '' }));
});

test('loads, powers on, plays in a visible ≥200×200 picture window', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h1')).toContainText('AriaAmruth Radio');
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  const lamp = page.getByTestId('onair');
  await expect(lamp).toHaveAttribute('data-on', 'false');

  await page.getByTestId('power').click();
  await expect(lamp).toHaveAttribute('data-on', 'true');
  await expect(page.getByTestId('now-title')).not.toHaveText(/^…?$/);
  const loads = await page.evaluate(
    () => (window as unknown as { __ytLoads: unknown[] }).__ytLoads,
  );
  expect(loads.length).toBeGreaterThan(0);

  // needle sits at the current station frequency (default: first station, 88.5)
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '88.6');

  // player window: ≥200×200 and nothing covers its centre
  const win = page.getByTestId('picture-window');
  const box = await win.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(200);
  expect(box!.height).toBeGreaterThanOrEqual(200);
  const topIsIframe = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  });
  expect(topIsIframe).toBe('IFRAME');

  // switch station with the TUNING knob's keyboard → needle moves to Hindi songs
  await page.getByRole('slider', { name: /ట్యూనింగ్|TUNING/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '90.4');

  // English toggle
  await page
    .getByRole('group', { name: /ప్రదర్శన భాష|Display language/ })
    .getByRole('button', { name: 'English' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('usable at 360px wide', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('SONGS/STORIES keys, language push-buttons and "Coming soon" stations', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('mode-songs')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('power').click();
  await expect(page.getByTestId('onair')).toHaveAttribute('data-on', 'true');

  // Hindi songs exist → plays
  await page.getByTestId('lang-row').getByRole('button', { name: 'हिन्दी' }).click();
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '90.4');
  await expect(page.getByTestId('now-title')).toContainText(/Hindi|हिन्दी|ह/);

  // French songs: nothing yet → Coming soon, lamp off, nothing breaks
  await page.getByTestId('lang-row').getByRole('button', { name: 'Français' }).click();
  await expect(page.getByTestId('coming-soon')).toBeVisible();
  await expect(page.getByTestId('onair')).toHaveAttribute('data-on', 'false');

  // Stories → mood row appears; Telugu horror stories are coming soon too
  await page.getByTestId('mode-stories').click();
  await page.getByTestId('lang-row').getByRole('button', { name: 'తెలుగు' }).click();
  await expect(page.getByTestId('mood-row')).toBeVisible();
  await page.getByTestId('mood-row').getByRole('button', { name: /భయానక/ }).click();
  await expect(page.getByTestId('coming-soon')).toContainText('త్వరలో');

  // Back to Telugu songs → plays again
  await page.getByTestId('mode-songs').click();
  await expect(page.getByTestId('mood-row')).toHaveCount(0);
  await expect(page.getByTestId('coming-soon')).toHaveCount(0);
  await expect(page.getByTestId('onair')).toHaveAttribute('data-on', 'true');
});

type MinItem = { id: string; channelId: string; mode?: string; lang?: string };
const TE_STORIES = 'UCRVSCAEXnJsDOn3yPQo3gPA';
const EN_STORIES = 'UCQKMrYMfL82ZV2XNAM9IkAw';

async function catalog(page: import('@playwright/test').Page): Promise<MinItem[]> {
  return page.evaluate(async () => (await fetch('data/catalog.min.json')).json());
}
const lastLoad = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const l = (window as unknown as { __ytLoads?: { videoId: string }[] }).__ytLoads ?? [];
    return l[l.length - 1]?.videoId;
  });

for (const size of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile 360', width: 360, height: 740 },
]) {
  test(`POWER button is on the top rail and visible without scrolling (${size.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('./');
    const power = page.getByTestId('power');
    await expect(power).toBeInViewport({ ratio: 1 });
    const p = (await power.boundingBox())!;
    const plate = (await page.locator('.nameplate').boundingBox())!;
    const dial = (await page.getByTestId('dial').boundingBox())!;
    expect(p.y + p.height).toBeLessThanOrEqual(plate.y + 1); // above the nameplate
    expect(p.y).toBeLessThan(dial.y);
    expect(p.height).toBeGreaterThanOrEqual(44); // comfortable tap target
    await power.click();
    await expect(power).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('onair')).toHaveAttribute('data-on', 'true');
  });
}

test('Telugu Stories plays Amma’s Telugu stories channel only', async ({ page }) => {
  await page.goto('./');
  const cat = await catalog(page);
  const teStories = cat.filter((c) => c.channelId === TE_STORIES);
  expect(teStories.length).toBeGreaterThan(0);
  teStories.forEach((c) => expect([c.mode, c.lang]).toEqual(['stories', 'te']));

  await page.getByTestId('power').click();
  await page.getByTestId('mode-stories').click();
  await page.getByTestId('lang-row').getByRole('button', { name: 'తెలుగు' }).click();
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '98.2');
  await expect(page.getByTestId('station-name')).toContainText('తెలుగు కథలు');
  await expect(page.getByTestId('coming-soon')).toHaveCount(0);
  await expect(page.getByTestId('now-title')).not.toHaveText(/^…?$/);
  await expect.poll(() => lastLoad(page)).toBeTruthy();
  const id = await lastLoad(page);
  expect(teStories.map((c) => c.id)).toContain(id);

  // ...and never leaks into Telugu Songs
  await page.getByTestId('mode-songs').click();
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '88.6');
  await expect.poll(() => lastLoad(page)).not.toBe(id);
  const songId = await lastLoad(page);
  expect(cat.find((c) => c.id === songId)?.channelId).not.toBe(TE_STORIES);
});

test('English, Spanish and French Stories play Amma’s English stories channel', async ({
  page,
}) => {
  await page.goto('./');
  const cat = await catalog(page);
  const enIds = cat.filter((c) => c.channelId === EN_STORIES).map((c) => c.id);
  expect(enIds.length).toBeGreaterThan(0);
  await page.getByTestId('power').click();
  await page.getByTestId('mode-stories').click();
  for (const [btn, freq] of [
    ['English', '101.8'],
    ['Español', '103.6'],
    ['Français', '105.4'],
  ] as const) {
    await page.getByTestId('lang-row').getByRole('button', { name: btn }).click();
    await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', String(Number(freq)));
    await expect(page.getByTestId('freq-value')).toHaveText(freq);
    await expect(page.getByTestId('coming-soon')).toHaveCount(0);
    await expect.poll(async () => enIds.includes((await lastLoad(page)) ?? '')).toBe(true);
  }
});

test('changes station like a real radio: ◀ ▶, arrow keys, dial markers, keys stay in sync', async ({
  page,
}) => {
  // count WebAudio static bursts
  await page.addInitScript(() => {
    const w = window as unknown as { __static: number };
    w.__static = 0;
    const orig = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      w.__static += 1;
      return orig.call(this);
    };
  });
  const bursts = () => page.evaluate(() => (window as unknown as { __static: number }).__static);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await page.getByTestId('station-next').click(); // OFF: needle moves, no static
  await page.waitForTimeout(100);
  expect(await bursts()).toBe(0);
  await page.getByTestId('station-prev').click();
  await page.getByTestId('power').click();
  await expect(page.getByTestId('freq-value')).toHaveText('88.6');
  await page.waitForTimeout(800);
  const b0 = await bursts();
  await page.getByTestId('station-next').click();
  await expect.poll(bursts).toBeGreaterThan(b0); // ON: tuning static
  await page.waitForTimeout(800);
  await page.getByTestId('station-prev').click();

  // ▶ walks the dial; empty stations are skipped
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.getByTestId('station-next').click();
    await expect(page.getByTestId('dial')).toHaveAttribute('data-tuning', 'true');
    seen.push((await page.getByTestId('freq-value').textContent()) ?? '');
  }
  expect(seen).toContain('98.2'); // crossed into the STORIES band
  expect(seen).toContain('88.6'); // wrapped around
  for (const f of seen) {
    const st = page.locator(`.dial__station:has(b:text-is("${f}"))`);
    await expect(st).not.toHaveClass(/dial__station--empty/);
  }

  // land on Telugu stories via a dial marker → the STORIES key + తెలుగు button follow
  await page.locator('[data-station="stories-te"]').click();
  await expect(page.getByTestId('mode-stories')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lang-row').getByRole('button', { name: 'తెలుగు' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // ← goes back across the band edge to the last non-empty songs station
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('mode-songs')).toHaveAttribute('aria-pressed', 'true');
  const f = Number(await page.getByTestId('freq-value').textContent());
  expect(f).toBeLessThan(98);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('freq-value')).toHaveText('98.2');
  await expect(page.getByTestId('mode-stories')).toHaveAttribute('aria-pressed', 'true');

  // tuning while OFF moves the needle silently (no player loads)
  await page.getByTestId('power').click();
  const before = await page.evaluate(
    () => ((window as unknown as { __ytLoads?: unknown[] }).__ytLoads ?? []).length,
  );
  await page.getByTestId('station-prev').click();
  await expect(page.getByTestId('mode-songs')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(700);
  const after = await page.evaluate(
    () => ((window as unknown as { __ytLoads?: unknown[] }).__ytLoads ?? []).length,
  );
  expect(after).toBe(before);
});
