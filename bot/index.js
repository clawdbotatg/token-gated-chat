const { Bot, GrammyError, HttpError } = require("grammy");
const config = require("../shared/config");
const store = require("../shared/store");
const { checkBalance } = require("../shared/token");

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

// Periodic balance re-check — kick users who sold
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

  for (const [telegramUserId, data] of Object.entries(allUsers)) {
    const hasBalance = await checkBalance(data.wallet);
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
      // Remove from both stores
      store.removeUser(telegramUserId);
      await removeUserFromKV(telegramUserId);
    }
  }
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
    setInterval(recheckBalances, config.RECHECK_INTERVAL_MS);
  },
});
