require("dotenv").config();

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  WEB_PORT: parseInt(process.env.WEB_PORT || "3000"),
  WEB_URL: process.env.WEB_URL || "http://localhost:3000",
  CLAWD_TOKEN_ADDRESS: process.env.CLAWD_TOKEN_ADDRESS || "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07",
  CLAWD_MIN_BALANCE: BigInt(process.env.CLAWD_MIN_BALANCE || "1"),
  BASE_RPC_URL: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  VERIFICATION_TIMEOUT_MS: parseInt(process.env.VERIFICATION_TIMEOUT_MINUTES || "10") * 60 * 1000,
  RECHECK_INTERVAL_MS: parseInt(process.env.RECHECK_INTERVAL_MINUTES || "300") * 60 * 1000,
};
