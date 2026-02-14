import { NextRequest, NextResponse } from "next/server";
import { createNonce } from "~/lib/nonce";

export async function GET(req: NextRequest) {
  const tg = req.nextUrl.searchParams.get("tg");
  const chat = req.nextUrl.searchParams.get("chat");

  if (!tg || !chat) {
    return NextResponse.json({ error: "Missing tg or chat param" }, { status: 400 });
  }

  const nonce = createNonce(tg, chat);
  return NextResponse.json({ nonce, telegramUserId: tg, chatId: chat });
}
