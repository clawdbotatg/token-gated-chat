const crypto = require("crypto");

const SECRET = process.env.NONCE_SECRET || "clawd-bouncer-default-secret-change-me";

// Create a signed nonce that embeds telegramUserId + chatId + timestamp
function createNonce(telegramUserId, chatId) {
  const random = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ tg: telegramUserId, chat: chatId, ts: Date.now(), r: random });
  const encoded = Buffer.from(payload).toString("base64url");
  const hmac = crypto.createHmac("sha256", SECRET).update(encoded).digest("hex").slice(0, 16);
  return `${encoded}.${hmac}`;
}

// Verify and decode a nonce — returns { tg, chat, ts } or null
function verifyNonce(nonce) {
  const [encoded, hmac] = nonce.split(".");
  if (!encoded || !hmac) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(encoded).digest("hex").slice(0, 16);
  if (hmac !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    // Expire after 10 minutes
    if (Date.now() - payload.ts > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { createNonce, verifyNonce };
