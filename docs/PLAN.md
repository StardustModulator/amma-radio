# Plan (v1)

**Goal:** a free, server-less "real radio" for Amma's YouTube songs. Everyone hears the same song at the
same second; new uploads join automatically; vintage valve-radio look; Telugu first.

## Architecture

1. **Hourly GitHub Action** (`.github/workflows/radio.yml`) runs `scripts/refresh.ts`:
   - discovers uploads per channel — YouTube Data API v3 when the `YOUTUBE_API_KEY` secret exists,
     otherwise the keyless path (yt-dlp `--flat-playlist` listing of the channel's _Videos_ and _Shorts_
     tabs for IDs/titles/durations, the official RSS feed for publish dates, the official oEmbed
     endpoint for "can it be embedded?"). Metadata only — no media is ever downloaded.
   - classifies each video (Shorts, live/premieres, private, unembeddable, too short/long, deny list);
   - extends an **absolute wall-clock schedule** (`data/schedule.json`) 48 h ahead per station with the
     pure `buildSchedule()` (seeded shuffle per cycle, new uploads first, never rewrites the next 10 min);
   - commits `data/*`, builds the site and deploys it to GitHub Pages in the same job
     (pushes made with `GITHUB_TOKEN` don't trigger other workflows).
2. **Static client** (Vite + React + TS) loads `data/schedule.json`, calibrates its clock against the
   HTTP `Date` header, binary-searches the current slot and seeks the official YouTube IFrame player into
   it. Drift > 2 s → re-seek. Player errors → deterministic filler shared by all listeners. If the job
   ever stops, a modulo "fallback mode" over a stable order keeps playing forever.

## Where the code lives

- Pure, unit-tested logic shared by job + client: `src/lib/{schedule,shuffle,now-playing,eligibility,duration,config}.ts`
  (the spec suggested `scripts/schedule.ts`; it lives in `src/lib` so the browser can import it too).
- Job: `scripts/{refresh,youtube,io,export-public,check-health}.ts`.
- UI: `src/components/*`, `src/styles/*`, `src/useRadio.ts`.

## Reference repos

- hfactor/cinema-radio — architecture idea only (no license; no code copied).
- tahsingibi/orbitcast (MIT) — clock calibration / drift-correction approach (re-implemented).
- satelllte/react-knob-headless (MIT) — knob dependency.
- ouestlabs/audio-ui, captbaritone/webamp, masterji-ka-radio — visual inspiration only.
