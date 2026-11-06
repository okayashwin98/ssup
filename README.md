# SuperShare

A Mac screen recorder that turns a recording into a polished video and a share link in one go: auto-zooms and cursor polish, captions, voice cleanup, and share pages with comments, served from your own Cloudflare account.

SuperShare is a modified version of [Recordly](https://github.com/webadderallorg/Recordly) by webadderall, changed from October 2026 onward. It is not affiliated with or endorsed by Recordly. See [Credits](#credits).

## What it does

**Record**
- A small floating bar: pick a display, a window or an area, and start recording on it.
- Webcam bubble, microphone and system audio.
- Sharp Mac recordings at 60 fps, asking macOS for only the part of the screen you chose.

**Edit**
- Auto-zooms, smooth cursor, cursor styles and click effects, backgrounds and frames (from Recordly).
- Timeline with trims, speed, zooms, annotations and extra audio; each row can be turned off.
- Captions from Whisper, with a glossary so names and jargon are spelled right.
- Voice cleanup per clip: **Filter noise** removes background noise, **Remove fillers** cuts "um" and "uh" and fills the gap with the room's own sound.
- Each project keeps its recordings in its own folder.

**Share**
- One click uploads to your own share service and copies the link.
- Share pages with a clean player, timestamped comments, reactions, subtitles and speed control, built for phones too.
- Link previews show the video frame and title.
- MP4 exports carry captions as a subtitle track you can turn on or off.

## Get it running

There's no download: build it yourself, which also keeps your share password private.

1. Set up your share service and build the app: **[docs/SHARING_SETUP.md](docs/SHARING_SETUP.md)**. It walks through Cloudflare, your private settings and the build, in about 15 minutes.
2. Without a share service the app still records, edits and exports; only Share needs it.

Requirements: macOS 14 or later, Node.js 20+, Xcode or its Command Line Tools, and a free Apple Development certificate (the guide shows how).

## Privacy

- Recordings stay on your Mac until you share them. Shared videos, comments and reactions live in your own Cloudflare account.
- Your share settings live in `.env.local` and `services/recordly-share/worker/wrangler.personal.jsonc`, which git ignores.
- A built app contains your share password. Don't share your build; others should build their own.

## Credits

- [Recordly](https://github.com/webadderallorg/Recordly) by webadderall, which SuperShare is built on. Recordly started as a fork of [OpenScreen](https://github.com/siddharthvaddem/openscreen) by Siddharth Vaddem.
- [Voom](https://github.com/aritropaul/voom) by Aritro Paul, the origin of the share service.
- The Clarity filler detector by arkaydeus, RNNoise, whisper.cpp, FFmpeg, and the fonts and icons listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), with their licences.

## Licence

SuperShare is free software under the GNU Affero General Public License v3, with Recordly's additional terms: see [LICENSE.md](LICENSE.md). If you share a modified version, publish its source under the same licence, don't use the Recordly name or branding for it, and credit Recordly in your app and repository.
