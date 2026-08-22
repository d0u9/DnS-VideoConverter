# DnS Video Converter

A standalone desktop GUI (Windows + macOS) for converting video to HEVC/AAC MP4
using your own `ffmpeg`/`ffprobe`. It mirrors the logic of the original
`get_ffmpeg_args` bash function: probes the source, decides whether video/audio
can be stream-copied, computes the output resolution (with portrait-aware
presets), and runs `ffmpeg` while streaming logs and progress live.

No installer — the packaged app is a single portable `.exe` on Windows and a
plain `.app` bundle on macOS. It does **not** bundle `ffmpeg` itself; point it
at your existing binaries in Settings (⚙ top right). Auto-detection tries
`ffmpeg`/`ffprobe` on `PATH` and, on macOS, `/opt/homebrew/bin` and
`/usr/local/bin`.

## Develop

```bash
npm install
npm run dev
```

## Typecheck

```bash
npm run typecheck
```

## Build a standalone app

```bash
# macOS — produces dist/mac/DnS Video Converter.app (drag anywhere, no install)
npm run dist:mac

# Windows — produces a single portable .exe in dist/
# (build this on a Windows machine, or a Windows CI runner)
npm run dist:win
```

## Project layout

- `src/shared/ffmpegPlan.ts` — pure logic that turns a probe result + options
  (CRF, resolution) into the exact `ffmpeg` args, matching the bash script.
- `src/main/` — Electron main process: file dialogs, settings persistence,
  spawning `ffprobe`/`ffmpeg`, progress parsing.
- `src/preload/` — the only bridge exposed to the renderer (`window.api`).
- `src/renderer/` — the React UI.
