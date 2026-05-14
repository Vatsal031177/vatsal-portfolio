require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ── DATABASE SETUP ────────────────────────────────────────────────────────────
const dataDir = process.env.RENDER ? '/data' : path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'portfolio.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    subject TEXT,
    message TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    page TEXT,
    referrer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── API ROUTES ───────────────────────────────────────────────────────────────

// Visit Tracking
app.post('/api/visit', (req, res) => {
  try {
    const { session_id, page, referrer } = req.body;
    db.prepare('INSERT INTO visits (session_id, page, referrer) VALUES (?, ?, ?)')
      .run(session_id || uuidv4(), page || '/', referrer || '');
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

// Contact Form
app.post('/api/contact', (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });
    db.prepare('INSERT INTO messages (id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), name, email, subject || 'No Subject', message);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

// AI Agent
const VATSAL_CONTEXT = "Vatsal Maisuria is a Computer Engineer in Ingolstadt, Germany. Expert in Flutter, Java, AI, and QA. 3+ years experience. 8.32 CGPA.";
app.post('/api/ai/ask', async (req, res) => {
  const { question } = req.body;
  const apiKey = process.env.AI_API_KEY;
  
  if (!apiKey) {
    return res.json({ answer: "I'm Vatsal's AI assistant. He's an expert in Flutter and AI. Contact him at vatsalde0311@gmail.com!" });
  }

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `You are VM-AI, Vatsal Maisuria's assistant. Context: ${VATSAL_CONTEXT}` },
        { role: "user", content: question }
      ]
    }, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    res.json({ answer: response.data.choices[0].message.content });
  } catch (e) { res.json({ answer: "Brain fog! Please email Vatsal directly." }); }
});

// ── ADMIN API ────────────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  if (req.headers['x-admin-key'] === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

app.get('/api/admin/stats', auth, (req, res) => {
  const totalVisits = db.prepare('SELECT COUNT(*) as n FROM visits').get().n;
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
  res.json({ totalVisits, messages });
});

// ── SERVE ────────────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Server live at http://${HOST}:${PORT}`);
  console.log(`🔑 Admin Password: ${ADMIN_PASSWORD}\n`);
});
