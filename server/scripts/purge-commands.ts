import dotenv from 'dotenv';
// Use global fetch in Node 18+
dotenv.config({ path: '../.env' });

const APP_ID = process.env.VITE_DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || process.env.DEBUG_GUILD_ID;

if (!APP_ID || !BOT_TOKEN) {
  console.error('[purge] Missing APP_ID or BOT_TOKEN');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
const headers = { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' } as any;

async function purge(scope: string, listUrl: string, deleteUrl: (id: string) => string) {
  const resp = await fetch(listUrl, { headers });
  if (!resp.ok) throw new Error(`[purge] List ${scope} failed: ${resp.status} ${await resp.text()}`);
  const cmds = await resp.json() as any[];
  for (const c of cmds) {
    if (['slowko', 'słówko'].includes(c.name)) {
      const d = await fetch(deleteUrl(c.id), { method: 'DELETE', headers });
      if (d.status === 204) console.log(`[purge] Deleted ${scope} command`, c.id, c.name);
      else console.warn(`[purge] Failed delete ${scope} ${c.id}: ${d.status} ${await d.text()}`);
    }
  }
}

(async () => {
  try {
    if (GUILD_ID) {
      await purge('GUILD', `${API}/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, (id) => `${API}/applications/${APP_ID}/guilds/${GUILD_ID}/commands/${id}`);
    }
    await purge('GLOBAL', `${API}/applications/${APP_ID}/commands`, (id) => `${API}/applications/${APP_ID}/commands/${id}`);
  } catch (e: any) {
    console.error('[purge] Error:', e?.message || e);
    process.exit(1);
  }
})();
