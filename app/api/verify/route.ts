import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { verifyNonce } from "~/lib/nonce";
import { checkBalance } from "~/lib/token";
import { saveVerifiedUser } from "~/lib/kv-store";

const HARDCODED_INVITE_LINK = process.env.TELEGRAM_INVITE_LINK;
if (!HARDCODED_INVITE_LINK) {
  console.error("FATAL: TELEGRAM_INVITE_LINK env var is not set — invite links will not work");
}

async function sendTelegramInvite(telegramUserId: string, wallet: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !HARDCODED_INVITE_LINK) return null;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(telegramUserId),
        text: `🦞 ✅ Verified! Your wallet holds $CLAWD.\n\nHere's your invite to the holders chat:\n👉 ${HARDCODED_INVITE_LINK}\n\nWelcome aboard!`,
      }),
    });

    return HARDCODED_INVITE_LINK;
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
          error: "Insufficient $CLAWD balance. You need at least 10,000,000 $CLAWD on Base.",
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
      inviteLink: HARDCODED_INVITE_LINK,
    });
  } catch (err: any) {
    console.error("Verification error:", err.message);
    return NextResponse.json({ error: "Verification failed: " + err.message }, { status: 400 });
  }
}
