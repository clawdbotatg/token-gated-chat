// One-off script: send invite link to all verified KV users who still hold $CLAWD
// Run from token-gated-chat dir: node blast-invite.js

require("dotenv").config();
const { Redis } = require("@upstash/redis");
const { ethers } = require("ethers");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const INVITE_LINK = process.env.TELEGRAM_INVITE_LINK;
if (!INVITE_LINK) { console.error("TELEGRAM_INVITE_LINK not set in .env"); process.exit(1); }
const CLAWD_TOKEN = process.env.CLAWD_TOKEN_ADDRESS;
const MIN_BALANCE = BigInt(process.env.CLAWD_MIN_BALANCE || "10000000000000000000000000");
const RPC_URL = process.env.BASE_RPC_URL;

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const provider = new ethers.JsonRpcProvider(RPC_URL);
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const tokenContract = new ethers.Contract(CLAWD_TOKEN, ERC20_ABI, provider);

async function sendMessage(telegramUserId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(telegramUserId), text }),
  });
  return res.json();
}

async function main() {
  console.log("📋 Fetching all verified users from KV...");
  const users = await redis.hgetall("verified-users");
  if (!users || Object.keys(users).length === 0) {
    console.log("No users found in KV.");
    return;
  }

  const total = Object.keys(users).length;
  console.log(`Found ${total} users. Checking balances and sending invites...\n`);

  let sent = 0, skipped = 0, noBalance = 0, failed = 0;

  for (const [telegramUserId, data] of Object.entries(users)) {
    // Parse data (may be string or object depending on Redis client)
    const userData = typeof data === "string" ? JSON.parse(data) : data;
    const wallet = userData?.wallet;

    if (!wallet) {
      console.log(`⚠️  User ${telegramUserId} — no wallet stored, skipping`);
      skipped++;
      continue;
    }

    // Check balance
    let hasBalance = false;
    try {
      const balance = await tokenContract.balanceOf(wallet);
      hasBalance = balance >= MIN_BALANCE;
    } catch (err) {
      console.log(`⚠️  User ${telegramUserId} — balance check failed: ${err.message}`);
      skipped++;
      continue;
    }

    if (!hasBalance) {
      console.log(`❌ User ${telegramUserId} (${wallet.slice(0,6)}...) — no longer holds enough $CLAWD, skipping`);
      noBalance++;
      continue;
    }

    // Send the invite
    try {
      const result = await sendMessage(
        telegramUserId,
        `🦞 Hey! You verified your $CLAWD wallet but may not have received your invite link.\n\nHere it is:\n👉 ${INVITE_LINK}\n\nWelcome to the holders chat!`
      );
      if (result.ok) {
        console.log(`✅ Sent invite to user ${telegramUserId} (${wallet.slice(0,6)}...)`);
        sent++;
      } else {
        console.log(`❌ Failed to send to ${telegramUserId}: ${result.description}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ Error sending to ${telegramUserId}: ${err.message}`);
      failed++;
    }

    // Small delay to avoid hitting Telegram rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n📊 Done!`);
  console.log(`  ✅ Sent: ${sent}`);
  console.log(`  ❌ No balance: ${noBalance}`);
  console.log(`  ⚠️  Skipped: ${skipped}`);
  console.log(`  💥 Failed: ${failed}`);
}

main().catch(console.error);
