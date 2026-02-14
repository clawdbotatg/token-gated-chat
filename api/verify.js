const { SiweMessage } = require("siwe");
const { verifyNonce } = require("../lib/nonce");
const { checkBalance } = require("../lib/token");

// After successful verification, use Telegram Bot API to unban the user
async function notifyBot(telegramUserId, chatId, wallet) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log(`✅ Verified (no bot token): tg=${telegramUserId} wallet=${wallet}`);
    return;
  }

  try {
    // Send confirmation DM to user
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text: `🦞 Verified! Your wallet ${wallet.slice(0, 6)}...${wallet.slice(-4)} holds $CLAWD.\n\nYou now have access to the chat. Welcome aboard!`,
      }),
    });
    console.log(`✅ Verified: tg=${telegramUserId} wallet=${wallet} chat=${chatId}`);
  } catch (err) {
    console.error("Failed to notify user:", err.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, signature } = req.body;
    if (!message || !signature) {
      return res.status(400).json({ error: "Missing message or signature" });
    }

    const siweMessage = new SiweMessage(message);
    const { data: verified } = await siweMessage.verify({ signature });

    // Verify the nonce is valid and extract telegram data
    const nonceData = verifyNonce(verified.nonce);
    if (!nonceData) {
      return res.status(400).json({ error: "Invalid or expired nonce" });
    }

    // Check token balance on Base
    const hasBalance = await checkBalance(verified.address);
    if (!hasBalance) {
      return res.status(403).json({
        error: "Insufficient $CLAWD balance. You need at least 1 $CLAWD token on Base.",
        address: verified.address,
      });
    }

    await notifyBot(nonceData.tg, nonceData.chat, verified.address);

    res.json({
      success: true,
      address: verified.address,
      telegramUserId: nonceData.tg,
    });
  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(400).json({ error: "Verification failed: " + err.message });
  }
};
