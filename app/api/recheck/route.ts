import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUsers, removeVerifiedUser } from "~/lib/kv-store";
import { checkBalance } from "~/lib/token";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const RECHECK_SECRET = process.env.NONCE_SECRET!; // reuse nonce secret for auth

async function kickUser(telegramUserId: string) {
  // Ban for 60 seconds (effectively a kick — they can rejoin if re-verified)
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/banChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: Number(CHAT_ID),
      user_id: Number(telegramUserId),
      until_date: Math.floor(Date.now() / 1000) + 60,
    }),
  });

  // DM them
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: Number(telegramUserId),
      text: `🦞 You've been removed from the $CLAWD chat because your balance dropped below the minimum.\n\nGet more $CLAWD and re-verify anytime: /start`,
    }),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  // Auth: Vercel cron header OR query param secret
  const cronHeader = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const isVercelCron = cronHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isVercelCron && secret !== RECHECK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await getVerifiedUsers();
  const results: { kicked: string[]; ok: string[]; errors: string[] } = {
    kicked: [],
    ok: [],
    errors: [],
  };

  for (const [tgUserId, data] of Object.entries(users)) {
    try {
      const hasBalance = await checkBalance(data.wallet);
      if (!hasBalance) {
        await kickUser(tgUserId);
        await removeVerifiedUser(tgUserId);
        results.kicked.push(tgUserId);
        console.log(`🚫 Kicked ${tgUserId} (wallet ${data.wallet})`);
      } else {
        results.ok.push(tgUserId);
      }
    } catch (err: any) {
      results.errors.push(`${tgUserId}: ${err.message}`);
    }
  }

  console.log(`Recheck complete: ${results.ok.length} ok, ${results.kicked.length} kicked, ${results.errors.length} errors`);

  return NextResponse.json(results);
}
