const { Bot, GrammyError, HttpError } = require("grammy");
const config = require("../shared/config");
const store = require("../shared/store");
const { checkBalance } = require("../shared/token");

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// /start command — main entry point
bot.command("start", async (ctx) => {
  const userId = ctx.from.id;

  // Check if already verified
  const existing = store.getUser(userId);
  if (existing) {
    const hasBalance = await checkBalance(existing.wallet);
    if (hasBalance) {
      const inviteLink = await getInviteLink();
      await ctx.reply(
        `🦞 You're already verified!\n\n` +
          `Wallet: \`${existing.wallet.slice(0, 6)}...${existing.wallet.slice(-4)}\`\n\n` +
          (inviteLink
            ? `Join the $CLAWD holders chat:\n👉 ${inviteLink}`
            : `You're verified but I couldn't generate an invite link. Ask an admin!`),
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
  const user = store.getUser(ctx.from.id);
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

// Webhook callback from Vercel when someone verifies successfully
bot.on("message:text", async (ctx) => {
  // Ignore group messages
  if (ctx.chat.type !== "private") return;

  // If not a command, just nudge them
  await ctx.reply("Send /start to verify your $CLAWD tokens and get an invite link! 🦞");
});

// Generate a one-time invite link
let _cachedInviteLink = null;
let _inviteLinkExpiry = 0;

async function getInviteLink() {
  try {
    // Create a fresh invite link each time (single-use)
    const result = await bot.api.createChatInviteLink(Number(config.TELEGRAM_CHAT_ID), {
      member_limit: 1,
      name: "CLAWD Token Gate",
    });
    return result.invite_link;
  } catch (err) {
    console.error("Failed to create invite link:", err.message);
    return null;
  }
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
      const inviteLink = await getInviteLink();
      if (inviteLink) {
        await bot.api.sendMessage(
          Number(telegramUserId),
          `🦞 ✅ Verified! Your wallet holds $CLAWD.\n\n` +
            `Here's your invite to the holders chat:\n👉 ${inviteLink}\n\n` +
            `This link is single-use. Welcome aboard!`
        );
        store.markInviteSent(telegramUserId);
        console.log(`✅ Sent invite to user ${telegramUserId}`);
      }
    } catch (err) {
      console.error(`Failed to send invite to ${telegramUserId}:`, err.message);
    }
  }
}, 5000);

// Periodic balance re-check — kick users who sold
async function recheckBalances() {
  console.log("Running periodic balance re-check...");
  const users = store.getAllUsers();
  for (const [telegramUserId, data] of Object.entries(users)) {
    const hasBalance = await checkBalance(data.wallet);
    if (!hasBalance) {
      console.log(`User ${telegramUserId} no longer holds tokens`);
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
  allowed_updates: ["message"],
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} is running!`);
    setInterval(recheckBalances, config.RECHECK_INTERVAL_MS);
  },
});
