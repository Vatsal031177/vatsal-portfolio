require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ── EMAIL SETUP ───────────────────────────────────────────────────────────────
const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_PORT == 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}) : null;

// ── DATABASE SETUP ────────────────────────────────────────────────────────────
// Ensure data directory exists BEFORE opening the database
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'portfolio.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    page TEXT DEFAULT '/',
    ip TEXT,
    user_agent TEXT,
    referrer TEXT,
    country TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cv_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'cv',
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(compression());
app.use(morgan('dev'));
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// ── RATE LIMITERS ─────────────────────────────────────────────────────────────
const contactLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 3,
  message: { error: 'Too many messages sent. Please wait 15 minutes.' }
});

const apiLimit = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 60,
  message: { error: 'Too many requests.' }
});

app.use('/api/', apiLimit);

// ── HELPER: get real IP ───────────────────────────────────────────────────────
function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.connection?.remoteAddress || 'unknown';
}

// ── API: VISIT TRACKING ───────────────────────────────────────────────────────
app.post('/api/visit', (req, res) => {
  try {
    const { session_id, page, referrer } = req.body;
    const ip = getIP(req);
    const ua = req.headers['user-agent'] || '';

    db.prepare(`
      INSERT INTO visits (session_id, page, ip, user_agent, referrer)
      VALUES (?, ?, ?, ?, ?)
    `).run(session_id || uuidv4(), page || '/', ip, ua, referrer || '');

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ── API: STATS (public) ────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    const totalVisits = db.prepare('SELECT COUNT(*) as n FROM visits').get().n;
    const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT session_id) as n FROM visits').get().n;
    const todayVisits = db.prepare(
      "SELECT COUNT(*) as n FROM visits WHERE date(created_at) = date('now')"
    ).get().n;
    const totalMessages = db.prepare('SELECT COUNT(*) as n FROM messages').get().n;
    const totalDownloads = db.prepare('SELECT COUNT(*) as n FROM cv_downloads').get().n;
    const cvDownloads = db.prepare("SELECT COUNT(*) as n FROM cv_downloads WHERE type = 'cv'").get().n;
    const clDownloads = db.prepare("SELECT COUNT(*) as n FROM cv_downloads WHERE type = 'cl'").get().n;
    const totalReactions = db.prepare('SELECT COUNT(*) as n FROM reactions').get().n;

    // Visits per day last 7 days
    const weeklyVisits = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as visits
      FROM visits
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all();

    // Top referrers
    const topReferrers = db.prepare(`
      SELECT referrer, COUNT(*) as count
      FROM visits
      WHERE referrer != '' AND referrer IS NOT NULL
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 5
    `).all();

    res.json({
      totalVisits,
      uniqueVisitors,
      todayVisits,
      totalMessages,
      totalDownloads,
      cvDownloads,
      clDownloads,
      totalReactions,
      weeklyVisits,
      topReferrers
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── API: CONTACT FORM ─────────────────────────────────────────────────────────
app.post('/api/contact', contactLimit, (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (name.length > 100 || subject.length > 200 || message.length > 2000) {
      return res.status(400).json({ error: 'Input too long.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const ip = getIP(req);
    const ua = req.headers['user-agent'] || '';
    const id = uuidv4();

    db.prepare(`
      INSERT INTO messages (id, name, email, subject, message, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), email.trim(), subject.trim(), message.trim(), ip, ua);

    // Send email notification if configured
    if (transporter) {
      transporter.sendMail({
        from: `"Portfolio" <${process.env.SMTP_USER}>`,
        to: process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER,
        subject: `New Message: ${subject}`,
        text: `From: ${name} (${email})\n\nSubject: ${subject}\n\nMessage:\n${message}`,
        html: `
          <h3>New Portfolio Message</h3>
          <p><strong>From:</strong> ${name} (${email})</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `
      }).catch(err => console.error('Email notify error:', err));
    }

    res.json({ ok: true, message: 'Message sent successfully!' });
  } catch (e) {
    console.error('Contact error:', e);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

// ── API: CV/CL DOWNLOAD TRACKING ─────────────────────────────────────────────
app.post('/api/download/:type', (req, res) => {
  try {
    const { type } = req.params;
    const ip = getIP(req);
    const ua = req.headers['user-agent'] || '';
    db.prepare('INSERT INTO cv_downloads (type, ip, user_agent) VALUES (?, ?, ?)').run(type, ip, ua);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ── API: REACTIONS ────────────────────────────────────────────────────────────
app.post('/api/react', (req, res) => {
  try {
    const { type } = req.body;
    const validTypes = ['🔥', '👏', '💡', '🚀'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid reaction' });

    const ip = getIP(req);

    // One reaction per IP per hour
    const recent = db.prepare(`
      SELECT id FROM reactions
      WHERE ip = ? AND created_at >= datetime('now', '-1 hour')
    `).get(ip);

    if (recent) return res.status(429).json({ error: 'Already reacted recently' });

    db.prepare('INSERT INTO reactions (type, ip) VALUES (?, ?)').run(type, ip);

    const counts = db.prepare(`
      SELECT type, COUNT(*) as count FROM reactions GROUP BY type
    `).all();

    res.json({ ok: true, counts });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/reactions', (req, res) => {
  try {
    const counts = db.prepare(`
      SELECT type, COUNT(*) as count FROM reactions GROUP BY type
    `).all();
    res.json(counts);
  } catch (e) {
    res.json([]);
  }
});

// ── ADMIN AUTH MIDDLEWARE ──────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-key'];
  if (auth === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── API: ADMIN - GET MESSAGES ─────────────────────────────────────────────────
app.get('/api/admin/messages', adminAuth, (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT * FROM messages ORDER BY created_at DESC
    `).all();
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── API: ADMIN - MARK MESSAGE READ ────────────────────────────────────────────
app.patch('/api/admin/messages/:id/read', adminAuth, (req, res) => {
  try {
    db.prepare('UPDATE messages SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── API: ADMIN - DELETE MESSAGE ───────────────────────────────────────────────
app.delete('/api/admin/messages/:id', adminAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── API: ADMIN - FULL STATS ───────────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, (req, res) => {
  try {
    const totalVisits = db.prepare('SELECT COUNT(*) as n FROM visits').get().n;
    const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT session_id) as n FROM visits').get().n;
    const unreadMessages = db.prepare('SELECT COUNT(*) as n FROM messages WHERE read = 0').get().n;
    const totalDownloads = db.prepare('SELECT COUNT(*) as n FROM cv_downloads').get().n;
    const cvDownloads = db.prepare("SELECT COUNT(*) as n FROM cv_downloads WHERE type = 'cv'").get().n;
    const clDownloads = db.prepare("SELECT COUNT(*) as n FROM cv_downloads WHERE type = 'cl'").get().n;

    const recentVisits = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as visits
      FROM visits WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at) ORDER BY day ASC
    `).all();

    const topPages = db.prepare(`
      SELECT page, COUNT(*) as count FROM visits
      GROUP BY page ORDER BY count DESC LIMIT 10
    `).all();

    const topReferrers = db.prepare(`
      SELECT referrer, COUNT(*) as count FROM visits
      WHERE referrer != '' AND referrer IS NOT NULL
      GROUP BY referrer ORDER BY count DESC LIMIT 10
    `).all();

    const recentMessages = db.prepare(`
      SELECT * FROM messages ORDER BY created_at DESC LIMIT 20
    `).all();

    const reactionStats = db.prepare(`
      SELECT type, COUNT(*) as count FROM reactions GROUP BY type
    `).all();

    res.json({ totalVisits, uniqueVisitors, unreadMessages, totalDownloads, cvDownloads, clDownloads, recentVisits, topPages, topReferrers, recentMessages, reactionStats });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── SERVE INDEX HTML ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎬 Vatsal Portfolio Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`🔑 Admin password: ${ADMIN_PASSWORD}\n`);
});
