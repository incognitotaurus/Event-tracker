const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DATA_FILE = path.join(__dirname, 'data', 'events.json');
const META_FILE = path.join(__dirname, 'data', 'meta.json');

// ── Ensure data dir exists ──────────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// ── Data helpers ───────────────────────────────────────────────────────────
function readEvents() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
}
function writeEvents(events) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2));
}
function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { return { lastScan: null, totalScans: 0 }; }
}
function writeMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API: Get all events ────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  const events = readEvents();
  const meta = readMeta();
  res.json({ events, meta });
});

// ── API: Add event ─────────────────────────────────────────────────────────
app.post('/api/events', (req, res) => {
  const events = readEvents();
  const maxId = events.reduce((m, e) => Math.max(m, e.id || 0), 0);
  const event = { id: maxId + 1, ...req.body, aiFound: false, addedAt: new Date().toISOString() };
  events.push(event);
  writeEvents(events);
  res.json(event);
});

// ── API: Update event ──────────────────────────────────────────────────────
app.put('/api/events/:id', (req, res) => {
  const events = readEvents();
  const idx = events.findIndex(e => e.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  events[idx] = { ...events[idx], ...req.body, id: events[idx].id };
  writeEvents(events);
  res.json(events[idx]);
});

// ── API: Delete event ──────────────────────────────────────────────────────
app.delete('/api/events/:id', (req, res) => {
  let events = readEvents();
  const before = events.length;
  events = events.filter(e => e.id !== parseInt(req.params.id));
  if (events.length === before) return res.status(404).json({ error: 'Not found' });
  writeEvents(events);
  res.json({ ok: true });
});

// ── AI Web Scan ────────────────────────────────────────────────────────────
let scanInProgress = false;

async function performScan(emitter) {
  if (scanInProgress) return;
  if (!ANTHROPIC_API_KEY) {
    emitter?.('error: ANTHROPIC_API_KEY is not set. Add it to your environment.');
    return;
  }

  scanInProgress = true;
  const today = new Date().toISOString().split('T')[0];
  const log = (msg, type = '') => {
    console.log(`[SCAN] ${msg}`);
    emitter?.(`${type}:${msg}`);
  };

  log('Starting AI web scan...', 'info');
  log(`Date: ${today}`, 'info');

  const queries = [
    `AI ML hackathon Bangalore ${new Date().getFullYear()}`,
    `GenAI LLM meetup Bengaluru upcoming`,
    `machine learning workshop Bangalore`,
    `AI conference Bengaluru ${new Date().getFullYear()}`,
    `data science hackathon Bangalore devfolio unstop`,
  ];

  let aggregatedContext = '';

  for (const q of queries) {
    log(`Searching: "${q}"`);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a research assistant. Today is ${today}. Use web search to find AI/ML events in Bangalore India. Return a plain-text summary listing: event name, date, venue, organizer, URL, type, description. Be factual and concise.`,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Search and summarize upcoming AI/ML events in Bangalore: ${q}. Include names, dates, venues, organizers, registration links.` }]
        })
      });

      if (!res.ok) { log(`HTTP ${res.status} on search, skipping`, 'err'); continue; }
      const data = await res.json();
      const txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      aggregatedContext += `\n\n=== ${q} ===\n${txt}`;
      log(`Results received ✓`, 'ok');
    } catch (err) {
      log(`Search error: ${err.message}`, 'err');
    }
  }

  log('Structuring events with AI...', 'info');

  const SYSTEM = `You are a structured data extractor. Today is ${today}.
Extract events from web search text and return ONLY a raw JSON array. No markdown, no explanation.

Each item:
{
  "name": "string",
  "type": "hackathon|meetup|workshop|conference",
  "org": "string",
  "date": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD or empty string",
  "venue": "string",
  "mode": "In-Person|Online|Hybrid",
  "reg": "open|limited|closed|free",
  "url": "string",
  "tags": ["string"],
  "desc": "string"
}

Rules: Only Bangalore/Bengaluru AI/ML events. Dates must be ${today} or later. Skip unclear dates. Output ONLY the JSON array.`;

  let newEvents = [];
  try {
    const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Extract events from:\n\n${aggregatedContext}` }]
      })
    });

    const parseData = await parseRes.json();
    const raw = (parseData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    newEvents = JSON.parse(clean);
    if (!Array.isArray(newEvents)) newEvents = [];
  } catch (err) {
    log(`Parse error: ${err.message}`, 'err');
    scanInProgress = false;
    return;
  }

  log(`Extracted ${newEvents.length} events`, 'ok');

  const events = readEvents();
  const existingKeys = new Set(events.map(e => `${(e.name || '').toLowerCase().trim()}|${e.date}`));
  const maxId = events.reduce((m, e) => Math.max(m, e.id || 0), 0);
  let added = 0;
  let idCounter = maxId + 1;

  const VALID_TYPES = ['hackathon', 'meetup', 'workshop', 'conference'];
  const VALID_MODES = ['In-Person', 'Online', 'Hybrid'];
  const VALID_REGS = ['open', 'limited', 'closed', 'free'];

  for (const ev of newEvents) {
    if (!ev.name || !ev.date) continue;
    const key = `${ev.name.toLowerCase().trim()}|${ev.date}`;
    if (existingKeys.has(key)) continue;
    events.push({
      id: idCounter++,
      name: ev.name,
      type: VALID_TYPES.includes(ev.type) ? ev.type : 'meetup',
      org: ev.org || '',
      date: ev.date,
      endDate: ev.endDate || '',
      venue: ev.venue || 'Bangalore',
      mode: VALID_MODES.includes(ev.mode) ? ev.mode : 'In-Person',
      reg: VALID_REGS.includes(ev.reg) ? ev.reg : 'open',
      url: ev.url || '',
      tags: Array.isArray(ev.tags) ? ev.tags.slice(0, 6) : [],
      desc: ev.desc || '',
      aiFound: true,
      scannedAt: today,
    });
    existingKeys.add(key);
    added++;
  }

  writeEvents(events);

  const meta = readMeta();
  meta.lastScan = new Date().toISOString();
  meta.totalScans = (meta.totalScans || 0) + 1;
  meta.lastAdded = added;
  writeMeta(meta);

  log(`Done! ${added} new event(s) added.`, 'ok');
  scanInProgress = false;
}

// ── API: Trigger scan (SSE streaming) ─────────────────────────────────────
app.get('/api/scan', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (line) => res.write(`data: ${line}\n\n`);

  if (scanInProgress) {
    send('err:Scan already in progress');
    res.write('data: done\n\n');
    return res.end();
  }

  performScan(send).then(() => {
    res.write('data: done\n\n');
    res.end();
  }).catch(err => {
    res.write(`data: err:${err.message}\n\n`);
    res.write('data: done\n\n');
    res.end();
  });
});

// ── API: Scan status ───────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const meta = readMeta();
  res.json({ ...meta, scanInProgress, hasApiKey: !!ANTHROPIC_API_KEY });
});

// ── Daily cron: scan at 8am IST (2:30 UTC) ────────────────────────────────
cron.schedule('30 2 * * *', () => {
  console.log('[CRON] Daily scan triggered');
  performScan();
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 BLR.AI Tracker running at http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY ? '✓ Set' : '✗ Not set — add to environment'}`);
  console.log(`   Data: ${DATA_FILE}`);
  console.log(`   Auto-scan: Daily at 8:00 AM IST\n`);
});
