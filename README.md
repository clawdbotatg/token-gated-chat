# 🦞 $CLAWD Token-Gated Telegram Chat

A bouncer bot that gates Telegram group access to $CLAWD token holders on Base.

## How It Works

1. User joins the Telegram group
2. Bot detects new member, sends them a verification link
3. User opens the link, connects wallet, signs a SIWE message
4. Server checks $CLAWD balance on Base — if sufficient, user is verified
5. Unverified users are kicked after 10 minutes
6. Periodic re-checks remove users who sell their tokens

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  Telegram    │────▶│  Bot         │────▶│  Store   │
│  Group       │     │  (grammy)    │     │  (JSON)  │
└─────────────┘     └──────────────┘     └────┬─────┘
                                               │
┌─────────────┐     ┌──────────────┐          │
│  User's      │────▶│  Web Server  │──────────┘
│  Browser     │     │  (express)   │
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
   # Edit .env with your bot token and chat ID
   ```

4. **Run:**
   ```bash
   npm run dev  # runs both bot and web server
   ```

## Token

- **$CLAWD**: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` (ERC-20 on Base)
- Minimum balance: 1 token (configurable)

## Stack

- **Bot**: [grammY](https://grammy.dev/) (Telegram bot framework)
- **Web**: Express + vanilla HTML/JS
- **Auth**: EIP-4361 (SIWE)
- **Chain**: Base (via Alchemy RPC)
- **Storage**: JSON file (MVP)
