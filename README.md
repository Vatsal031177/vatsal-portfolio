# Vatsal Maisuria — Full Stack Portfolio

A production-ready full-stack portfolio with Node.js + Express backend, SQLite database, live analytics, contact form, and admin dashboard.

---

## Features

| Feature | Description |
|---|---|
| 📊 Live Visitor Counter | Tracks total visits, unique visitors, today's count |
| ✉️ Contact Form | Messages stored in SQLite, accessible in admin |
| ⬇️ CV Download Tracking | Counts every download |
| 🔥 Reactions | Visitors react with 🔥👏💡🚀, saved to DB |
| 🔐 Admin Dashboard | /admin — view messages, analytics, reply, delete |
| 🛡️ Security | Rate limiting, input validation, Helmet headers |

---

## Project Structure

```
vatsal-portfolio/
├── src/
│   └── server.js              # Express server + all API routes
├── public/
│   ├── index.html             # Main portfolio (frontend)
│   ├── admin.html             # Admin dashboard
│   └── vatsal-maisuria-cv.pdf ← ADD YOUR CV PDF HERE
├── data/                      # Auto-created on first run (SQLite DB lives here)
├── .env.example               # Copy to .env and configure
├── package.json
├── railway.toml               # Railway deployment config
└── README.md
```

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Open .env and set your ADMIN_PASSWORD

# 3. Add your CV
# Place your CV as: public/vatsal-maisuria-cv.pdf

# 4. Run
npm run dev       # Development (auto-restarts on changes)
npm start         # Production

# 5. Open
# Portfolio  →  http://localhost:3000
# Admin      →  http://localhost:3000/admin
```

---

## Deployment Options

### Option A — Railway (Recommended, Free)

Railway gives you a free live URL in under 2 minutes.

```bash
# Step 1: Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/Vatsal031177/vatsal-portfolio.git
git push -u origin main

# Step 2: Deploy
# 1. Go to https://railway.app → Sign up with GitHub
# 2. Click "New Project" → "Deploy from GitHub repo"
# 3. Select your vatsal-portfolio repo
# 4. Railway auto-detects Node.js — deployment starts!

# Step 3: Set environment variables in Railway dashboard
#   ADMIN_PASSWORD = your_secret_password
#   NODE_ENV = production
```

Result: Live at https://vatsal-portfolio-xxxx.up.railway.app

---

### Option B — Render (Free tier)

```bash
# Step 1: Push to GitHub (same as above)

# Step 2: Deploy on Render
# 1. Go to https://render.com → Sign up
# 2. Click "New" → "Web Service"
# 3. Connect your GitHub repo
# 4. Set Build Command: npm install
#    Start Command: npm start
# 5. Add env vars: ADMIN_PASSWORD, NODE_ENV=production
# 6. Click "Create Web Service"
```

Note: Render free tier spins down after 15 min of inactivity (30s cold start on first visit).

---

### Option C — VPS / Ubuntu Server (DigitalOcean, Hetzner ~4 EUR/month)

```bash
# On your server:

# 1. Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone your repo
git clone https://github.com/Vatsal031177/vatsal-portfolio.git
cd vatsal-portfolio
npm install

# 3. Set up environment
cp .env.example .env && nano .env

# 4. Run with PM2 (keeps app alive forever)
sudo npm install -g pm2
pm2 start src/server.js --name vatsal-portfolio
pm2 startup && pm2 save

# 5. Nginx reverse proxy (port 80/443)
sudo apt install nginx -y
# Create /etc/nginx/sites-available/vatsal with:
#   server {
#       listen 80;
#       server_name yourdomain.com;
#       location / {
#           proxy_pass http://localhost:3000;
#           proxy_set_header Host $host;
#           proxy_set_header X-Forwarded-For $remote_addr;
#       }
#   }
sudo ln -s /etc/nginx/sites-available/vatsal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# 6. Free SSL
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

### Option D — Netlify / GitHub Pages (NOT recommended)

These only serve static HTML — Node.js does not run. The contact form, analytics, and admin will NOT work.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| PORT | No | Server port (default: 3000) |
| NODE_ENV | No | Set to production when deploying |
| ADMIN_PASSWORD | YES | Password for /admin dashboard |

---

## Adding Your CV PDF

Place your exported CV file as:
  public/vatsal-maisuria-cv.pdf

The "Download CV" button serves this file and tracks every download.

---

## Admin Dashboard

1. Go to yourdomain.com/admin
2. Enter your ADMIN_PASSWORD
3. Features:
   - 30-day visit bar chart
   - Full inbox with all contact messages
   - One-click reply via email client
   - Mark messages as read / delete

---

## Updating the Site

```bash
git add .
git commit -m "Update"
git push
# Railway and Render auto-redeploy on every push!
# VPS: git pull && pm2 restart vatsal-portfolio
```
