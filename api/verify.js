const { SiweMessage } = require("siwe");
const { verifyNonce } = require("../lib/nonce");
const { checkBalance } = require("../lib/token");

async function sendTelegramInvite(telegramUserId, wallet) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    // Create single-use invite link
    const linkRes = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(chatId),
        member_limit: 1,
        name: `CLAWD Gate: ${wallet.slice(0, 8)}`,
      }),
    });
    const linkData = await linkRes.json();

    if (!linkData.ok) {
      console.error("Failed to create invite link:", linkData);
      // Still notify user
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(telegramUserId),
          text: `🦞 ✅ Verified! Your wallet holds $CLAWD.\n\nBut I couldn't generate an invite link. Please contact an admin.`,
        }),
      });
      return null;
    }

    const inviteLink = linkData.result.invite_link;

    // Send invite to user
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(telegramUserId),
        text: `🦞 ✅ Verified! Your wallet holds $CLAWD.\n\nHere's your invite to the holders chat:\n👉 ${inviteLink}\n\nThis link is single-use. Welcome aboard!`,
      }),
    });

    return inviteLink;
  } catch (err) {
    console.error("Telegram API error:", err.message);
    return null;
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

    const nonceData = verifyNonce(verified.nonce);
    if (!nonceData) {
      return res.status(400).json({ error: "Invalid or expired nonce" });
    }

    const hasBalance = await checkBalance(verified.address);
    if (!hasBalance) {
      return res.status(403).json({
        error: "Insufficient $CLAWD balance. You need at least 10M $CLAWD (~$500 worth) on Base.",
        address: verified.address,
      });
    }

    // Send invite link via Telegram
    const inviteLink = await sendTelegramInvite(nonceData.tg, verified.address);

    console.log(`✅ Verified: tg=${nonceData.tg} wallet=${verified.address}`);

    res.json({
      success: true,
      address: verified.address,
      telegramUserId: nonceData.tg,
      inviteSent: !!inviteLink,
    });
  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(400).json({ error: "Verification failed: " + err.message });
  }
};
