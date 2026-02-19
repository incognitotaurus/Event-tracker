# BLR.AI — Bangalore AI Events Tracker

A self-hosted web app that automatically scans the internet daily for AI/ML hackathons, meetups, workshops and conferences happening in Bangalore.

## Features
- 🤖 **AI-powered daily web scan** — uses Claude + web search to discover events automatically
- 📱 **Mobile-first UI** — designed for phone use with bottom sheets, touch targets
- ➕ **Manual add/edit/delete** — full CRUD for events
- 🔍 **Filter & search** — by type, keyword, upcoming/past
- 📡 **Server-Sent Events** — real-time scan progress streamed to your browser
- ⏰ **Daily cron** — auto-scans every day at 8 AM IST without you doing anything
- 💾 **File-based storage** — no database needed, just JSON files

---

## Deploy from Your Phone in 5 Minutes

### Option 1: Railway (Recommended — Free Tier Available)

1. **On your phone**, go to [railway.app](https://railway.app) and sign up with GitHub
2. Tap **"New Project"** → **"Deploy from GitHub repo"**
3. First, push this code to GitHub:
   - Install [GitHub Mobile](https://apps.apple.com/app/github/id1477376905) on your phone
   - Create a new repo, upload all these files
4. Select your repo in Railway
5. Go to **Variables** tab, add:
   ```
   ANTHROPIC_API_KEY = your_key_here
   ```
6. Railway auto-deploys. Tap the generated URL — your app is live! 🎉

### Option 2: Render (Also Free)

1. Go to [render.com](https://render.com) on your phone, sign up
2. **New** → **Web Service** → connect GitHub repo
3. Settings auto-detected from `render.yaml`
4. Add environment variable: `ANTHROPIC_API_KEY`
5. Click **Deploy** — live in ~2 minutes

### Option 3: Run Locally (on any machine)

```bash
# Install dependencies
npm install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

### Option 4: Docker

```bash
docker build -t blrai-tracker .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... blrai-tracker
```

---

## Getting Your Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in → **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)
4. Paste it as the `ANTHROPIC_API_KEY` environment variable

---

## How the Auto-Scan Works

Every day at **8:00 AM IST**, the server:
1. Runs 5 targeted web searches via Claude's web search tool
2. Searches for: hackathons, meetups, workshops, and conferences in Bangalore
3. A second Claude call parses the raw results into structured event data
4. New events (deduped by name + date) are added to `data/events.json`

You can also trigger a manual scan anytime by tapping **"Scan"** in the app.

---

## File Structure

```
blrai-app/
├── server.js          # Express server + API routes + cron job
├── package.json
├── Dockerfile
├── railway.toml       # Railway config
├── render.yaml        # Render config
├── .gitignore
├── data/
│   ├── events.json    # Your events (auto-created)
│   └── meta.json      # Scan metadata (auto-created)
└── public/
    └── index.html     # Full mobile web app
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | Get all events + meta |
| POST | `/api/events` | Add a new event |
| PUT | `/api/events/:id` | Update an event |
| DELETE | `/api/events/:id` | Delete an event |
| GET | `/api/scan` | Trigger scan (SSE stream) |
| GET | `/api/status` | Check scan status |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Your Anthropic API key |
| `PORT` | No | Server port (default: 3000) |
