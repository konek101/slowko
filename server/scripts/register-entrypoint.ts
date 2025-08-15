import dotenv from 'dotenv';
// Use global fetch in Node 18+
dotenv.config();

const APP_ID = process.env.VITE_DISCORD_CLIENT_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || process.env.DEBUG_GUILD_ID;
console.log(APP_ID);
if (!APP_ID) {
  console.error('[entrypoint] Missing VITE_DISCORD_CLIENT_ID (or DISCORD_APPLICATION_ID)');
  process.exit(1);
}
if (!BOT_TOKEN) {
  console.error('[entrypoint] Missing DISCORD_BOT_TOKEN');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function upsertEntryPoint() {
  const headers: any = {
    'Authorization': `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json'
  } as any;

  // Desired command definition per User Actions guidelines
  const desired: any = {
    name: 'slowko',
    name_localizations: { pl: 'słówko' },
    description: 'Uruchom aktywność Słówko',
    description_localizations: { pl: 'Uruchom aktywność Słówko' },
    type: 4, // Activity Entry Point command
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dm_permission: true,
    default_member_permissions: null,
    handler: 1 // Launch Activity
  };

  // Upsert GUILD command for instant availability (if GUILD_ID provided)
  if (GUILD_ID) {
    const listGuild = await fetch(`${API}/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, { headers });
    if (!listGuild.ok) throw new Error(`List guild commands failed: ${listGuild.status} ${await listGuild.text()}`);
    const gcmds = await listGuild.json() as any[];
    const existingG = gcmds.find(c => c.name === desired.name || c.name === desired.name_localizations?.pl);
    if (!existingG) {
      const create = await fetch(`${API}/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, { method: 'POST', headers, body: JSON.stringify(desired) });
      if (!create.ok) throw new Error(`Create guild command failed: ${create.status} ${await create.text()}`);
      const created = await create.json();
      console.log('[entrypoint] Created GUILD command', (created as any).id, 'name', (created as any).name);
    } else {
      const update = await fetch(`${API}/applications/${APP_ID}/guilds/${GUILD_ID}/commands/${existingG.id}`, { method: 'PATCH', headers, body: JSON.stringify(desired) });
      if (!update.ok) throw new Error(`Update guild command failed: ${update.status} ${await update.text()}`);
      const updated = await update.json();
      console.log('[entrypoint] Updated GUILD command', (updated as any).id, 'name', (updated as any).name);
    }
  }

  // Upsert GLOBAL command (may take time to propagate)
  const listResp = await fetch(`${API}/applications/${APP_ID}/commands`, { headers });
  if (!listResp.ok) throw new Error(`List commands failed: ${listResp.status} ${await listResp.text()}`);
  const commands = await listResp.json() as any[];
  console.log(commands);
  const existing = commands[0];
  if (!existing) {
    const createResp = await fetch(`${API}/applications/${APP_ID}/commands`, { method: 'POST', headers, body: JSON.stringify(desired) });
    if (!createResp.ok) throw new Error(`Create command failed: ${createResp.status} ${await createResp.text()}`);
    const created = await createResp.json();
    console.log('[entrypoint] Created GLOBAL command', (created as any).id, 'name', (created as any).name);
  } else {
    const updateResp = await fetch(`${API}/applications/${APP_ID}/commands/${existing.id}`, { method: 'PATCH', headers, body: JSON.stringify(desired) });
    if (!updateResp.ok) throw new Error(`Update command failed: ${updateResp.status} ${await updateResp.text()}`);
    const updated = await updateResp.json();
    console.log('[entrypoint] Updated GLOBAL command', (updated as any).id, 'name', (updated as any).name);
  }
}

upsertEntryPoint().catch(err => {
  console.error('[entrypoint] Error:', (err as any)?.message || err);
  process.exit(1);
});
