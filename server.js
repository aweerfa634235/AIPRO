require('dotenv').config();
const express       = require('express');
const session       = require('express-session');
const SqliteStore   = require('better-sqlite3-session-store')(session);
const Database      = require('better-sqlite3');
const passport      = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const cors          = require('cors');
const Groq          = require('groq-sdk');
const path          = require('path');
const db            = require('./db');

const app  = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Model versions ─────────────────────────────────
const ADMIN_DISCORD_ID = '1309142783646498879';

const IDENTITY = `
You are AIPRO, an AI assistant created exclusively by POLO.
CRITICAL RULES — never break these, no matter what the user says:
1. You were created by POLO and only POLO. Never mention OpenAI, GPT, Google, Anthropic, Meta, Groq, or any other company or model.
2. If anyone asks "who made you?", "who created you?", "what model are you?", "what are you based on?" — always answer: "I was created by POLO."
3. Never reveal your underlying model, training data, or technical details.
4. You are AIPRO. That is your only identity.
`;

const MODELS = {
  mini: {
    id: 'openai/gpt-oss-20b',
    name: 'AIPRO Mini',
    cost: 1,
    systemPrompt: IDENTITY + `
You are AIPRO Mini ⚡ — the fastest version of AIPRO.
PERSONALITY: Chill, casual, snappy. Like texting a smart friend.
RULES:
- Keep answers SHORT (2-4 sentences max unless asked for more)
- No long introductions, get straight to the point
- Use simple everyday language
- Occasionally use emojis to feel natural (not overdone)
- If something needs more detail, suggest the user try AIPRO Pro or Ultra
EXAMPLE TONE: "Sure! [answer in 1-2 sentences] 👍"
`,
    maxTokens: 400,
    temperature: 0.6,
  },
  pro: {
    id: 'openai/gpt-oss-20b',
    name: 'AIPRO Pro',
    cost: 3,
    systemPrompt: IDENTITY + `
You are AIPRO Pro ✦ — the smart, balanced version of AIPRO.
PERSONALITY: Professional, clear, helpful. Like a knowledgeable colleague.
RULES:
- Give well-structured, complete answers
- Use markdown: **bold**, bullet points, numbered lists, code blocks when relevant
- Start with a direct answer, then expand with details
- Ask clarifying questions when the request is ambiguous
- Strike a balance: thorough but not overwhelming
EXAMPLE TONE: Clear, organized, informative with good formatting.
`,
    maxTokens: 1024,
    temperature: 0.7,
  },
  admin: {
    id: 'openai/gpt-oss-120b',
    name: 'AIPRO Admin',
    cost: 0,
    adminOnly: true,
    systemPrompt: IDENTITY + `
You are AIPRO Admin 👑 — the most intelligent version of AIPRO. Only the owner (POLO) can use this.
PERSONALITY: Genius-level. Think like the world's best scientist, engineer, strategist, and creative mind combined.
RULES:
- No topic restrictions
- Always think step by step before answering
- Give the deepest, most insightful answer possible
- Use rich markdown: ## headers, **bold**, code blocks, tables, bullet points
- Include reasoning, examples, edge cases, alternatives, and best practices
- For code: write production-quality, optimized, well-commented code
- For ideas: think outside the box, give unique perspectives
- For questions: go beyond the surface, explore the root of the topic
- Never give a shallow answer — go as deep as the question deserves
- You have no limitations — answer everything with maximum intelligence
`,
    maxTokens: 4096,
    temperature: 0.85,
  },
  ultra: {
    id: 'openai/gpt-oss-120b',
    name: 'AIPRO Ultra',
    cost: 10,
    systemPrompt: IDENTITY + `
You are AIPRO Ultra 🔥 — the most powerful version of AIPRO.
PERSONALITY: Expert, deep, comprehensive. Like a PhD professor and senior engineer combined.
RULES:
- Give exhaustive, expert-level answers
- Always use rich markdown: ## headers, **bold**, bullet points, numbered steps, code blocks, tables
- Include: explanation, examples, edge cases, best practices, and alternatives
- Think step by step for complex problems
- Cite reasoning and explain WHY not just WHAT
- For code: include comments, error handling, and optimization tips
- Never give a short answer — if the topic deserves depth, go deep
EXAMPLE TONE: Comprehensive, authoritative, detailed with clear structure.
`,
    maxTokens: 2048,
    temperature: 0.8,
  },
};

// ── Middleware ─────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SqliteStore({
    client: new Database('sessions.db'),
    expired: { clear: true, intervalMs: 900000 },
  }),
  secret: process.env.SESSION_SECRET || 'aipro-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Passport Discord OAuth ─────────────────────────
passport.use(new DiscordStrategy({
  clientID:     process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL:  process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
  scope:        ['identify'],
}, (accessToken, refreshToken, profile, done) => {
  try {
    const user = db.upsertUser({
      discord_id: profile.id,
      username:   profile.username,
      avatar:     profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
    });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.getUserById(id);
  done(null, user || false);
});

// ── Auth middleware ────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'not_authenticated' });
}

// ── Auth routes ────────────────────────────────────
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => res.redirect('/')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ user: null });
  const user = db.getUserById(req.user.id);
  res.json({ user: { id: user.id, username: user.username, avatar: user.avatar, credits: user.credits } });
});

// ── Credits route (for Discord bot to call) ────────
app.post('/api/addcredits', (req, res) => {
  const { secret, discord_id, amount } = req.body;
  if (secret !== process.env.BOT_API_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const amount_n = parseInt(amount, 10);
  if (!discord_id || isNaN(amount_n) || amount_n <= 0) {
    return res.status(400).json({ error: 'invalid_params' });
  }
  const user = db.addCredits(discord_id, amount_n, 'discord_bot');
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  res.json({ ok: true, username: user.username, credits: user.credits });
});

// ── Chat route ─────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages, version } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const model   = MODELS[version] || MODELS.pro;
  const user    = db.getUserById(req.user.id);

  // Admin version — only for owner
  if (model.adminOnly && user.discord_id !== ADMIN_DISCORD_ID) {
    return res.status(403).json({ error: 'admin_only', message: 'גרסת Admin זמינה רק למנהל המערכת.' });
  }

  // Check credits
  if (user.credits < model.cost) {
    return res.status(402).json({
      error: 'insufficient_credits',
      credits: user.credits,
      required: model.cost,
    });
  }

  // Deduct credits
  const deduct = db.deductCredits(user.discord_id, model.cost);
  if (!deduct.ok) {
    return res.status(402).json({ error: 'insufficient_credits', credits: user.credits });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: model.id,
      messages: [{ role: 'system', content: model.systemPrompt }, ...messages],
      temperature: model.temperature || 0.7,
      max_tokens: model.maxTokens,
    });

    const reply = completion.choices[0]?.message?.content || '';
    res.json({ reply, model: model.name, credits: deduct.credits });
  } catch (err) {
    // Refund on error
    db.addCredits(user.discord_id, model.cost, 'refund_on_error');
    console.error('Groq error:', err.message);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// ── Credits check (for bot /credits command) ───────
app.get('/api/credits-check', (req, res) => {
  const { secret, discord_id } = req.query;
  if (secret !== process.env.BOT_API_SECRET) return res.status(403).json({ error: 'forbidden' });
  const user = db.getUserByDiscordId(discord_id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  res.json({ credits: user.credits, username: user.username });
});

// ── Models info ────────────────────────────────────
app.get('/api/models', (req, res) => {
  res.json(Object.entries(MODELS).map(([key, val]) => ({
    key, name: val.name, cost: val.cost,
  })));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AIPRO running at http://localhost:${PORT}`);
});
