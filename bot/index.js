const { Bot, GrammyError, HttpError } = require("grammy");
const fs = require("fs");
const path = require("path");
const config = require("../shared/config");
const store = require("../shared/store");
const { checkBalance, getBalance } = require("../shared/token");

const { getVerifiedUserFromKV, getAllUsersFromKV, removeUserFromKV } = require("./kv-check");

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// /start command — main entry point
bot.command("start", async (ctx) => {
  const userId = ctx.from.id;

  // Check if already verified (local store first, then KV)
  const existing = store.getUser(userId) || await getVerifiedUserFromKV(userId);
  if (existing) {
    const hasBalance = await checkBalance(existing.wallet);
    if (hasBalance) {
      const inviteLink = getInviteLink();
      await ctx.reply(
        `🦞 You're already verified!\n\n` +
          `Wallet: \`${existing.wallet.slice(0, 6)}...${existing.wallet.slice(-4)}\`\n\n` +
          `Join the $CLAWD holders chat:\n👉 ${inviteLink}`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    // Balance gone
    store.removeUser(userId);
  }

  const verifyUrl = `${config.WEB_URL}/verify?tg=${userId}&chat=${config.TELEGRAM_CHAT_ID}`;

  await ctx.reply(
    `🦞 Welcome to the $CLAWD Token Gate!\n\n` +
      `To join the holders-only chat, verify you hold $CLAWD tokens:\n\n` +
      `👉 ${verifyUrl}\n\n` +
      `Connect your wallet, sign a message, and if you hold $CLAWD on Base, you'll get an invite link!`,
  );
});

// /status command
bot.command("status", async (ctx) => {
  const user = store.getUser(ctx.from.id) || await getVerifiedUserFromKV(ctx.from.id);
  if (!user) {
    await ctx.reply("❌ Not verified yet. Send /start to begin!");
    return;
  }
  const hasBalance = await checkBalance(user.wallet);
  if (hasBalance) {
    await ctx.reply(
      `✅ Verified!\n` +
        `Wallet: \`${user.wallet.slice(0, 6)}...${user.wallet.slice(-4)}\`\n` +
        `Verified: ${user.verifiedAt}`,
      { parse_mode: "Markdown" }
    );
  } else {
    store.removeUser(ctx.from.id);
    await ctx.reply(
      "❌ Your wallet no longer holds enough $CLAWD. Send /start to re-verify with a different wallet."
    );
  }
});

// Private messages that aren't commands — nudge them
bot.on("message:text", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.reply("Send /start to verify your $CLAWD tokens and get an invite link! 🦞");
});

// Hardcoded invite link — always use this
const INVITE_LINK = "https://t.me/+REDACTED";

function getInviteLink() {
  return INVITE_LINK;
}

// HTTP endpoint for Vercel to call after successful verification
// The bot polls for new verifications via the store
// Check every 5 seconds for newly verified users who need invite links
setInterval(async () => {
  const users = store.getAllUsers();
  for (const [telegramUserId, data] of Object.entries(users)) {
    if (data.inviteSent) continue;

    // New verification! Send invite link
    try {
      const inviteLink = getInviteLink();
      await bot.api.sendMessage(
        Number(telegramUserId),
        `🦞 ✅ Verified! Your wallet holds $CLAWD.\n\n` +
          `Here's your invite to the holders chat:\n👉 ${inviteLink}\n\n` +
          `Welcome aboard!`
      );
      store.markInviteSent(telegramUserId);
      console.log(`✅ Sent invite to user ${telegramUserId}`);
    } catch (err) {
      console.error(`Failed to send invite to ${telegramUserId}:`, err.message);
    }
  }
}, 5000);

// Fetch CLAWD price from DexScreener
async function fetchClawdPrice() {
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07");
    const json = await res.json();
    const price = parseFloat(json?.pairs?.[0]?.priceUsd || "0");
    return price;
  } catch (err) {
    console.error("Failed to fetch CLAWD price:", err.message);
    return 0;
  }
}

// Try to get Telegram username for a user ID
async function getTelegramHandle(userId) {
  try {
    const chat = await bot.api.getChat(Number(userId));
    return chat.username ? `@${chat.username}` : (chat.first_name || String(userId));
  } catch {
    return String(userId);
  }
}

// Generate and save HTML report
function generateHtmlReport(rows, clawdPrice, kickedCount) {
  const now = new Date().toLocaleString("en-US", { timeZone: "America/Denver" });
  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);

  const rowsHtml = rows
    .sort((a, b) => b.tokens - a.tokens)
    .map(r => `
      <tr class="${r.kicked ? 'kicked' : ''}">
        <td>${r.handle}</td>
        <td>${r.wallet}</td>
        <td class="num">${r.tokens.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
        <td class="num">$${r.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="status">${r.kicked ? '🚫 Kicked' : '✅ OK'}</td>
      </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="1800">
<title>$CLAWD Token Gate Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d0d; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { color: #ff6b6b; font-size: 1.6rem; margin-bottom: 4px; }
  .sub { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 14px 20px; min-width: 160px; }
  .stat .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .val { font-size: 1.4rem; font-weight: 700; color: #ff6b6b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; padding: 10px 12px; color: #888; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #222; }
  td { padding: 9px 12px; border-bottom: 1px solid #1a1a1a; }
  tr:hover td { background: #161616; }
  tr.kicked td { opacity: 0.45; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .status { font-weight: 600; }
  .wallet { font-family: monospace; font-size: 0.8rem; color: #666; }
  .claw { font-size: 2rem; vertical-align: middle; }
</style>
</head>
<body>
  <h1>🦞 $CLAWD Token Gate Report</h1>
  <div class="sub">Generated ${now} · CLAWD price: $${clawdPrice.toFixed(8)} · ${kickedCount} kicked this run</div>
  <div class="stats">
    <div class="stat"><div class="label">Verified Holders</div><div class="val">${rows.filter(r => !r.kicked).length}</div></div>
    <div class="stat"><div class="label">Total $CLAWD Held</div><div class="val">${(totalTokens / 1e6).toFixed(2)}M</div></div>
    <div class="stat"><div class="label">Total USD Value</div><div class="val">$${totalUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div></div>
    <div class="stat"><div class="label">Kicked This Run</div><div class="val" style="color:${kickedCount > 0 ? '#ff4444' : '#6bff6b'}">${kickedCount}</div></div>
  </div>
  <table>
    <thead><tr><th>Handle</th><th>Wallet</th><th class="num">$CLAWD</th><th class="num">USD Value</th><th>Status</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  const reportPath = path.join(__dirname, "..", "data", "report.html");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, html);
  console.log(`📊 Report written to ${reportPath}`);
  return reportPath;
}

// Periodic balance re-check — kick users who sold, generate report
async function recheckBalances() {
  console.log("Running periodic balance re-check...");

  // Merge local store + KV users (KV is the primary source for web-verified users)
  const localUsers = store.getAllUsers();
  const kvUsers = await getAllUsersFromKV();
  const allUsers = { ...kvUsers, ...localUsers }; // local takes precedence if duplicate

  const userCount = Object.keys(allUsers).length;
  if (userCount > 0) {
    console.log(`Re-checking ${userCount} verified users...`);
  }

  const clawdPrice = await fetchClawdPrice();
  const MIN = BigInt(config.CLAWD_MIN_BALANCE);
  const reportRows = [];
  let kickedCount = 0;

  for (const [telegramUserId, data] of Object.entries(allUsers)) {
    let rawBalance = 0n;
    let kicked = false;
    try { rawBalance = await getBalance(data.wallet); } catch {}

    const hasBalance = rawBalance >= MIN;

    if (!hasBalance) {
      console.log(`🚫 User ${telegramUserId} (${data.wallet?.slice(0,6)}...) no longer holds tokens — kicking`);
      try {
        await bot.api.banChatMember(Number(config.TELEGRAM_CHAT_ID), Number(telegramUserId), {
          until_date: Math.floor(Date.now() / 1000) + 60,
        });
        await bot.api.sendMessage(
          Number(telegramUserId),
          `🦞 You've been removed from the $CLAWD chat because your balance dropped.\n\nGet more $CLAWD and re-verify anytime with /start!`
        ).catch(() => {});
      } catch (e) {
        console.error(`Failed to kick ${telegramUserId}:`, e.message);
      }
      store.removeUser(telegramUserId);
      await removeUserFromKV(telegramUserId);
      kicked = true;
      kickedCount++;
    }

    const handle = await getTelegramHandle(telegramUserId);
    const tokens = Number(rawBalance) / 1e18;
    const usd = tokens * clawdPrice;
    reportRows.push({ handle, wallet: `${data.wallet?.slice(0,6)}...${data.wallet?.slice(-4)}`, tokens, usd, kicked });
  }

  generateHtmlReport(reportRows, clawdPrice, kickedCount);
}

// Watch for new members joining the group — kick if not verified with tokens
bot.on("chat_member", async (ctx) => {
  const update = ctx.chatMember;
  const chatId = String(update.chat.id);
  
  // Only care about the token-gated group
  if (chatId !== String(config.TELEGRAM_CHAT_ID)) return;
  
  // Only care about users becoming members (joined/unrestricted)
  const newStatus = update.new_chat_member.status;
  const oldStatus = update.old_chat_member.status;
  const isJoining = (oldStatus === "left" || oldStatus === "kicked") && 
                    (newStatus === "member" || newStatus === "restricted");
  if (!isJoining) return;

  const userId = update.new_chat_member.user.id;
  const username = update.new_chat_member.user.username || userId;
  
  // Check if they're verified (local store OR KV)
  const existing = store.getUser(userId) || await getVerifiedUserFromKV(userId);
  if (existing) {
    // Verified — double-check balance
    const hasBalance = await checkBalance(existing.wallet);
    if (hasBalance) {
      console.log(`✅ Verified member joined: ${username}`);
      return;
    }
    // Balance gone — kick
    store.removeUser(userId);
  }

  // Not verified or no balance — kick immediately
  console.log(`🚫 Unverified member joined: ${username} — kicking`);
  try {
    await bot.api.banChatMember(Number(chatId), userId, {
      until_date: Math.floor(Date.now() / 1000) + 60, // 60s ban = kick
    });
    await bot.api.sendMessage(userId,
      `🦞 You need to hold $CLAWD tokens to join that chat!\n\n` +
      `Verify your wallet first: /start`
    ).catch(() => {}); // DM might fail if they never messaged bot
  } catch (err) {
    console.error(`Failed to kick unverified ${username}:`, err.message);
  }
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Start
console.log("🦞 $CLAWD Token Gate Bot starting...");
bot.start({
  allowed_updates: ["message", "chat_member"],
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} is running!`);
    // Run immediately on start, then every RECHECK_INTERVAL_MS
    recheckBalances();
    setInterval(recheckBalances, config.RECHECK_INTERVAL_MS);
  },
});
