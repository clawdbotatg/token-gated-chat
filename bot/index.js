const { Bot, GrammyError, HttpError } = require("grammy");
const config = require("../shared/config");
const store = require("../shared/store");
const { checkBalance } = require("../shared/token");

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Track pending verifications: { telegramUserId: { chatId, timeout } }
const pending = new Map();

// New member joins — send verification link
bot.on("chat_member", async (ctx) => {
  const update = ctx.chatMember;
  const wasNotMember = ["left", "kicked"].includes(update.old_chat_member.status);
  const isMember = ["member", "restricted"].includes(update.new_chat_member.status);

  if (!wasNotMember || !isMember) return;

  const userId = update.new_chat_member.user.id;
  const chatId = update.chat.id;
  const firstName = update.new_chat_member.user.first_name;

  // Check if already verified with valid balance
  const existing = store.getUser(userId);
  if (existing) {
    const hasBalance = await checkBalance(existing.wallet);
    if (hasBalance) {
      console.log(`User ${userId} already verified with wallet ${existing.wallet}`);
      return;
    }
    // Balance gone — remove verification
    store.removeUser(userId);
  }

  const verifyUrl = `${config.WEB_URL}/verify?tg=${userId}&chat=${chatId}`;

  try {
    await bot.api.sendMessage(
      userId,
      `🦞 Welcome! To join the $CLAWD holders chat, verify your token ownership:\n\n` +
        `👉 ${verifyUrl}\n\n` +
        `You have ${config.VERIFICATION_TIMEOUT_MS / 60000} minutes to verify or you'll be removed.`
    );
  } catch (err) {
    // Can't DM user — send in group
    console.log(`Can't DM user ${userId}, sending in group`);
    try {
      await bot.api.sendMessage(
        chatId,
        `Welcome ${firstName}! Please DM me @${(await bot.api.getMe()).username} to get your verification link, ` +
          `or open this link: ${verifyUrl}\n\n` +
          `Verify within ${config.VERIFICATION_TIMEOUT_MS / 60000} minutes or you'll be removed.`
      );
    } catch (e) {
      console.error("Failed to send group message:", e.message);
    }
  }

  // Set timeout to kick
  const timeout = setTimeout(async () => {
    pending.delete(userId);
    const user = store.getUser(userId);
    if (!user) {
      console.log(`Kicking unverified user ${userId} from ${chatId}`);
      try {
        await bot.api.banChatMember(chatId, userId, {
          until_date: Math.floor(Date.now() / 1000) + 60, // unban after 60s so they can retry
        });
      } catch (e) {
        console.error(`Failed to kick ${userId}:`, e.message);
      }
    }
  }, config.VERIFICATION_TIMEOUT_MS);

  pending.set(userId, { chatId, timeout });
});

// /start command — show info
bot.command("start", async (ctx) => {
  const args = ctx.match;
  if (args && args.startsWith("verify_")) {
    const parts = args.split("_");
    const chatId = parts[1];
    const verifyUrl = `${config.WEB_URL}/verify?tg=${ctx.from.id}&chat=${chatId}`;
    await ctx.reply(
      `🦞 Verify your $CLAWD token ownership:\n\n👉 ${verifyUrl}`
    );
    return;
  }

  await ctx.reply(
    `🦞 I'm the $CLAWD Token Gate Bot!\n\n` +
      `I verify that members of token-gated chats hold the required tokens.\n\n` +
      `If you just joined a gated chat, you should have received a verification link.`
  );
});

// /status command — check verification status
bot.command("status", async (ctx) => {
  const user = store.getUser(ctx.from.id);
  if (!user) {
    await ctx.reply("❌ You are not verified. Join a gated chat to start verification.");
    return;
  }
  const hasBalance = await checkBalance(user.wallet);
  await ctx.reply(
    `✅ Verified!\n` +
      `Wallet: ${user.wallet.slice(0, 6)}...${user.wallet.slice(-4)}\n` +
      `Verified at: ${user.verifiedAt}\n` +
      `Balance OK: ${hasBalance ? "✅" : "❌ (you may be removed at next check)"}`
  );
});

// Periodic balance re-check
async function recheckBalances() {
  console.log("Running periodic balance re-check...");
  const users = store.getAllUsers();
  for (const [telegramUserId, data] of Object.entries(users)) {
    const hasBalance = await checkBalance(data.wallet);
    if (!hasBalance) {
      console.log(`User ${telegramUserId} no longer holds tokens, removing from chat ${data.chatId}`);
      try {
        await bot.api.banChatMember(Number(data.chatId), Number(telegramUserId), {
          until_date: Math.floor(Date.now() / 1000) + 60,
        });
        store.removeUser(telegramUserId);
        // Try to notify user
        try {
          await bot.api.sendMessage(
            Number(telegramUserId),
            `🦞 You've been removed from the $CLAWD holders chat because your token balance is now insufficient.\n\n` +
              `Get more $CLAWD and rejoin anytime!`
          );
        } catch (_) {}
      } catch (e) {
        console.error(`Failed to kick ${telegramUserId}:`, e.message);
      }
    }
  }
}

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
  allowed_updates: ["chat_member", "message"],
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} is running!`);
    // Start periodic re-checks
    setInterval(recheckBalances, config.RECHECK_INTERVAL_MS);
  },
});
