# Set up your own share links

SuperShare's **Share** button uploads a recording to a small web service you run on your own Cloudflare account. That service stores the video and serves the share page people open: the player, comments, reactions and subtitles. Nobody else's server is involved, and the app has no share links until you set this up.

You do this once. It takes about 15 minutes.

## How the pieces fit

| Piece | What it is | Where it lives |
|---|---|---|
| Share service | A Cloudflare Worker (a small program Cloudflare runs for you) | `services/recordly-share/worker` |
| Video storage | A Cloudflare R2 bucket | your Cloudflare account |
| Database | A Cloudflare D1 database (titles, comments, reactions) | your Cloudflare account |
| Upload password | A random secret the app sends with each upload | the Worker's secrets, and your app build |
| App settings | Where the app should upload, and the password | `.env.local` in the project folder |

The share page itself is already built (`services/recordly-share/worker/web/dist`), so you don't need to build it.

## What you need

- A Mac with Apple silicon or Intel, macOS 14 or later.
- [Node.js](https://nodejs.org) 20 or later.
- Xcode, or its Command Line Tools (`xcode-select --install`), for the Mac helpers.
- An Apple Development certificate in your keychain. Any Apple ID gets one free: open Xcode → Settings → Accounts, add your Apple ID, then Manage Certificates → + → Apple Development. Builds refuse to finish without it, because macOS would otherwise ask for Screen Recording permission again after every rebuild.
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up). Cloudflare may ask you to add a payment method before it turns on R2 storage; check its current pricing and free allowance.

## 1. Get the code

```sh
git clone https://github.com/okayashwin98/supershare.git
cd supershare
npm install
```

## 2. Create the share service

```sh
cd services/recordly-share/worker
npm install
npx wrangler login
npx wrangler whoami
```

`wrangler login` opens a browser to sign in to Cloudflare. `whoami` prints your **account ID**; keep it for step 3.

Create the database and the video bucket. Pick your own names:

```sh
npx wrangler d1 create supershare-db
npx wrangler r2 bucket create supershare-videos
```

The first command prints a `database_id`; keep it. The database tables are created automatically on the first request, so there is nothing else to set up.

## 3. Write your private settings

```sh
cp wrangler.personal.example.jsonc wrangler.personal.jsonc
```

Open `wrangler.personal.jsonc` and replace every `<...>`:

- `name`: the Worker's name. It becomes your share address, `https://<name>.<your-subdomain>.workers.dev`.
- `account_id`: from `wrangler whoami`.
- `database_name` and `database_id`: from step 2.
- `bucket_name`: from step 2.
- `CREATOR_NAME`: the name shown on your share pages. You can change the name and photo later in the app's Settings.

Git ignores `wrangler.personal.jsonc`, so these values stay on your Mac. Don't rename it.

## 4. Set the upload password and deploy

Make a long random password and give it to the Worker:

```sh
openssl rand -hex 32
npx wrangler secret put API_SECRET --config wrangler.personal.jsonc
```

Paste the password when asked, and keep a copy for step 5. Then deploy:

```sh
npx wrangler deploy --config wrangler.personal.jsonc
```

The output ends with your address, for example `https://supershare.example.workers.dev`. Check it's running:

```sh
curl https://<your-address>/api/health
```

## 5. Point the app at it

Go back to the project folder and create `.env.local` (git ignores it):

```sh
cd ../../..
cp .env.example .env.local
```

Fill in:

```sh
VITE_CLOUD_SHARE_ENDPOINT=https://<your-address>/api/upload
VITE_CLOUD_SHARE_SECRET=<the password from step 4>
VITE_PROFILE_NAME=<your display name>
```

Leave the `VITE_SUPABASE_*` lines empty. They are for Recordly's sign-in service; when they're set, the app stops sending the password.

## 6. Build and install the app

```sh
npm run build:mac
```

The app lands in a folder inside `release/` (`mac-arm64` on Apple silicon). Quit any running SuperShare, then copy `SuperShare.app` into Applications.

## Keep it private

- **Your built app contains the upload password.** Anyone with your copy of `SuperShare.app` can upload to your Cloudflare account. Don't share your build or attach it to a GitHub release. Other people should build their own from the source.
- If the password ever leaks, make a new one, run `wrangler secret put API_SECRET` again, update `.env.local`, and rebuild.
- Never commit `.env.local`, `wrangler.personal.jsonc` or `.dev.vars`. The project's `.gitignore` already excludes them.

## Updating

After pulling new code:

```sh
cd services/recordly-share/worker
npx wrangler deploy --config wrangler.personal.jsonc
cd ../../..
npm run build:mac
```

Your recordings, comments and settings stay in your Cloudflare account and on your Mac.

## Notes for tools and scripts

- Upload: `POST /api/upload` with `Authorization: Bearer <API_SECRET>`. Only accepted when `ALLOW_API_SECRET_UPLOADS` is `"true"`.
- Health check: `GET /api/health`.
- Profile: `POST /api/profile`, sent by the app when you change your name or photo in Settings.
- `KEEP_RECORDINGS: "true"` keeps recordings until you delete them; without it they expire after 30 days.
- The daily cron (`0 3 * * *`) removes expired recordings and unfinished uploads.
- Worker source layout and tests: `services/recordly-share/worker/README.md`.
