import express from "express";
import dotenv from "dotenv";
import fetch, { FormData, Blob } from "node-fetch";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import https from 'https';
import nacl from 'tweetnacl';
import { warmShareRenderer, generateShareImageFast } from './boardpng.js';
import crypto from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { BaseInteraction, Client, InteractionResponse, InteractionWebhook, MessagePayload, User } from 'discord.js';
dotenv.config({ path: ".env" });

const app = express();
console.log('[Server] VITE_DISCORD_CLIENT_ID env at start:', process.env.VITE_DISCORD_CLIENT_ID ? String(process.env.VITE_DISCORD_CLIENT_ID) : '(missing)');
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Global error visibility
process.on('unhandledRejection', (r) => {
  console.error('Unhandled rejection:', r);
});
process.on('uncaughtException', (e) => {
  console.error('Uncaught exception:', e);
});


// --- Persistence Layer (JSON file) ---
// Data stored at ./data/userdata.json as { userId: { key: value, ... }, ... }
const dataDir = process.env.DATA_DIR || './data';
const dataFile = join(dataDir, 'userdata.json');
let httpsOptions = null;
try {
  const certDir = '/mounts/letsencrypt/live/serwer.gtadubbing.pl';
  httpsOptions = {
    key: readFileSync(join(certDir, 'privkey.pem')),
    cert: readFileSync(join(certDir, 'fullchain.pem')),
  };
  const originalListen = app.listen.bind(app);
  app.listen = function (port, ...rest) {
    if (httpsOptions) {
      const server = https.createServer(httpsOptions, app);
      return server.listen(port, ...rest);
    }
    return originalListen(port, ...rest);
  };
  console.log('Loaded SSL certificates for serwer.gtadubbing.pl');
} catch (e) {
  console.warn('Could not load SSL certificates, falling back to HTTP:', e.message);
}
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
let userStore = {};
if (existsSync(dataFile)) {
  try { userStore = JSON.parse(readFileSync(dataFile, 'utf8')); } catch { userStore = {}; }
}
function persist () {
  try { writeFileSync(dataFile, JSON.stringify(userStore, null, 2)); } catch (e) { console.error('Persist error', e); }
}

// --- Interactions (custom Entry Point handler) ---
// Register before JSON body parser to preserve raw body for signature verification
const DISCORD_PUBLIC_KEY = process.env.INTERACTIONS_PUBLIC_KEY;
app.post('/interactions', express.raw({ type: '*/*' }), (req, res) => {
  try {
    //print all data about the request
    console.log('Interaction received:', req.body.toString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));

    if (!DISCORD_PUBLIC_KEY) {
      return res.status(500).json({ error: 'INTERACTIONS_PUBLIC_KEY not set' });
    }
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    if (!signature || !timestamp) {
      return res.status(401).send('invalid request signature');
    }
    const body = req.body instanceof Buffer ? req.body : Buffer.from(req.body);
    const isVerified = nacl.sign.detached.verify(
      Buffer.from(timestamp + body.toString()),
      Buffer.from(signature, 'hex'),
      Buffer.from(DISCORD_PUBLIC_KEY, 'hex')
    );
    if (!isVerified) return res.status(401).send('bad signature');

    const interaction = JSON.parse(body.toString());
    if (interaction.type === 1) return res.json({ type: 1 }); // Ping
    const interactionToken = interaction.token;
    const interactionId = interaction.id;
    const client = new Client({ intents: 0 });
    let interactionObject = new BaseInteraction(client, interaction);

    // Immediate Entry Point handling for slash command invocations
    if (interaction.type === 2) { // APPLICATION_COMMAND (includes Activity Entry Point commands)
      try {


        const userObj = interaction.member?.user || interaction.user;
        const userId = userObj?.id;
        const globalName = userObj?.global_name || userObj?.username || 'Użytkownik';
        const avatarHash = userObj?.avatar;
        const avatarUrl = avatarHash
          ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=256`
          : `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`;

        // Do all heavy work asynchronously; respond immediately to avoid timeouts
        setImmediate(async () => {
          try {
            // Detect Activity Entry Point command vs normal slash
            const isActivityEntry = interaction.data?.application_command?.type === 4 || interaction.data?.type === 4;
            let mode = 'daily';
            let length = 5;
            if (!isActivityEntry) {
              try {
                const opts = interaction.data?.options || [];
                for (const o of opts) {
                  if (o.name === 'mode' && typeof o.value === 'string') mode = o.value;
                  if (o.name === 'length' && typeof o.value === 'number') length = Math.max(4, Math.min(7, o.value));
                }
              } catch { }
            }
            if (!isUserCompleted(userId, mode)) {
              upsertSessionStartOrJoin(channelId, {
                guildId, mode, starterUserId: userId,
                user: { userId, globalName, avatarUrl, length }
              });
              await renderAndSendOrEditSession(channelId);
            }
          } catch (e) {
            console.error('EntryPoint async error:', e);
          }
        });

        // Respond with Launch Activity per User Actions (handler attached to command definition). Minimal body.
        return res.json({ type: 24 });
      } catch (e) {
        console.error('EntryPoint sync error:', e);
        return res.json({ type: 24 });
      }
    }

    // Handle Activity launch/join from the channel context
    const channelId = interaction.channel_id;
    const guildId = interaction.guild_id;
    const userObj = interaction.member?.user || interaction.user;
    const userId = userObj?.id;
    const globalName = userObj?.global_name || userObj?.username || 'Użytkownik';
    const avatarHash = userObj?.avatar;
    const avatarUrl = avatarHash
      ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`; // default

    // Parse mode & word length (optional) from command options if present
    // Defaults: mode='daily', length=5
    let mode = 'daily';
    let length = 5;
    try {
      const opts = interaction.data?.options || [];
      for (const o of opts) {
        if (o.name === 'mode' && typeof o.value === 'string') mode = o.value;
        if (o.name === 'length' && typeof o.value === 'number') length = Math.max(4, Math.min(7, o.value));
      }
    } catch { }

    if (isUserCompleted(userId, mode)) {
      // Don’t launch if user already completed current słówko
      return res.json({ type: 4, data: { flags: 64, content: 'Już ukończyłeś bieżące Słówko.' } });
    }

    // Ensure session and add/join user
    upsertSessionStartOrJoin(channelId, {
      guildId, mode, starterUserId: userId,
      user: { userId, globalName, avatarUrl, length }
    });

    // Render and send/edit a rich image message asynchronously with bot token
    setImmediate(async () => {
      try { await renderAndSendOrEditSession(channelId); } catch (e) { console.error('Render/send failed:', e); }
    });

    // Fallback for other interaction types: launch activity (minimal)
    return res.json({ type: 24, data: { handler: 1 } });
  } catch (e) {
    console.error('Interactions error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Allow express to parse JSON bodies for the rest of the API
app.use(express.json());
// ---- Słówko Activity sessions ----
// Per-channel session state (never remove players; reset only on new start)
const sessions = new Map(); // channelId -> { mode, startedAt, endedAt?, players: [{userId,globalName,avatarUrl,avatarLocal?, length, state}], messageId?, guildId, instanceId? }
const instanceToChannel = new Map(); // instanceId -> channelId

function replyToInteraction (interactionId, interactionToken, data) {
  return fetch(`https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

function getDisplayForActive (players) {
  if (!players.length) return '';
  if (players.length === 1) return `${players[0].globalName} gra teraz w słówko`;
  if (players.length === 2) return `${players[0].globalName} i ${players[1].globalName} grają teraz w słówko`;
  const names = players.map(p => p.globalName);
  const last = names.pop();
  return `${names.join(', ')} i ${last} grają teraz w słówko`;
}
function getDisplayForEnded (players) {
  const names = players.map(p => p.globalName).join(' ');
  return `${names} grali w Słówko`;
}

function upsertSessionStartOrJoin (channelId, { guildId, mode, starterUserId, user }) {
  let s = sessions.get(channelId);
  if (!s || s.endedAt) {
    s = { mode: mode || 'daily', startedAt: Date.now(), players: [], guildId, messageId: null };
    sessions.set(channelId, s);
  }
  // Session mode fixed per start
  s.mode = s.mode || mode || 'daily';
  // Add user if missing (never remove later)
  if (!s.players.find(p => p.userId === user.userId)) {
    s.players.push({ userId: user.userId, globalName: user.globalName, avatarUrl: user.avatarUrl, length: user.length || 5, state: makeBlankState(user.length || 5) });
  }
}
async function resolveChannelFromReq (reqBody, reqHeaders) {
  let { channelId, instanceId, userId } = reqBody || {};
  if (!channelId && instanceId) channelId = instanceToChannel.get(instanceId);
  if (!userId) {
    const prof = await getUserProfileFromToken((reqHeaders && reqHeaders['authorization']) || '');
    if (prof) userId = prof.userId;
  }
  if (!channelId && userId) {
    // Try to find a session by scanning for this user
    for (const [cid, s] of sessions) {
      if (s && s.players && s.players.find(p => p.userId === userId)) {
        channelId = cid; break;
      }
    }
  }
  return { channelId, instanceId, userId };
}

async function getUserProfileFromToken (authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const userId = await lookupUserId(token);
    const resp = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    const user = await resp.json();
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`;
    return { userId, globalName: user.global_name || user.username || 'Użytkownik', avatarUrl };
  } catch { return null; }
}

function makeBlankState (cols) {
  const c = Math.max(4, Math.min(7, cols || 5));
  const rows = 6;
  return Array.from({ length: rows }, () => Array.from({ length: c }, () => '🔳'));
}

async function ensureAvatarLocal (avatarUrl) {
  try {
    const dir = resolve(process.cwd(), 'cache', 'avatars');
    try { await mkdir(dir, { recursive: true }); } catch { }
    const key = crypto.createHash('sha1').update(avatarUrl).digest('hex');
    const fp = join(dir, key + '.png');
    if (!existsSync(fp)) {
      const r = await fetch(avatarUrl);
      if (!r.ok) throw new Error('avatar fetch failed');
      const ab = await r.arrayBuffer();
      await writeFile(fp, Buffer.from(ab));
    }
    return fp;
  } catch (e) {
    return null;
  }
}

async function renderAndSendOrEditSession (interaction, token) {
  const s = sessions.get(channelId);
  if (!s) return;
  // Prepare players for renderer (local avatar file paths)
  const players = [];
  for (const p of s.players) {
    const local = await ensureAvatarLocal(p.avatarUrl);
    players.push({ state: p.state, avatar: local });
  }
  const headerText = s.mode === 'daily' ? 'Słówko dzienne' : s.mode === 'hourly' ? 'Słówko godzinne' : 'Słówko';
  const png = await generateShareImageFast(players, 0, { headerText });
  const content = s.endedAt ? getDisplayForEnded(s.players) : getDisplayForActive(s.players);
  if (!s.messageId) {
    const msg = await discordCreateMessageWithImage(interaction, content, png, 'slowko.png');
    if (msg && msg.id) s.messageId = msg.id;
  } else {
    await discordEditMessageWithImage(channelId, s.messageId, content, png, 'slowko.png');
  }
}

async function discordCreateMessageWithImage (interaction, content, buffer, filename, token) {
  replyToInteraction(interaction.id, interaction.token, {
    type: 4,
    data: {
      content,
      attachments: [{ id: 0, filename: filename, }]
    }
  });
}

async function discordEditMessageWithImage (channelId, messageId, content, buffer, filename) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
  const form = new FormData();
  const payload = { content, attachments: [{ id: 0, filename }] };
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([buffer]), filename);
  const resp = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }, body: form });
  if (!resp.ok) { console.error('edit message failed', await resp.text()); return null; }
  return await resp.json();
}

function isUserCompleted (userId, mode) {
  // Placeholder: check if userStore has completion markers set by the game client
  const u = userStore[userId];
  if (!u) return false;
  if (mode === 'daily') {
    const d = u.dailyCompletedAt ? new Date(u.dailyCompletedAt) : null;
    if (!d) return false;
    const now = new Date();
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
  }
  if (mode === 'hourly') {
    const d = u.hourlyCompletedAt ? new Date(u.hourlyCompletedAt) : null;
    if (!d) return false;
    const now = new Date();
    return Math.floor(d.getTime() / 3600000) === Math.floor(now.getTime() / 3600000);
  }
  // infinite: no completion gating
  return false;
}

// REST endpoints for the Activity client to update state
// Join (or update display name/avatar/length); never removes players
app.post('/api/activity/join', async (req, res) => {
  try {
    const { instanceId } = req.body || {};
    const { channelId, userId: resolvedUserId } = await resolveChannelFromReq(req.body, req.headers);
    let { userId, globalName, avatarUrl, length, mode } = req.body || {};
    if (!userId) {
      const prof = await getUserProfileFromToken(req.header('Authorization'));
      if (prof) ({ userId, globalName, avatarUrl } = prof);
    }
    if (!userId) return res.status(400).json({ error: 'userId/Authorization required' });
    // If no channelId yet, accept and persist profile only
    if (!channelId) {
      if (!userStore[userId]) userStore[userId] = {};
      userStore[userId].globalName = globalName || userStore[userId].globalName || '';
      userStore[userId].avatarUrl = avatarUrl || userStore[userId].avatarUrl || '';
      userStore[userId].preferredLength = Math.max(4, Math.min(7, Number(length) || 5));
      persist();
      return res.json({ ok: true, pending: true });
    }
    upsertSessionStartOrJoin(channelId, { guildId: null, mode, starterUserId: userId, user: { userId, globalName, avatarUrl, length } });
    if (instanceId) {
      const s = sessions.get(channelId);
      if (s) { s.instanceId = instanceId; instanceToChannel.set(instanceId, channelId); }
    }
    // Persist basic profile for later reference
    if (!userStore[userId]) userStore[userId] = {};
    userStore[userId].globalName = globalName || userStore[userId].globalName || '';
    userStore[userId].avatarUrl = avatarUrl || userStore[userId].avatarUrl || '';
    userStore[userId].preferredLength = Math.max(4, Math.min(7, Number(length) || 5));
    persist();
    await renderAndSendOrEditSession(channelId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/activity/join', e); res.status(500).json({ error: 'internal' });
  }
});

// Update a player's board state
app.post('/api/activity/progress', async (req, res) => {
  try {
    let { userId, state } = req.body || {};
    const { channelId } = await resolveChannelFromReq(req.body, req.headers);
    if (!Array.isArray(state)) return res.status(400).json({ error: 'state required' });
    if (!userId) {
      const prof = await getUserProfileFromToken(req.header('Authorization'));
      if (prof) userId = prof.userId;
    }
    if (!userId) return res.status(400).json({ error: 'userId/Authorization required' });
    if (!channelId) return res.status(404).json({ error: 'no session' });
    const s = sessions.get(channelId);
    if (!s) return res.status(404).json({ error: 'no session' });
    const p = s.players.find(p => p.userId === userId);
    if (!p) return res.status(404).json({ error: 'no player' });
    p.state = state;
    // Persist last known board state per (userId, channel)
    if (!userStore[userId]) userStore[userId] = {};
    const key = `activity:${channelId}:state`;
    userStore[userId][key] = state;
    persist();
    await renderAndSendOrEditSession(channelId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/activity/progress', e); res.status(500).json({ error: 'internal' });
  }
});

// End the activity (freeze players and change text). Do not clear players; next start will reset.
app.post('/api/activity/end', async (req, res) => {
  try {
    const { channelId } = await resolveChannelFromReq(req.body, req.headers);
    const s = channelId ? sessions.get(channelId) : null;
    if (!s) {
      // No-op success to avoid startup race errors
      return res.json({ ok: true, pending: true });
    }
    s.endedAt = Date.now();
    await renderAndSendOrEditSession(channelId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/activity/end', e); res.status(500).json({ error: 'internal' });
  }
});

// Start/reset session explicitly
app.post('/api/activity/start', async (req, res) => {
  try {
    const { channelId, mode, userId, globalName, avatarUrl, length } = req.body || {};
    if (!channelId || !userId) return res.status(400).json({ error: 'channelId and userId required' });
    sessions.set(channelId, { mode: mode || 'daily', startedAt: Date.now(), players: [], guildId: null, messageId: null });
    upsertSessionStartOrJoin(channelId, { guildId: null, mode, starterUserId: userId, user: { userId, globalName, avatarUrl, length } });
    await renderAndSendOrEditSession(channelId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/activity/start', e); res.status(500).json({ error: 'internal' });
  }
});


// Token verification middleware.
// Expects Authorization: Bearer <discord access token>
// Verifies token with Discord /users/@me (cached) to derive user id.
const tokenCache = new Map(); // token -> { userId, ts }
const TOKEN_TTL_MS = 15 * 60 * 1000;
async function lookupUserId (token) {
  const cached = tokenCache.get(token);
  const now = Date.now();
  if (cached && (now - cached.ts) < TOKEN_TTL_MS) return cached.userId;
  const resp = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error('Token verification failed');
  const data = await resp.json();
  if (!data || !data.id) throw new Error('Malformed user response');
  tokenCache.set(token, { userId: data.id, ts: now });
  return data.id;
}
async function requireUser (req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization bearer token' });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return res.status(401).json({ error: 'Empty token' });
    const userId = await lookupUserId(token);
    req.userId = userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Definition fetch helper (basic cache to reduce scraping)
const defCache = new Map(); // word -> { ts, data }
const DEF_TTL_MS = 10 * 60 * 1000;
async function fetchDefinitions (word) {
  const cached = defCache.get(word);
  if (cached && Date.now() - cached.ts < DEF_TTL_MS) return cached.data;
  const url = `https://sjp.pwn.pl/slowniki/${encodeURIComponent(word)}.html`;
  const response = await fetch(url);
  if (!response.ok) return { word, definitions: [], source: url };
  const html = await response.text();
  const $ = cheerio.load(html);
  // Grab meaning containers
  let raw = $(".znacz").map((i, el) => $(el).text().trim()).get();
  if (!raw.length) {
    const parts = String(word).trim().split(/\s+/);
    if (parts[0]) parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const targetStart = parts.join(' ');

    const container = $('div')
      .filter((_, el) => {
        const firstChild = $(el).children().first();
        if (!firstChild.is('span')) return false;
        const inner = (firstChild.html() || '').trim();
        return inner.startsWith(targetStart);
      })
      .first();

    if (container.length) {
      const ol = container.find('ol').first();
      if (ol.length) {
        raw = ol.find('li').map((_, li) => $(li).html().trim()).get();
      }
    }
  }
  // Clean & dedupe
  const definitions = Array.from(new Set(raw.map(t => t.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean)));
  const data = { word, definitions, source: url };
  defCache.set(word, { ts: Date.now(), data });
  return data;
}

async function definitionHandler (req, res) {
  try {
    const word = (req.params.word || '').trim();
    if (!word) return res.status(400).json({ error: 'Missing word' });
    const data = await fetchDefinitions(word);
    if (!data.definitions.length) return res.status(404).json({ error: 'No definitions found', word });
    res.json(data);
  } catch (e) {
    console.error('Definition error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
// Original singular route
app.get('/api/definition/:word', definitionHandler);
// Plural alias (fix for client hitting /api/definitions/...)
app.get('/api/definitions/:word', definitionHandler);

app.post("/api/token", async (req, res) => {

  // Exchange the code for an access_token
  const response = await fetch(`https://discord.com/api/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.body.code,
    }),
  });

  // Retrieve the access_token from the response
  const { access_token } = await response.json();

  // Return the access_token to our client as { access_token: "..."}
  res.send({ access_token });
});

// --- User Data Persistence Endpoints ---
// Bulk fetch all key/value pairs for the authenticated user
app.get('/api/userdata', requireUser, (req, res) => {
  const data = userStore[req.userId] || {};
  res.json({ data });
});

// Get a single key
app.get('/api/userdata/:key', requireUser, (req, res) => {
  const data = userStore[req.userId] || {};
  let key = req.params.key;
  if (!(key in data)) {
    // Backward-compat: fix common typo
    if (key === 'preferredLenght' && ('preferredLength' in data)) {
      key = 'preferredLength';
    } else {
      return res.status(404).json({ error: 'Not found' });
    }
  }
  res.json({ key, value: data[key] });
});

// Set / update a single key
app.put('/api/userdata/:key', requireUser, (req, res) => {
  let { value } = req.body || {};
  // Be tolerant: coerce non-string to string/JSON like localStorage semantics
  if (typeof value !== 'string') {
    if (value === undefined || value === null) value = '';
    else if (typeof value === 'object') {
      try { value = JSON.stringify(value); } catch { value = String(value); }
    } else {
      value = String(value);
    }
  }
  let key = req.params.key;
  if (key === 'preferredLenght') key = 'preferredLength';
  if (!userStore[req.userId]) userStore[req.userId] = {};
  userStore[req.userId][key] = value;
  persist();
  res.json({ key, value });
});
// Force server to listen on all interfaces instead of only localhost
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
{
  const previousListen = app.listen.bind(app);
  app.listen = function (port, ...rest) {
    // If previousListen already wraps HTTPS, just pass host
    return previousListen(port, LISTEN_HOST, ...rest);
  };
}
// Bulk set: { data: { key: value, ... } }
app.post('/api/userdata', requireUser, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || typeof req.body.data !== 'object') {
    return res.status(400).json({ error: 'Body must be { data: { ... } }' });
  }
  if (!userStore[req.userId]) userStore[req.userId] = {};
  for (const [k, v] of Object.entries(req.body.data)) {
    userStore[req.userId][k] = String(v);
  }
  persist();
  res.json({ ok: true });
});

// Delete a key
app.delete('/api/userdata/:key', requireUser, (req, res) => {
  if (userStore[req.userId]) {
    delete userStore[req.userId][req.params.key];
    persist();
  }
  res.json({ ok: true });
});

// Simple health check
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

function start (p) {
  const server = app.listen(p, () => {
    console.log(`Server listening at http://localhost:${p}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const next = p + 1;
      console.warn(`Port ${p} in use, retrying on ${next}`);
      start(next);
    } else {
      console.error('Server error', err);
    }
  });
}
start(port);

// Keep share image renderer warm in memory (fonts + WASM). Adjust interval as needed.
(async () => {
  try {
    await warmShareRenderer();
    console.log('[Warmup] Share renderer warmed');
  } catch { }
  const intervalMs = process.env.SHARE_WARM_INTERVAL_MS ? parseInt(process.env.SHARE_WARM_INTERVAL_MS, 10) : 60_000;
  setInterval(() => {
    warmShareRenderer().catch(() => { });
  }, Math.max(15_000, intervalMs));
})();
