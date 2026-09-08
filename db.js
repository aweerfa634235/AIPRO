const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'aipro.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    discord_id  TEXT UNIQUE NOT NULL,
    username    TEXT NOT NULL,
    avatar      TEXT,
    credits     INTEGER NOT NULL DEFAULT 50,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS credit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    change      INTEGER NOT NULL,
    reason      TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// ── users ──────────────────────────────────────────

function upsertUser({ discord_id, username, avatar }) {
  const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discord_id);
  if (existing) {
    db.prepare('UPDATE users SET username=?, avatar=? WHERE discord_id=?')
      .run(username, avatar, discord_id);
    return db.prepare('SELECT * FROM users WHERE discord_id=?').get(discord_id);
  }
  const id = discord_id;
  db.prepare('INSERT INTO users (id, discord_id, username, avatar, credits) VALUES (?,?,?,?,50)')
    .run(id, discord_id, username, avatar);
  addCreditLog(id, 50, 'welcome_bonus');
  return db.prepare('SELECT * FROM users WHERE id=?').get(id);
}

function getUserByDiscordId(discord_id) {
  return db.prepare('SELECT * FROM users WHERE discord_id=?').get(discord_id);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id=?').get(id);
}

// ── credits ────────────────────────────────────────

function addCredits(discord_id, amount, reason = 'admin') {
  const user = getUserByDiscordId(discord_id);
  if (!user) return null;
  db.prepare('UPDATE users SET credits = credits + ? WHERE discord_id=?').run(amount, discord_id);
  addCreditLog(user.id, amount, reason);
  return db.prepare('SELECT * FROM users WHERE discord_id=?').get(discord_id);
}

function deductCredits(discord_id, amount) {
  const user = getUserByDiscordId(discord_id);
  if (!user) return { ok: false, reason: 'user_not_found' };
  if (user.credits < amount) return { ok: false, reason: 'insufficient_credits', credits: user.credits };
  db.prepare('UPDATE users SET credits = credits - ? WHERE discord_id=?').run(amount, discord_id);
  addCreditLog(user.id, -amount, 'ai_usage');
  return { ok: true, credits: user.credits - amount };
}

function addCreditLog(user_id, change, reason) {
  db.prepare('INSERT INTO credit_log (user_id, change, reason) VALUES (?,?,?)').run(user_id, change, reason);
}

module.exports = { upsertUser, getUserByDiscordId, getUserById, addCredits, deductCredits };
