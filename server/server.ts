import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
// Use global fetch / FormData / Blob provided by Node 18+
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve as pathResolve } from "path";
import https from "https";
import nacl from "tweetnacl";
import {
  warmShareRenderer,
  generateShareImageFast,
  generateShareImage,
} from "./boardpng.js";
import crypto, { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
// Removed discord.js runtime object construction for HTTP interaction flow;
// We operate directly on the raw interaction JSON per Discord spec.
dotenv.config({ path: ".env" });

const app = express();
console.log(
  "[Server] VITE_DISCORD_CLIENT_ID env at start:",
  process.env.VITE_DISCORD_CLIENT_ID
    ? String(process.env.VITE_DISCORD_CLIENT_ID)
    : "(missing)"
);
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Global error visibility
process.on("unhandledRejection", (r) => {
  console.error("Unhandled rejection:", r);
});
process.on("uncaughtException", (e) => {
  console.error("Uncaught exception:", e);
});

// --- Persistence Layer (JSON file) ---
// Data stored at ./data/userdata.json as { userId: { key: value, ... }, ... }
const dataDir = process.env.DATA_DIR || "./data";
const dataFile = join(dataDir, "userdata.json");
let httpsOptions: { key: Buffer; cert: Buffer } | null = null;
try {
  const certDir = "/mounts/letsencrypt/live/serwer.gtadubbing.pl";
  httpsOptions = {
    key: readFileSync(join(certDir, "privkey.pem")),
    cert: readFileSync(join(certDir, "fullchain.pem")),
  };
  const originalListen = app.listen.bind(app);
  (app as any).listen = function (port: number, ...rest: any[]) {
    if (httpsOptions) {
      const server = https.createServer(httpsOptions!, app);
      return server.listen(port, ...rest);
    }
    return originalListen(port as any, ...(rest as any));
  };
  console.log("Loaded SSL certificates for serwer.gtadubbing.pl");
} catch (e: any) {
  console.warn(
    "Could not load SSL certificates, falling back to HTTP:",
    e?.message
  );
}
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
type UserStore = Record<string, Record<string, any>>;
let userStore: UserStore = {};
if (existsSync(dataFile)) {
  try {
    userStore = JSON.parse(readFileSync(dataFile, "utf8"));
  } catch {
    userStore = {};
  }
}
function persist() {
  try {
    writeFileSync(dataFile, JSON.stringify(userStore, null, 2));
  } catch (e) {
    console.error("Persist error", e);
  }
}

// --- Interactions (custom Entry Point handler) ---
// Register before JSON body parser to preserve raw body for signature verification
const DISCORD_PUBLIC_KEY = process.env.INTERACTIONS_PUBLIC_KEY;

// Minimal shape we persist for follow-up edits
type StoredInteractionRef = {
  application_id: string;
  token: string;
  channel_id: string;
};

app.post(
  "/interactions",
  express.raw({ type: "*/*" }),
  (req: Request, res: Response) => {
    try {
      if (!DISCORD_PUBLIC_KEY) {
        return res
          .status(500)
          .json({ error: "INTERACTIONS_PUBLIC_KEY not set" });
      }
      const signature = req.get("X-Signature-Ed25519");
      const timestamp = req.get("X-Signature-Timestamp");
      if (!signature || !timestamp) {
        return res.status(401).send("invalid request signature");
      }
      if (!req.body) return res.status(400).send("invalid request body");
      const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body.toString());
      // Signature + timestamp freshness (5m) verification
      try {
        const tsNum = Number(timestamp);
        if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
          return res.status(401).send("invalid request timestamp");
        }
        const message = Buffer.from(timestamp + rawBody.toString());
        const sig = Buffer.from(signature, "hex");
        const pubKey = Buffer.from(DISCORD_PUBLIC_KEY, "hex");
        if (!nacl.sign.detached.verify(message, sig, pubKey)) {
          return res.status(401).send("invalid request signature");
        }
      } catch (err) {
        console.error("Signature verification error:", err);
        return res.status(401).send("invalid request signature");
      }

      const interaction = JSON.parse(rawBody.toString());
      // PING
      if (interaction.type === 1) return res.json({ type: 1 });

      if (interaction.type !== 2) {
        // Not an application command; ignore gracefully
        return res.json({ type: 4, data: { content: "Unsupported interaction." } });
      }

      const channelId: string | undefined = interaction.channel_id;
      const guildId: string | undefined = interaction.guild_id;
      const userObj = interaction.member?.user || interaction.user;
      const userId: string | undefined = userObj?.id;
      const globalName: string = userObj?.global_name || userObj?.username || "Użytkownik";
      const avatarHash: string | undefined = userObj?.avatar;
      const avatarUrl: string = avatarHash
        ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`;

      // Extract command options (mode, length)
      let mode: "daily" | "hourly" | "infinite" = "daily";
      let length = 5;
      try {
        const opts = interaction.data?.options || [];
        for (const o of opts) {
          if (o.name === "mode" && typeof o.value === "string") mode = o.value;
          if (o.name === "length" && typeof o.value === "number") length = Math.max(4, Math.min(7, o.value));
        }
      } catch {}

      if (userId && isUserCompleted(userId, mode)) {
        return res.json({
          type: 12
        });
      }

      if (channelId && userId) {
        // Setup / join session
        upsertSessionStartOrJoin(channelId, {
          guildId: guildId || null,
          mode,
          user: { userId, globalName, avatarUrl, length },
        });
        // Store minimal reference for image updates
        const s = sessions.get(channelId);
        console.log('setting the interactionRef');
        if (s) {
          s.interactionRef = {
            application_id: interaction.application_id,
            token: interaction.token,
            channel_id: channelId,
          } as StoredInteractionRef;
        }
        // Determine if this is an Activity Entry Point (launch) or a normal slash
        const isActivityEntry =
          (interaction?.data?.type === 4) || (interaction?.data?.application_command?.type === 4);
        if (s) s.responseMode = isActivityEntry ? "launch" : "deferred";
        // Respond accordingly
        if (isActivityEntry) {
          res.json({ type: 12 }); // ApplicationCommandAutocompleteResult (Activity launch)
        } else {
          res.json({ type: 5 }); // DeferredChannelMessageWithSource
        }
        // Render asynchronously
        setImmediate(async () => {
          try {
            await renderAndSendOrEditSession(channelId);
          } catch (e) {
            console.error("Initial render failed", e);
          }
        });
      } else {
        res.json({ type: 4, data: { content: "Brak kanału lub użytkownika." } });
      }
    } catch (e) {
      console.error("Interactions error:", e);
      return res.status(500).json({ error: "Internal error" });
    }
  }
);

// Allow express to parse JSON bodies for the rest of the API
app.use(express.json());
// ---- Słówko Activity sessions ----
// Per-channel session state (never remove players; reset only on new start)
type Player = {
  userId: string;
  globalName: string;
  avatarUrl: string;
  length: number;
  state: string[][];
};
type Session = {
  mode: "daily" | "hourly" | "infinite";
  startedAt: number;
  endedAt?: number;
  players: Player[];
  interactionRef?: StoredInteractionRef; // minimal data to edit original message
  messageId?: string | null; // not required when editing @original but kept for potential follow-ups
  guildId?: string | null;
  instanceId?: string;
  responseMode?: "deferred" | "launch"; // how we initially responded
};
const sessions = new Map<string, Session>(); // channelId -> session
const instanceToChannel = new Map<string, string>(); // instanceId -> channelId

function getDisplayForActive(players: Player[]) {
  if (!players.length) return "";
  if (players.length === 1)
    return `${players[0].globalName} gra teraz w słówko`;
  if (players.length === 2)
    return `${players[0].globalName} i ${players[1].globalName} grają teraz w słówko`;
  const names = players.map((p) => p.globalName);
  const last = names.pop();
  return `${names.join(", ")} i ${last} grają teraz w słówko`;
}
function getDisplayForEnded(players: Player[]) {
  const names = players.map((p) => p.globalName).join(" ");
  return `${names} grali w Słówko`;
}

function makeBlankState(cols?: number) {
  const c = Math.max(4, Math.min(7, cols || 5));
  const rows = 6;
  return Array.from({ length: rows }, () =>
    Array.from({ length: c }, () => "🔳")
  );
}

function upsertSessionStartOrJoin(
  channelId: string,
  {
    guildId,
    mode,
    user,
  }: {
    guildId: string | null | undefined;
    mode?: Session["mode"];
    user: {
      userId: string;
      globalName: string;
      avatarUrl: string;
      length?: number;
    };
  }
) {
  let s = sessions.get(channelId);
  if (!s || s.endedAt) {
    s = {
      mode: mode || "daily",
      startedAt: Date.now(),
      players: [],
      guildId: guildId ?? null,
      messageId: null,
    };
    sessions.set(channelId, s);
  }
  const key = `activity:${channelId}:state`;
  s.mode = s.mode || mode || "daily";
  // Add user if missing (never remove later)
  if (!s.players.find((p) => p.userId === user.userId)) {
    if (!userStore[user.userId]) userStore[user.userId] = {};
    const storedState = userStore[user.userId][key];
    s.players.push({
      userId: user.userId,
      globalName: user.globalName,
      avatarUrl: user.avatarUrl,
      length: user.length || 5,
      state: Array.isArray(storedState) ? storedState : makeBlankState(user.length || 5),
    });
  }
}

async function resolveChannelFromReq(reqBody: any, reqHeaders: any) {
  let { channelId, instanceId, userId } =
    reqBody ||
    ({} as { channelId?: string; instanceId?: string; userId?: string });
  if (!channelId && instanceId) channelId = instanceToChannel.get(instanceId);
  if (!userId) {
    const prof = await getUserProfileFromToken(
      (reqHeaders && reqHeaders["authorization"]) || ""
    );
    if (prof) userId = prof.userId;
  }
  if (!channelId && userId) {
    // Try to find a session by scanning for this user
    for (const [cid, s] of sessions) {
      if (s && s.players && s.players.find((p) => p.userId === userId)) {
        channelId = cid;
        break;
      }
    }
  }
  return { channelId, instanceId, userId } as {
    channelId?: string;
    instanceId?: string;
    userId?: string;
  };
}

async function getUserProfileFromToken(authHeader: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const userId = await lookupUserId(token);
    const resp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = (await resp.json()) as any;
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`;
    return {
      userId,
      globalName: user.global_name || user.username || "Użytkownik",
      avatarUrl,
    } as { userId: string; globalName: string; avatarUrl: string };
  } catch {
    return null;
  }
}

async function ensureAvatarLocal(avatarUrl: string) {
  try {
    const dir = pathResolve(process.cwd(), "cache", "avatars");
    try {
      await mkdir(dir, { recursive: true });
    } catch {}
    const key = crypto.createHash("sha1").update(avatarUrl).digest("hex");
    const fp = join(dir, key + ".png");
    if (!existsSync(fp)) {
      const r = await fetch(avatarUrl);
      if (!r.ok) throw new Error("avatar fetch failed");
      const ab = await r.arrayBuffer();
      await writeFile(fp, new Uint8Array(ab));
    }
    return fp;
  } catch (e) {
    return null;
  }
}

async function renderAndSendOrEditSession(channelId: string) {
  const s = sessions.get(channelId);
  if (!s || !s.interactionRef) return;
  console.log(`[Render] channel=${channelId} players=${s.players.length}`);
  const players = [] as any[];
  for (const p of s.players) {
    const local = await ensureAvatarLocal(p.avatarUrl);
    players.push({ state: p.state, avatar: local });
  }
  const headerText =
    s.mode === "daily"
      ? "Słówko dzienne 0"
      : s.mode === "hourly"
      ? "Słówko godzinne 0"
      : "Słówko 0";
  const png = await generateShareImage(players as any, 0, { headerText });
  try {
    await mkdir("debug", { recursive: true });
    await writeFile(`debug/${headerText}.png`, png).catch(() => {});
  } catch {}
  const content = s.endedAt ? getDisplayForEnded(s.players) : getDisplayForActive(s.players);
  if (s.responseMode === "launch") {
    if (s.messageId) {
      await discordEditFollowupImage(s.interactionRef, s.messageId, content, png);
    } else {
      const id = await discordCreateFollowupImage(s.interactionRef, content, png);
      if (id) s.messageId = id;
    }
  } else {
    await discordUpsertOriginalImage(s.interactionRef, content, png);
  }
}

async function discordUpsertOriginalImage(ref: StoredInteractionRef, content: string, buffer: Buffer) {
  try {
    const body = new FormData();
    const uint8 = new Uint8Array(buffer);
    const imageBlob = new Blob([uint8], { type: "image/png" });
    body.append("files[0]", imageBlob, "image.png");
    body.append(
      "payload_json",
      JSON.stringify({
        content,
        attachments: [{ id: 0, filename: "image.png", description: "Stan gry" }],
      })
    );
    const url = `https://discord.com/api/v10/webhooks/${ref.application_id}/${ref.token}/messages/@original`;
    const res = await fetch(url, { method: "PATCH", body });
    const text = await res.text();
    if (!res.ok) {
      console.error("[Webhook Edit] Failed", res.status, text);
    } else {
      try { console.log("[Webhook Edit] OK", res.status); } catch {}
    }
  } catch (e) {
    console.error("discordUpsertOriginalImage error", e);
  }
}

async function discordCreateFollowupImage(ref: StoredInteractionRef, content: string, buffer: Buffer) {
  try {
    const body = new FormData();
    const uint8 = new Uint8Array(buffer);
    const imageBlob = new Blob([uint8], { type: "image/png" });
    body.append("files[0]", imageBlob, "image.png");
    body.append(
      "payload_json",
      JSON.stringify({
        content,
        attachments: [{ id: 0, filename: "image.png", description: "Stan gry" }],
      })
    );
    const url = `https://discord.com/api/v10/webhooks/${ref.application_id}/${ref.token}`;
    const res = await fetch(url, { method: "POST", body });
    const text = await res.text();
    if (!res.ok) {
      console.error("[Webhook Followup Create] Failed", res.status, text);
      return null;
    }
    const json = JSON.parse(text);
    return json?.id as string | null;
  } catch (e) {
    console.error("discordCreateFollowupImage error", e);
    return null;
  }
}

async function discordEditFollowupImage(ref: StoredInteractionRef, messageId: string, content: string, buffer: Buffer) {
  try {
    const body = new FormData();
    const uint8 = new Uint8Array(buffer);
    const imageBlob = new Blob([uint8], { type: "image/png" });
    body.append("files[0]", imageBlob, "image.png");
    body.append(
      "payload_json",
      JSON.stringify({
        content,
        attachments: [{ id: 0, filename: "image.png", description: "Stan gry" }],
      })
    );
    const url = `https://discord.com/api/v10/webhooks/${ref.application_id}/${ref.token}/messages/${messageId}`;
    const res = await fetch(url, { method: "PATCH", body });
    const text = await res.text();
    if (!res.ok) {
      console.error("[Webhook Followup Edit] Failed", res.status, text);
    }
  } catch (e) {
    console.error("discordEditFollowupImage error", e);
  }
}

function isUserCompleted(userId: string, mode: Session["mode"]) {
  // Placeholder: check if userStore has completion markers set by the game client
  const u = userStore[userId];
  if (!u) return false;
  if (mode === "daily") {
    const d = u.dailyCompletedAt ? new Date(u.dailyCompletedAt) : null;
    if (!d) return false;
    const now = new Date();
    return (
      d.getUTCFullYear() === now.getUTCFullYear() &&
      d.getUTCMonth() === now.getUTCMonth() &&
      d.getUTCDate() === now.getUTCDate()
    );
  }
  if (mode === "hourly") {
    const d = u.hourlyCompletedAt ? new Date(u.hourlyCompletedAt) : null;
    if (!d) return false;
    const now = new Date();
    return (
      Math.floor(d.getTime() / 3600000) === Math.floor(now.getTime() / 3600000)
    );
  }
  // infinite: no completion gating
  return false;
}

// REST endpoints for the Activity client to update state
// Join (or update display name/avatar/length); never removes players
app.post("/api/activity/join", async (req: Request, res: Response) => {
  try {
    const { instanceId } = (req.body || {}) as any;
    const { channelId, userId: resolvedUserId } = await resolveChannelFromReq(
      req.body,
      req.headers
    );
    let { userId, globalName, avatarUrl, length, mode } = (req.body ||
      {}) as any;
    if (!userId) {
      const prof = await getUserProfileFromToken(
        req.header("Authorization") || ""
      );
      if (prof) ({ userId, globalName, avatarUrl } = prof);
    }
    if (!userId)
      return res.status(400).json({ error: "userId/Authorization required" });
    // If no channelId yet, accept and persist profile only
    if (!channelId) {
      if (!userStore[userId]) userStore[userId] = {};
      userStore[userId].globalName =
        globalName || userStore[userId].globalName || "";
      userStore[userId].avatarUrl =
        avatarUrl || userStore[userId].avatarUrl || "";
      userStore[userId].preferredLength = Math.max(
        4,
        Math.min(7, Number(length) || 5)
      );
      persist();
      return res.json({ ok: true, pending: true });
    }
    upsertSessionStartOrJoin(channelId, {
      guildId: null,
      mode,
      user: { userId, globalName, avatarUrl, length },
    });
    if (instanceId) {
      const s = sessions.get(channelId);
      if (s) {
        s.instanceId = instanceId;
        instanceToChannel.set(instanceId, channelId);
      }
    }
    // Persist basic profile for later reference
    if (!userStore[userId]) userStore[userId] = {};
    userStore[userId].globalName =
      globalName || userStore[userId].globalName || "";
    userStore[userId].avatarUrl =
      avatarUrl || userStore[userId].avatarUrl || "";
    userStore[userId].preferredLength = Math.max(
      4,
      Math.min(7, Number(length) || 5)
    );
    persist();
    res.json({ ok: true });
  } catch (e) {
    console.error("/api/activity/join", e);
    res.status(500).json({ error: "internal" });
  }
});

// Update a player's board state
app.post("/api/activity/progress", async (req: Request, res: Response) => {
  try {
    let { userId, state } = (req.body || {}) as any;
    const { channelId } = await resolveChannelFromReq(req.body, req.headers);
    if (!Array.isArray(state))
      return res.status(400).json({ error: "state required" });
    if (!userId) {
      const prof = await getUserProfileFromToken(
        req.header("Authorization") || ""
      );
      if (prof) userId = prof.userId;
    }
    if (!userId)
      return res.status(400).json({ error: "userId/Authorization required" });
    console.log("checking for channel id?");
    if (!channelId) return res.status(404).json({ error: "no session" });
    const s = sessions.get(channelId);
    console.log("checking if session exists");
    if (!s) return res.status(404).json({ error: "no session" });
    const p = s.players.find((p) => p.userId === userId);
    console.log("checking if player exists");
    if (!p) return res.status(404).json({ error: "no player" });
    console.log("updating state");
    p.state = state;
    // Persist last known board state per (userId, channel)
    if (!userStore[userId]) userStore[userId] = {};
    const key = `activity:${channelId}:state`;
    userStore[userId][key] = state;
    persist();
  if (s.interactionRef) await renderAndSendOrEditSession(channelId);
    res.json({ ok: true });
  } catch (e) {
    console.error("/api/activity/progress", e);
    res.status(500).json({ error: "internal" });
  }
});

// End the activity (freeze players and change text). Do not clear players; next start will reset.
app.post("/api/activity/end", async (req: Request, res: Response) => {
  try {
    const { channelId } = await resolveChannelFromReq(req.body, req.headers);
    const s = channelId ? sessions.get(channelId) : null;
    if (!s) {
      // No-op success to avoid startup race errors
      return res.json({ ok: true, pending: true });
    }
    s.endedAt = Date.now();
  if (channelId && s.interactionRef) await renderAndSendOrEditSession(channelId);
    res.json({ ok: true });
  } catch (e) {
    console.error("/api/activity/end", e);
    res.status(500).json({ error: "internal" });
  }
});

// Token verification middleware.
// Expects Authorization: Bearer <discord access token>
// Verifies token with Discord /users/@me (cached) to derive user id.
const tokenCache = new Map<string, { userId: string; ts: number }>(); // token -> { userId, ts }
const TOKEN_TTL_MS = 15 * 60 * 1000;
async function lookupUserId(token: string) {
  const cached = tokenCache.get(token);
  const now = Date.now();
  if (cached && now - cached.ts < TOKEN_TTL_MS) return cached.userId;
  const resp = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Token verification failed");
  const data = (await resp.json()) as any;
  if (!data || !data.id) throw new Error("Malformed user response");
  tokenCache.set(token, { userId: data.id, ts: now });
  return data.id as string;
}
async function requireUser(
  req: Request & { userId?: string },
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing Authorization bearer token" });
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return res.status(401).json({ error: "Empty token" });
    const userId = await lookupUserId(token);
    (req as any).userId = userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Definition fetch helper (basic cache to reduce scraping)
const defCache = new Map<string, { ts: number; data: any }>(); // word -> { ts, data }
const DEF_TTL_MS = 10 * 60 * 1000;
async function fetchDefinitions(word: string) {
  const cached = defCache.get(word);
  if (cached && Date.now() - cached.ts < DEF_TTL_MS) return cached.data;
  const url = `https://sjp.pwn.pl/slowniki/${encodeURIComponent(word)}.html`;
  const response = await fetch(url);
  if (!response.ok) return { word, definitions: [], source: url };
  const html = await response.text();
  const $ = cheerio.load(html);
  // Grab meaning containers
  let raw = $(".znacz")
    .map((i, el) => $(el).text().trim())
    .get();
  if (!raw.length) {
    const parts = String(word).trim().split(/\s+/);
    if (parts[0])
      parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const targetStart = parts.join(" ");

    const container = $("div")
      .filter((_, el) => {
        const firstChild = $(el).children().first();
        if (!firstChild.is("span")) return false;
        const inner = (firstChild.html() || "").trim();
        return inner.startsWith(targetStart);
      })
      .first();

    if (container.length) {
      const ol = container.find("ol").first();
      if (ol.length) {
        raw = ol
          .find("li")
          .map((_, li) => $(li).html().trim())
          .get();
      }
    }
  }
  // Clean & dedupe
  const definitions = Array.from(
    new Set(
      raw
        .map((t: string) =>
          t
            .replace(/^\d+\.\s*/, "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  );
  const data = { word, definitions, source: url };
  defCache.set(word, { ts: Date.now(), data });
  return data;
}

async function definitionHandler(req: Request, res: Response) {
  try {
    const word = (req.params.word || "").trim();
    if (!word) return res.status(400).json({ error: "Missing word" });
    const data = await fetchDefinitions(word);
    if (!data.definitions.length)
      return res.status(404).json({ error: "No definitions found", word });
    res.json(data);
  } catch (e) {
    console.error("Definition error", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
// Original singular route
app.get("/api/definition/:word", definitionHandler);
// Plural alias (fix for client hitting /api/definitions/...)
app.get("/api/definitions/:word", definitionHandler);

app.post("/api/token", async (req: Request, res: Response) => {
  // Exchange the code for an access_token
  const response = await fetch(`https://discord.com/api/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID || "",
      client_secret: process.env.DISCORD_CLIENT_SECRET || "",
      grant_type: "authorization_code",
      code: (req.body as any).code,
    }) as any,
  });

  // Retrieve the access_token from the response
  const { access_token } = (await response.json()) as any;

  // Return the access_token to our client as { access_token: "..."}
  res.send({ access_token });
});

// --- User Data Persistence Endpoints ---
// Bulk fetch all key/value pairs for the authenticated user
app.get(
  "/api/userdata",
  requireUser as any,
  (req: Request & { userId?: string }, res: Response) => {
    const data = userStore[req.userId as string] || {};
    res.json({ data });
  }
);

// Get a single key
app.get(
  "/api/userdata/:key",
  requireUser as any,
  (req: Request & { userId?: string }, res: Response) => {
    const data = userStore[req.userId as string] || {};
    let key = req.params.key as string;
    if (!(key in data)) {
      // Backward-compat: fix common typo
      if (key === "preferredLenght" && "preferredLength" in data) {
        key = "preferredLength";
      } else {
        return res.status(404).json({ error: "Not found" });
      }
    }
    res.json({ key, value: data[key] });
  }
);

// Set / update a single key
app.put(
  "/api/userdata/:key",
  requireUser as any,
  (req: Request & { userId?: string }, res: Response) => {
    let { value } = (req.body || {}) as any;
    // Be tolerant: coerce non-string to string/JSON like localStorage semantics
    if (typeof value !== "string") {
      if (value === undefined || value === null) value = "";
      else if (typeof value === "object") {
        try {
          value = JSON.stringify(value);
        } catch {
          value = String(value);
        }
      } else {
        value = String(value);
      }
    }
    let key = req.params.key as string;
    if (key === "preferredLenght") key = "preferredLength";
    if (!userStore[req.userId as string]) userStore[req.userId as string] = {};
    userStore[req.userId as string][key] = value;
    persist();
    res.json({ key, value });
  }
);

// Force server to listen on all interfaces instead of only localhost
const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";
{
  const previousListen = app.listen.bind(app);
  (app as any).listen = function (port: number, ...rest: any[]) {
    // If previousListen already wraps HTTPS, just pass host
    return previousListen(port as any, LISTEN_HOST, ...(rest as any));
  };
}

// Bulk set: { data: { key: value, ... } }
app.post(
  "/api/userdata",
  requireUser as any,
  (req: Request & { userId?: string }, res: Response) => {
    if (
      !req.body ||
      typeof req.body !== "object" ||
      typeof (req.body as any).data !== "object"
    ) {
      return res.status(400).json({ error: "Body must be { data: { ... } }" });
    }
    if (!userStore[req.userId as string]) userStore[req.userId as string] = {};
    for (const [k, v] of Object.entries((req.body as any).data)) {
      userStore[req.userId as string][k] = String(v);
    }
    persist();
    res.json({ ok: true });
  }
);

// Delete a key
app.delete(
  "/api/userdata/:key",
  requireUser as any,
  (req: Request & { userId?: string }, res: Response) => {
    if (userStore[req.userId as string]) {
      delete userStore[req.userId as string][req.params.key];
      persist();
    }
    res.json({ ok: true });
  }
);

// Simple health check
app.get("/api/health", (req: Request, res: Response) =>
  res.json({ ok: true, uptime: process.uptime() })
);

function start(p: number) {
  const server = app.listen(p, () => {
    console.log(`Server listening at http://localhost:${p}`);
  });
  server.on("error", (err: any) => {
    if ((err as any).code === "EADDRINUSE") {
      const next = p + 1;
      console.warn(`Port ${p} in use, retrying on ${next}`);
      start(next);
    } else {
      console.error("Server error", err);
    }
  });
}
start(port);

// Keep share image renderer warm in memory (fonts + WASM). Adjust interval as needed.
(async () => {
  try {
    await warmShareRenderer();
    console.log("[Warmup] Share renderer warmed");
  } catch {}
  const intervalMs = process.env.SHARE_WARM_INTERVAL_MS
    ? parseInt(process.env.SHARE_WARM_INTERVAL_MS, 10)
    : 60_000;
  setInterval(() => {
    warmShareRenderer().catch(() => {});
  }, Math.max(15_000, intervalMs));
})();
