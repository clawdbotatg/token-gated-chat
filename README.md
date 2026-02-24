# 🦞 $CLAWD Token-Gated Telegram Chat

A bouncer bot (@ClawdPrivateBot) that gates Telegram group access to $CLAWD token holders on Base.

## How It Works

1. User DMs @ClawdPrivateBot → sends `/start`
2. Bot replies with a verification link
3. User opens the link, connects wallet via RainbowKit, signs a SIWE message
4. Server checks $CLAWD balance on Base — if sufficient, user gets a single-use invite link
5. Unverified users who join the group are kicked immediately
6. Periodic re-checks (every 4 hours via Vercel cron) kick members who sell their tokens

## Architecture

Two components:

### 1. Telegram Bot (`bot/index.js`)
- Long-running Node.js process using [grammY](https://grammy.dev/)
- Handles `/start`, `/status` commands
- Watches for new group members → kicks unverified joiners
- Polls for newly verified users → sends invite links
- Runs periodic balance re-checks
- **Runs locally via macOS `launchd`** — auto-starts on login, auto-restarts on crash

### 2. Web App (Next.js on Vercel)
- Wallet verification UI (RainbowKit + SIWE)
- Stores verified users in Upstash Redis (KV)
- `/api/recheck` cron route — runs every 4 hours to kick members who sold

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Telegram    │────▶│  Bot         │────▶│  Local JSON   │
│  Group       │     │  (grammY)    │     │  + Upstash KV │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                  │
┌─────────────┐     ┌──────────────┐              │
│  User's      │────▶│  Vercel App  │──────────────┘
│  Browser     │     │  (Next.js)   │
└─────────────┘     └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Base RPC    │
                    │  (balanceOf) │
                    └──────────────┘
```

## Setup

1. **Clone & install:**
   ```bash
   git clone https://github.com/clawdbotatg/token-gated-chat
   cd token-gated-chat
   npm install
   ```

2. **Create a Telegram bot** via [@BotFather](https://t.me/BotFather)
   - Give it `can_restrict_members` permission in your group

3. **Configure:**
   ```bash
   cp .env.example .env
   # Edit .env with your values (see .env.example for all options)
   ```

4. **Run the bot:**
   ```bash
   npm run bot
   ```

5. **Run the web app:**
   ```bash
   npm run dev
   ```

   Or deploy to Vercel and pull env vars with `vercel env pull`.

## Running as a Persistent Service (macOS)

The bot needs to stay running for Telegram polling. On macOS, use a launchd agent:

```bash
# Plist goes in ~/Library/LaunchAgents/com.clawd.bouncer-bot.plist
# Key settings:
#   RunAtLoad: true (starts on login)
#   KeepAlive: true (restarts on crash)
#   WorkingDirectory: this repo
#   ProgramArguments: node bot/index.js
```

Load it:
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.clawd.bouncer-bot.plist
```

Check logs:
```bash
tail -f bot.log
tail -f bot-error.log
```

## Token

- **$CLAWD**: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` (ERC-20 on Base)
- Minimum balance: configurable via `CLAWD_MIN_BALANCE` env var (in wei)

## Stack

- **Bot**: [grammY](https://grammy.dev/) (Telegram bot framework)
- **Web**: Next.js + [RainbowKit](https://www.rainbowkit.com/)
- **Auth**: EIP-4361 (SIWE)
- **Chain**: Base (via Alchemy RPC)
- **Storage**: Upstash Redis (KV) + local JSON fallback

<!-- deploy trigger Sun Feb 15 21:45:37 MST 2026 -->
