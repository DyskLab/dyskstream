<p align="center">
  <img src="docs/icon.png" width="88" alt="DyskStream">
</p>

<h1 align="center">DyskStream</h1>

<p align="center">A self-hosted YouTube Live assistant: viewers earn points for chatting and spend them on alerts that pop up in OBS.</p>

<p align="center">
  <a href="https://dysklab.fanny.dev"><img src="https://img.shields.io/badge/part%20of-DyskLab-A855F7" alt="Part of DyskLab"></a>
  <a href="https://buymeacoffee.com/fannydevz"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=000" alt="Buy Me a Coffee"></a>
</p>

DyskStream reads the live chat of any public YouTube stream, with no login, API key, or quota: paste the video URL
and it starts. Every comment earns points, and `!alert <message>` spends them on a Saweria-style alert in OBS.
Replies to chat commands and moderation are left to [Nightbot](https://nightbot.tv).

> The interface is in Indonesian (the dashboard also has English). DyskStream was called **Streaming Assistant**
> before it joined DyskLab.

## Get it

### Desktop app

The Electron app runs the server and the dashboard in one window, with a tray icon. Build it yourself:

```bash
git clone https://github.com/DyskLab/dyskstream.git
cd dyskstream/desktop
npm install
npm run dist:mac      # or: npm run dist:win
```

The installer lands in `desktop/release/`. Data is kept in the app's data folder (an install from before the rename
keeps using its old `Streaming Assistant` folder).

### Server (24/7)

In production everything runs on one port (4300): the built dashboard, the overlays, and the API.

**Docker:**

```bash
echo "ADMIN_PASSWORD=your-password" > .env
docker compose up -d --build
```

**PM2:**

```bash
npm i -g pm2
cd dashboard && npm ci && npm run build
cd ../server && npm ci
cp .env.example .env                 # then set ADMIN_PASSWORD
cd .. && pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Open http://SERVER:4300. Data (SQLite and uploads) is in `./data` with Docker or `server/` with PM2.

**Requires:** Node.js 25 or later (for the built-in `node:sqlite`).

## Features

- **Live chat reader** for any public channel, through [masterchat](https://github.com/sigvt/masterchat).
- **Points:** +1 per comment with a cooldown, bonus commands, and a leaderboard.
- **`!alert <message>`:** spends points and shows an alert in OBS with your own image, sound, or TTS, queued one at a
  time so they never pile up.
- **OBS overlays:** alerts, live chat, leaderboard, event ticker, request queue, running text, a goal bar, and viewer
  avatars (blob and blocky characters).
- **Full-screen scenes:** starting soon, be right back, and stream ended.
- **Dashboard:** monitor, leaderboard, rules, a template editor with Test Alert, and a soundboard with hotkeys.
- **Open on your phone:** sign in to the dashboard from your phone by scanning a QR code.
- **Nightbot:** `!point` and `!rank` through `$(urlfetch)`.
- **Public leaderboard** page you can share with viewers.

## Using it

1. **Monitor:** paste the live video URL or ID and press **Mulai**.
2. Points start adding up; check **Leaderboard**.
3. **Alert:** set up the template and press **Kirim Test**.
4. **Aturan:** change the `!alert` cost, cooldown, banned words, and the rest, then **Simpan**.

## OBS

Add each overlay as a **Browser** source at your canvas size (for example 1920×1080). Its background is transparent.
Turn off **Shutdown source when not visible** so the WebSocket stays connected.

| Overlay | URL |
| --- | --- |
| Alert | `http://localhost:4300/overlay/` |
| Live chat | `http://localhost:4300/overlay/chat.html` |
| Leaderboard | `http://localhost:4300/overlay/leaderboard.html?limit=5&pos=top-right` |
| Ticker | `http://localhost:4300/overlay/ticker.html` |
| Request queue | `http://localhost:4300/overlay/requests.html` |
| Goal bar | `http://localhost:4300/overlay/goal.html` |
| Viewer avatars | `http://localhost:4300/overlay/avatars.html` |
| Scenes | `scene-start.html`, `scene-brb.html`, `scene-end.html` in `/overlay/` |

The public leaderboard is at `http://localhost:4300/leaderboard/` (add `?overlay` for a transparent version).

## Nightbot

DyskStream never posts to chat, so commands that need a reply go through Nightbot:

1. Make the server public, for example `cloudflared tunnel --url http://localhost:4300`.
2. In Nightbot, add `!point` → `$(urlfetch https://<your-url>/nb/points?u=$(user))` and `!rank` →
   `$(urlfetch https://<your-url>/nb/rank?u=$(user))`.

Reply formats are set in **Aturan** (`nightbot.pointsReply` and others).

## Security

The dashboard is protected by `ADMIN_PASSWORD` (default `admin`, so change it). Every `/api/*` endpoint needs a
session. Overlays, `/nb/*`, `/uploads/*`, the WebSocket, and `/health` stay public because OBS and Nightbot need them.
Sessions survive restarts and expire after 30 days.

## Development

```bash
cd server && npm install && npm run dev        # http://localhost:4300
cd dashboard && npm install && npm run dev     # http://localhost:4301
cd desktop && npm install && npm start         # desktop app
```

```
server/     Fastify, masterchat, SQLite, uploads
dashboard/  control panel (React, Vite, Tailwind)
overlay/    OBS browser sources
public/     viewer leaderboard
desktop/    Electron app
shared/     types shared by the server and clients
docs/       technical plan (in Indonesian)
```

> masterchat is unofficial and can break when YouTube changes its internals. The reader sits behind a `ChatReader`
> interface so it can be swapped for the official YouTube Data API.

## Support

If DyskStream helps you, you can [buy me a coffee](https://buymeacoffee.com/fannydevz).

## Part of DyskLab

DyskStream is part of [DyskLab](https://dysklab.fanny.dev), alongside
[DyskFlow](https://github.com/DyskLab/dyskflow), [DyskFocus](https://github.com/DyskLab/dyskfocus),
[DyskFiles](https://github.com/DyskLab/dyskfiles), [DyskPOS](https://github.com/DyskLab/dyskpos), and DyskLink for
[Mac](https://github.com/DyskLab/dysklink-mac), [Android](https://github.com/DyskLab/dysklink-android), and
[Windows and Linux](https://github.com/DyskLab/dysklink-desktop).
