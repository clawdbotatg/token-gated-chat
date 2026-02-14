const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "verified-users.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function save(data) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

// Store: { [telegramUserId]: { wallet, verifiedAt, chatId } }

function getUser(telegramUserId) {
  const data = load();
  return data[String(telegramUserId)] || null;
}

function setUser(telegramUserId, wallet, chatId) {
  const data = load();
  data[String(telegramUserId)] = {
    wallet: wallet.toLowerCase(),
    verifiedAt: new Date().toISOString(),
    chatId: String(chatId),
  };
  save(data);
}

function removeUser(telegramUserId) {
  const data = load();
  delete data[String(telegramUserId)];
  save(data);
}

function getAllUsers() {
  return load();
}

function markInviteSent(telegramUserId) {
  const data = load();
  if (data[String(telegramUserId)]) {
    data[String(telegramUserId)].inviteSent = true;
    save(data);
  }
}

module.exports = { getUser, setUser, removeUser, getAllUsers, markInviteSent };
