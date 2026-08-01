# KJB Gateway Bot

A lightweight Discord.js bot that listens for plain-text Bible references and replies with verses from the King James Bible.

## What it does

- **Mention-based:** `@KJB Reader John 3:16` → verse lookup
- **Inline detection:** Just type `John 3:16` in any channel → instant verse reply
- **Chapter lookup:** `@KJB Reader Psalm 23` → full chapter
- **Commands:** `daily`, `random`, `gospel`, `help` (via mention)
- **Navigation buttons:** Prev/Next chapter, Copy, TOC — all inline
- **Slash commands still work** (handled by the existing Base44 serverless bot)

## Prerequisites

### 1. Enable Message Content Intent

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application (ID: `1529303667348606996`)
3. Go to **Bot** → **Privileged Gateway Intents**
4. Enable **Message Content Intent**
5. Save changes

### 2. Get your bot token

The bot token is already set as `DISCORD_BOT_TOKEN` in your Base44 secrets. You'll need to copy it to your deployment platform.

## Deployment

### Option A: Railway (recommended, free $5/month credit)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Upload these files (or push to a GitHub repo first)
4. Railway will auto-detect Node.js
5. Go to **Variables** → add:
   - `DISCORD_BOT_TOKEN` = your bot token
6. Railway deploys automatically

### Option B: Fly.io (free tier)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# From this directory
fly launch --no-deploy
fly secrets set DISCORD_BOT_TOKEN=your_token_here
fly deploy
```

### Option C: Local / VPS

```bash
npm install
DISCORD_BOT_TOKEN=your_token_here npm start
```

Use `pm2` or `screen` to keep it running:
```bash
npm install -g pm2
DISCORD_BOT_TOKEN=your_token_here pm2 start bot.js --name kjb-gateway
```

## How it works

```
User types: "John 3:16"
         ↓
Gateway bot detects Bible reference (regex)
         ↓
Calls Bible API: kingjamesbiblereader.com/api/functions/bibleApi
         ↓
Replies with verse embed + Copy button
```

The bot coexists with the existing slash command bot:
- **Slash commands** (`/read`, `/search`, etc.) → handled by Base44 serverless V2
- **Plain text** (`John 3:16`, `@KJB Reader Romans 3:25`) → handled by this Gateway bot

Both use the same bot token and the same Bible API.

## Cost

- **Railway free tier:** $5/month credit — more than enough for a small bot
- **Fly.io free tier:** 3 shared VMs (256MB RAM) — sufficient
- **Local/VPS:** Only the cost of the machine

## Files

- `bot.js` — Main bot script (single file, ~400 lines)
- `package.json` — Dependencies (just discord.js)
