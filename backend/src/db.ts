import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Artwork, Campaign, Character, GameState, InventoryItem, Location, Memory, Message, Npc, Quest, WorldFact } from "../../shared/types";
import { id, now } from "./util";

const dataDir = path.resolve("data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "dnd.sqlite"));
db.pragma("journal_mode = WAL");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, ancestry TEXT NOT NULL,
      background TEXT NOT NULL, appearance TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL, xp INTEGER NOT NULL DEFAULT 0, max_hp INTEGER NOT NULL, hp INTEGER NOT NULL,
      stats TEXT NOT NULL, spells TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, tone TEXT NOT NULL, summary TEXT NOT NULL,
      character_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      metadata TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, character_id TEXT NOT NULL,
      name TEXT NOT NULL, quantity INTEGER NOT NULL, description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, title TEXT NOT NULL,
      status TEXT NOT NULL, description TEXT NOT NULL, progress TEXT NOT NULL, reward TEXT NOT NULL, xp_reward INTEGER NOT NULL DEFAULT 100
    );
    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, name TEXT NOT NULL,
      disposition TEXT NOT NULL, notes TEXT NOT NULL, location TEXT
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL, discovered INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, content TEXT NOT NULL,
      importance INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_facts (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, category TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, priority INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artworks (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, character_id TEXT, item_id TEXT,
      kind TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL,
      image_url TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare(`PRAGMA table_info(characters)`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "appearance")) {
    db.prepare(`ALTER TABLE characters ADD COLUMN appearance TEXT NOT NULL DEFAULT ''`).run();
  }
  if (!columns.some((column) => column.name === "xp")) {
    db.prepare(`ALTER TABLE characters ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`).run();
  }
  const questColumns = db.prepare(`PRAGMA table_info(quests)`).all() as Array<{ name: string }>;
  if (!questColumns.some((column) => column.name === "xp_reward")) {
    db.prepare(`ALTER TABLE quests ADD COLUMN xp_reward INTEGER NOT NULL DEFAULT 100`).run();
  }
  const artworkColumns = db.prepare(`PRAGMA table_info(artworks)`).all() as Array<{ name: string }>;
  if (!artworkColumns.some((column) => column.name === "item_id")) {
    db.prepare(`ALTER TABLE artworks ADD COLUMN item_id TEXT`).run();
  }
}

const json = <T>(value: string): T => JSON.parse(value) as T;

export function rowToCharacter(row: any): Character {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    ancestry: row.ancestry,
    background: row.background,
    appearance: row.appearance ?? "",
    level: row.level,
    xp: row.xp ?? 0,
    maxHp: row.max_hp,
    hp: row.hp,
    stats: json(row.stats),
    spells: json(row.spells),
    createdAt: row.created_at
  };
}

export function rowToCampaign(row: any): Campaign {
  return {
    id: row.id,
    name: row.name,
    tone: row.tone,
    summary: row.summary,
    characterId: row.character_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToMessage(row: any): Message {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    metadata: row.metadata ? json(row.metadata) : undefined
  };
}

export const rowToInventory = (row: any): InventoryItem => ({
  id: row.id, campaignId: row.campaign_id, characterId: row.character_id, name: row.name,
  quantity: row.quantity, description: row.description
});
export const rowToQuest = (row: any): Quest => ({
  id: row.id, campaignId: row.campaign_id, title: row.title, status: row.status,
  description: row.description, progress: row.progress, reward: row.reward, xpReward: row.xp_reward ?? 100
});
export const rowToNpc = (row: any): Npc => ({
  id: row.id, campaignId: row.campaign_id, name: row.name, disposition: row.disposition,
  notes: row.notes, location: row.location ?? undefined
});
export const rowToLocation = (row: any): Location => ({
  id: row.id, campaignId: row.campaign_id, name: row.name, description: row.description,
  discovered: Boolean(row.discovered)
});
export const rowToMemory = (row: any): Memory => ({
  id: row.id, campaignId: row.campaign_id, content: row.content, importance: row.importance, createdAt: row.created_at
});
export const rowToWorldFact = (row: any): WorldFact => ({
  id: row.id,
  campaignId: row.campaign_id,
  category: row.category,
  title: row.title,
  content: row.content,
  priority: row.priority,
  createdAt: row.created_at
});
export const rowToArtwork = (row: any): Artwork => ({
  id: row.id,
  campaignId: row.campaign_id,
  characterId: row.character_id ?? undefined,
  itemId: row.item_id ?? undefined,
  kind: row.kind,
  title: row.title,
  prompt: row.prompt,
  imageUrl: row.image_url,
  source: row.source,
  createdAt: row.created_at
});

export function listCampaigns() {
  return db.prepare(`
    SELECT campaigns.*, characters.name AS character_name, characters.role AS character_role
    FROM campaigns JOIN characters ON characters.id = campaigns.character_id
    ORDER BY campaigns.updated_at DESC
  `).all();
}

export function createCharacter(input: Omit<Character, "id" | "level" | "xp" | "createdAt">): Character {
  const character: Character = { ...input, id: id("char"), level: 1, xp: 0, createdAt: now() };
  db.prepare(`
    INSERT INTO characters (id,name,role,ancestry,background,appearance,level,xp,max_hp,hp,stats,spells,created_at)
    VALUES (@id,@name,@role,@ancestry,@background,@appearance,@level,@xp,@maxHp,@hp,@stats,@spells,@createdAt)
  `).run({ ...character, stats: JSON.stringify(character.stats), spells: JSON.stringify(character.spells) });
  return character;
}

export type CampaignSeed = {
  name: string;
  tone: string;
  premise: string;
  startingLocation: string;
  startingLocationDescription: string;
  openingNpcName: string;
  openingNpcDisposition: string;
  openingNpcNotes: string;
  questTitle: string;
  questDescription: string;
  questProgress: string;
  questReward: string;
  questXpReward: number;
  openingMessage: string;
  memory: string;
  startingItems?: Array<{ name: string; quantity: number; description: string }>;
};

export function defaultCampaignSeed(character: Character, name: string, tone: string): CampaignSeed {
  return {
    name,
    tone,
    premise: `${character.name}, a ${character.ancestry} ${character.role}, has taken Mara Vell's cellar key and the first step beneath the Emberglass Tavern.`,
    startingLocation: "Emberglass Tavern",
    startingLocationDescription: "Low beams, wet cloaks, candle-stained tables, and a cellar older than the village ledger.",
    openingNpcName: "Mara Vell",
    openingNpcDisposition: "watchful ally",
    openingNpcNotes: "Keeps the Emberglass, counts every cup poured, and hears lies before they finish leaving a mouth.",
    questTitle: "The Door Under the Alehouse",
    questDescription: "Something below the Emberglass has begun answering the rain with knocks of its own.",
    questProgress: "Take Mara's key, descend past the barrels, and learn what woke under the floor.",
    questReward: "A warm room, silver in a cloth purse, and first claim on whatever should not belong to the dead.",
    questXpReward: 100,
    openingMessage: `Rain ticks on the leaded windows while the last patrons pretend not to listen. You are in the common room of the Emberglass Tavern, one table from the cellar door, with your road-worn pack at your feet and Mara Vell across from you.

Mara sets a blackened cellar key beside your cup and keeps two fingers on it a moment longer than needed. "Past the ale barrels," she says. "If a door is open down there, I did not open it. If something answers you, do not answer back too quickly."

Three things are immediately worth your attention: the key is cold enough to bead water on the table, the floorboards below your chair knock once from underneath, and a drunk by the hearth has gone pale because he recognizes the rhythm.

You can take the key and descend, question Mara about what she has already seen, press the frightened patron before he bolts, or inspect the cellar door and floorboards first.`,
    memory: "A fresh draught slips through the cellar boards, carrying dust, wet stone, and the bite of old metal.",
    startingItems: [
      { name: "Weathered pack", quantity: 1, description: "Oilcloth bundle with dry socks, hard cheese, flint, twine, and a tin cup dented by long roads." },
      { name: "Iron dagger", quantity: 1, description: "Unadorned, sharp enough, and honest in the hand." }
    ]
  };
}

export function createCampaign(character: Character, name: string, tone: string, seed?: Partial<CampaignSeed>): Campaign {
  const campaignSeed = { ...defaultCampaignSeed(character, name, tone), ...seed };
  const campaign: Campaign = {
    id: id("camp"),
    name: campaignSeed.name,
    tone: campaignSeed.tone,
    summary: campaignSeed.premise,
    characterId: character.id,
    createdAt: now(),
    updatedAt: now()
  };
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO campaigns (id,name,tone,summary,character_id,created_at,updated_at) VALUES (@id,@name,@tone,@summary,@characterId,@createdAt,@updatedAt)`).run(campaign);
    for (const item of campaignSeed.startingItems ?? []) {
      db.prepare(`INSERT INTO inventory_items VALUES (?,?,?,?,?,?)`).run(id("item"), campaign.id, character.id, item.name, item.quantity, item.description);
    }
    db.prepare(`INSERT INTO quests (id,campaign_id,title,status,description,progress,reward,xp_reward) VALUES (?,?,?,?,?,?,?,?)`).run(id("quest"), campaign.id, campaignSeed.questTitle, "active", campaignSeed.questDescription, campaignSeed.questProgress, campaignSeed.questReward, campaignSeed.questXpReward);
    db.prepare(`INSERT INTO npcs VALUES (?,?,?,?,?,?)`).run(id("npc"), campaign.id, campaignSeed.openingNpcName, campaignSeed.openingNpcDisposition, campaignSeed.openingNpcNotes, campaignSeed.startingLocation);
    db.prepare(`INSERT INTO locations VALUES (?,?,?,?,?)`).run(id("loc"), campaign.id, campaignSeed.startingLocation, campaignSeed.startingLocationDescription, 1);
    db.prepare(`INSERT INTO memories VALUES (?,?,?,?,?)`).run(id("mem"), campaign.id, campaignSeed.memory, 4, now());
    addMessage(campaign.id, "dm", campaignSeed.openingMessage, {});
  });
  tx();
  return campaign;
}

export function addMessage(campaignId: string, role: Message["role"], content: string, metadata?: Record<string, unknown>): Message {
  const message: Message = { id: id("msg"), campaignId, role, content, metadata, createdAt: now() };
  db.prepare(`INSERT INTO messages VALUES (@id,@campaignId,@role,@content,@metadata,@createdAt)`).run({
    ...message,
    metadata: metadata ? JSON.stringify(metadata) : null
  });
  return message;
}

export function getGameState(campaignId: string): GameState {
  const campaignRow = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(campaignId);
  if (!campaignRow) throw new Error("Campaign not found");
  const campaign = rowToCampaign(campaignRow);
  const character = rowToCharacter(db.prepare(`SELECT * FROM characters WHERE id = ?`).get(campaign.characterId));
  return {
    campaign,
    character,
    messages: db.prepare(`SELECT * FROM messages WHERE campaign_id = ? ORDER BY created_at ASC`).all(campaignId).map(rowToMessage),
    inventory: db.prepare(`SELECT * FROM inventory_items WHERE campaign_id = ? ORDER BY name ASC`).all(campaignId).map(rowToInventory),
    quests: db.prepare(`SELECT * FROM quests WHERE campaign_id = ? ORDER BY status ASC, title ASC`).all(campaignId).map(rowToQuest),
    npcs: db.prepare(`SELECT * FROM npcs WHERE campaign_id = ? ORDER BY name ASC`).all(campaignId).map(rowToNpc),
    locations: db.prepare(`SELECT * FROM locations WHERE campaign_id = ? ORDER BY name ASC`).all(campaignId).map(rowToLocation),
    memories: db.prepare(`SELECT * FROM memories WHERE campaign_id = ? ORDER BY importance DESC, created_at DESC LIMIT 20`).all(campaignId).map(rowToMemory),
    worldFacts: db.prepare(`SELECT * FROM world_facts WHERE campaign_id = ? ORDER BY priority DESC, created_at DESC`).all(campaignId).map(rowToWorldFact),
    artworks: db.prepare(`SELECT * FROM artworks WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 24`).all(campaignId).map(rowToArtwork)
  };
}

export function updateCharacterHp(characterId: string, hp: number) {
  db.prepare(`UPDATE characters SET hp = ? WHERE id = ?`).run(hp, characterId);
}

export function upsertInventory(campaignId: string, characterId: string, name: string, quantity: number, description: string) {
  const existing = db.prepare(`SELECT * FROM inventory_items WHERE campaign_id = ? AND lower(name) = lower(?)`).get(campaignId, name) as any;
  if (existing) db.prepare(`UPDATE inventory_items SET quantity = quantity + ?, description = COALESCE(NULLIF(?, ''), description) WHERE id = ?`).run(quantity, description, existing.id);
  else db.prepare(`INSERT INTO inventory_items VALUES (?,?,?,?,?,?)`).run(id("item"), campaignId, characterId, name, quantity, description);
}

export function removeInventory(campaignId: string, name: string, quantity: number) {
  const existing = db.prepare(`SELECT * FROM inventory_items WHERE campaign_id = ? AND lower(name) = lower(?)`).get(campaignId, name) as any;
  if (!existing) return;
  const next = existing.quantity - quantity;
  if (next <= 0) db.prepare(`DELETE FROM inventory_items WHERE id = ?`).run(existing.id);
  else db.prepare(`UPDATE inventory_items SET quantity = ? WHERE id = ?`).run(next, existing.id);
}

export function deleteCampaign(campaignId: string) {
  const state = getGameState(campaignId);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM messages WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM inventory_items WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM quests WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM npcs WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM locations WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM memories WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM world_facts WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM artworks WHERE campaign_id = ?`).run(campaignId);
    db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(campaignId);
    db.prepare(`DELETE FROM characters WHERE id = ?`).run(state.character.id);
  });
  tx();
}

export function addMemory(campaignId: string, content: string, importance: number) {
  db.prepare(`INSERT INTO memories VALUES (?,?,?,?,?)`).run(id("mem"), campaignId, content, importance, now());
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
}

export function addWorldFact(campaignId: string, category: WorldFact["category"], title: string, content: string, priority: number) {
  db.prepare(`INSERT INTO world_facts VALUES (?,?,?,?,?,?,?)`).run(id("fact"), campaignId, category, title, content, priority, now());
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
}

export function deleteWorldFact(campaignId: string, factId: string) {
  db.prepare(`DELETE FROM world_facts WHERE campaign_id = ? AND id = ?`).run(campaignId, factId);
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
}

export function addNpc(campaignId: string, name: string, disposition: string, notes: string, location?: string) {
  db.prepare(`INSERT INTO npcs VALUES (?,?,?,?,?,?)`).run(id("npc"), campaignId, name, disposition, notes, location ?? null);
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
}

export function addLocation(campaignId: string, name: string, description: string, discovered = true) {
  db.prepare(`INSERT INTO locations VALUES (?,?,?,?,?)`).run(id("loc"), campaignId, name, description, discovered ? 1 : 0);
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
}

export function setCharacterHp(campaignId: string, hp: number) {
  const state = getGameState(campaignId);
  updateCharacterHp(state.character.id, Math.max(0, Math.min(state.character.maxHp, hp)));
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
}

export function backupCampaign(campaignId: string) {
  const state = getGameState(campaignId);
  const backups = path.join(dataDir, "backups");
  fs.mkdirSync(backups, { recursive: true });
  const safeName = state.campaign.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "campaign";
  const file = path.join(backups, `${safeName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  return { file, state };
}

export function addArtwork(input: Omit<Artwork, "id" | "createdAt">): Artwork {
  const artwork: Artwork = { ...input, id: id("art"), createdAt: now() };
  db.prepare(`
    INSERT INTO artworks (id,campaign_id,character_id,item_id,kind,title,prompt,image_url,source,created_at)
    VALUES (@id,@campaignId,@characterId,@itemId,@kind,@title,@prompt,@imageUrl,@source,@createdAt)
  `).run({
    ...artwork,
    characterId: artwork.characterId ?? null,
    itemId: artwork.itemId ?? null
  });
  db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), artwork.campaignId);
  return artwork;
}
