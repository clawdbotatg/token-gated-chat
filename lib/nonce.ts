import crypto from "crypto";

const SECRET = process.env.NONCE_SECRET || "clawd-bouncer-default-secret-change-me";

export function createNonce(telegramUserId: string, chatId: string): string {
  const random = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ tg: telegramUserId, chat: chatId, ts: Date.now(), r: random });
  const encoded = Buffer.from(payload).toString("base64url");
  const hmac = crypto.createHmac("sha256", SECRET).update(encoded).digest("hex").slice(0, 16);
  return `${encoded}.${hmac}`;
}

export function verifyNonce(nonce: string): { tg: string; chat: string; ts: number } | null {
  const [encoded, hmac] = nonce.split(".");
  if (!encoded || !hmac) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(encoded).digest("hex").slice(0, 16);
  if (hmac !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (Date.now() - payload.ts > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
