// Check KV store for verified users (reads from Vercel's Upstash Redis)
const { Redis } = require("@upstash/redis");

let redis = null;

function getRedis() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    redis = new Redis({ url, token });
  }
  return redis;
}

async function getVerifiedUserFromKV(telegramUserId) {
  const r = getRedis();
  if (!r) return null;
  try {
    const data = await r.hget("verified-users", String(telegramUserId));
    return data || null;
  } catch (err) {
    console.error("KV read error:", err.message);
    return null;
  }
}

module.exports = { getVerifiedUserFromKV };
