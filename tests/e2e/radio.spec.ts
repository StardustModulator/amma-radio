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
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '88.5');

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

  // switch station with the keyboard → needle moves
  await page.getByRole('slider', { name: /స్టేషన్|STATION/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('needle')).toHaveAttribute('data-freq', '94.3');

  // English toggle
  await page.getByRole('button', { name: 'English' }).click();
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
