const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { SiweMessage } = require("siwe");
const path = require("path");
const config = require("../shared/config");
const store = require("../shared/store");
const { checkBalance } = require("../shared/token");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Nonce store: { nonce: { telegramUserId, chatId, createdAt } }
const nonces = new Map();

// Clean up old nonces every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of nonces) {
    if (now - data.createdAt > 10 * 60 * 1000) nonces.delete(nonce);
  }
}, 5 * 60 * 1000);

// GET /verify — serve the verification page
app.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// GET /api/nonce — generate a nonce for SIWE
app.get("/api/nonce", (req, res) => {
  const { tg, chat } = req.query;
  if (!tg || !chat) return res.status(400).json({ error: "Missing tg or chat param" });

  const nonce = crypto.randomBytes(16).toString("hex");
  nonces.set(nonce, {
    telegramUserId: tg,
    chatId: chat,
    createdAt: Date.now(),
  });

  res.json({ nonce, telegramUserId: tg, chatId: chat });
});

// POST /api/verify — verify SIWE signature and check balance
app.post("/api/verify", async (req, res) => {
  try {
    const { message, signature } = req.body;
    if (!message || !signature) {
      return res.status(400).json({ error: "Missing message or signature" });
    }

    const siweMessage = new SiweMessage(message);
    const { data: verified } = await siweMessage.verify({ signature });

    // Check nonce
    const nonceData = nonces.get(verified.nonce);
    if (!nonceData) {
      return res.status(400).json({ error: "Invalid or expired nonce" });
    }

    // Check the statement includes the telegram user ID
    const telegramUserId = nonceData.telegramUserId;
    const chatId = nonceData.chatId;

    // Check token balance on Base
    const hasBalance = await checkBalance(verified.address);
    if (!hasBalance) {
      return res.status(403).json({
        error: "Insufficient $CLAWD balance",
        address: verified.address,
      });
    }

    // Store verification
    store.setUser(telegramUserId, verified.address, chatId);
    nonces.delete(verified.nonce);

    console.log(`✅ Verified user ${telegramUserId} with wallet ${verified.address}`);

    res.json({
      success: true,
      address: verified.address,
      telegramUserId,
    });
  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(400).json({ error: "Verification failed: " + err.message });
  }
});

// GET /api/check/:telegramUserId — check if user is verified (for bot)
app.get("/api/check/:telegramUserId", async (req, res) => {
  const user = store.getUser(req.params.telegramUserId);
  if (!user) return res.json({ verified: false });

  const hasBalance = await checkBalance(user.wallet);
  res.json({ verified: hasBalance, wallet: user.wallet });
});

app.listen(config.WEB_PORT, () => {
  console.log(`🦞 Verification server running on port ${config.WEB_PORT}`);
});
