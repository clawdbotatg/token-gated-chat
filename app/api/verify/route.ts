import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { verifyNonce } from "~/lib/nonce";
import { checkBalance } from "~/lib/token";
import { saveVerifiedUser } from "~/lib/kv-store";

async function sendTelegramInvite(telegramUserId: string, wallet: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;

  try {
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

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(telegramUserId),
        text: `🦞 ✅ Verified! Your wallet holds $CLAWD.\n\nHere's your invite to the holders chat:\n👉 ${inviteLink}\n\nThis link is single-use. Welcome aboard!`,
      }),
    });

    return inviteLink;
  } catch (err: any) {
    console.error("Telegram API error:", err.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();
    if (!message || !signature) {
      return NextResponse.json({ error: "Missing message or signature" }, { status: 400 });
    }

    const siweMessage = new SiweMessage(message);
    const { data: verified } = await siweMessage.verify({ signature });

    const nonceData = verifyNonce(verified.nonce);
    if (!nonceData) {
      return NextResponse.json({ error: "Invalid or expired nonce" }, { status: 400 });
    }

    const hasBalance = await checkBalance(verified.address);
    if (!hasBalance) {
      return NextResponse.json(
        {
          error: "Insufficient $CLAWD balance. You need at least 1 $CLAWD on Base.",
          address: verified.address,
        },
        { status: 403 },
      );
    }

    // Save wallet mapping for periodic balance rechecks
    await saveVerifiedUser(nonceData.tg, verified.address);

    const inviteLink = await sendTelegramInvite(nonceData.tg, verified.address);

    console.log(`✅ Verified: tg=${nonceData.tg} wallet=${verified.address}`);

    return NextResponse.json({
      success: true,
      address: verified.address,
      telegramUserId: nonceData.tg,
      inviteSent: !!inviteLink,
    });
  } catch (err: any) {
    console.error("Verification error:", err.message);
    return NextResponse.json({ error: "Verification failed: " + err.message }, { status: 400 });
  }
}
