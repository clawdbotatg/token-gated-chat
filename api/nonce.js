const { createNonce } = require("../lib/nonce");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { tg, chat } = req.query;
  if (!tg || !chat) return res.status(400).json({ error: "Missing tg or chat param" });

  const nonce = createNonce(tg, chat);
  res.json({ nonce, telegramUserId: tg, chatId: chat });
};
