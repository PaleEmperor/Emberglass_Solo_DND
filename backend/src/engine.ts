import { db, addMessage, getGameState, removeInventory, updateCharacterHp, upsertInventory } from "./db";
import { inferCheck, rollSkillCheck } from "./dice";
import { generateNarration } from "./llm";
import { StateChangeSchema, type StateChange } from "./schemas";
import { clamp, id, now } from "./util";
import type { AdventureResponse } from "../../shared/types";

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function actionAcceptsQuest(action: string) {
  const lower = action.toLowerCase();
  return /\b(i\s+)?(accept|agree|promise|swear|commit|take\s+(the\s+)?(job|quest|contract|task|mission)|take\s+it\s+on|sign\s+on|hire\s+on|help\s+(her|him|them|the|with)|offer\s+to\s+help|say\s+(yes|i\s+will|i'll|i\s+can\s+help)|tell\s+.+\b(i\s+will|i'll|yes|i\s+accept|i\s+agree))\b/.test(lower);
}

function isLikelyPersonAsLocation(location: { name: string; description: string }, state: ReturnType<typeof getGameState>) {
  const name = normalizeName(location.name);
  if (name === normalizeName(state.character.name)) return true;
  if (state.npcs.some((npc) => name === normalizeName(npc.name))) return true;

  const description = location.description.toLowerCase();
  const personSignals = [
    " eyes", " gaze", " face", " jaw", " cheek", " skin", " hair", " hand", " hands",
    " armor", " coat", " cloak", " boots", " scars", " scarred", " voice", " expression",
    " woman", " man", " person", " stranger", " figure", " she ", " he ", " her ", " his "
  ];
  const placeSignals = [
    "road", "street", "bridge", "riverbank", "bank", "shore", "forest", "wood", "gate",
    "inn", "room", "hall", "house", "tower", "camp", "market", "square", "dock", "quay",
    "path", "trail", "field", "village", "city", "district", "cellar", "cave", "ruin"
  ];
  const personScore = personSignals.filter((signal) => description.includes(signal)).length;
  const placeScore = placeSignals.filter((signal) => description.includes(signal)).length;
  return personScore >= 2 && placeScore === 0;
}

const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

function levelForXp(xp: number) {
  let level = 1;
  for (let index = 0; index < xpThresholds.length; index += 1) {
    if (xp >= xpThresholds[index]) level = index + 1;
  }
  return Math.min(level, 20);
}

function addXp(characterId: string, currentXp: number, delta: number) {
  const xp = Math.max(0, currentXp + delta);
  db.prepare(`UPDATE characters SET xp = ?, level = ? WHERE id = ?`).run(xp, levelForXp(xp), characterId);
  return xp;
}

function applyStateChanges(campaignId: string, raw: StateChange, action: string) {
  const state = getGameState(campaignId);
  const changes = StateChangeSchema.parse(raw);
  const newQuests = actionAcceptsQuest(action) ? changes.newQuests : [];
  let currentXp = state.character.xp;
  const tx = db.transaction(() => {
    if (typeof changes.healthDelta === "number") {
      updateCharacterHp(state.character.id, clamp(state.character.hp + changes.healthDelta, 0, state.character.maxHp));
    }
    for (const item of changes.addInventory) upsertInventory(campaignId, state.character.id, item.name, item.quantity, item.description);
    for (const item of changes.removeInventory) removeInventory(campaignId, item.name, item.quantity);
    if (changes.addAbilities.length || changes.removeAbilities.length) {
      const removed = new Set(changes.removeAbilities.map(normalizeName));
      const existing = state.character.spells.filter((ability) => !removed.has(normalizeName(ability)));
      const seen = new Set(existing.map(normalizeName));
      for (const ability of changes.addAbilities) {
        const clean = ability.trim();
        if (clean && !seen.has(normalizeName(clean))) {
          existing.push(clean);
          seen.add(normalizeName(clean));
        }
      }
      db.prepare(`UPDATE characters SET spells = ? WHERE id = ?`).run(JSON.stringify(existing), state.character.id);
    }
    for (const quest of newQuests) {
      const existing = db.prepare(`SELECT id FROM quests WHERE campaign_id = ? AND lower(title) = lower(?)`).get(campaignId, quest.title);
      if (!existing) db.prepare(`INSERT INTO quests (id,campaign_id,title,status,description,progress,reward,xp_reward) VALUES (?,?,?,?,?,?,?,?)`).run(id("quest"), campaignId, quest.title, "active", quest.description, quest.progress, quest.reward, quest.xpReward);
    }
    for (const update of changes.questUpdates) {
      const existing = db.prepare(`SELECT id, status, xp_reward FROM quests WHERE campaign_id = ? AND lower(title) = lower(?)`).get(campaignId, update.title) as any;
      if (existing) {
        db.prepare(`UPDATE quests SET progress = ?, status = ? WHERE id = ?`).run(update.progress, update.status, existing.id);
        if (existing.status !== "completed" && update.status === "completed") {
          currentXp = addXp(state.character.id, currentXp, existing.xp_reward ?? 100);
        }
      }
    }
    if (changes.xpDelta) currentXp = addXp(state.character.id, currentXp, changes.xpDelta);
    for (const npc of changes.npcs) {
      const existing = db.prepare(`SELECT id FROM npcs WHERE campaign_id = ? AND lower(name) = lower(?)`).get(campaignId, npc.name) as any;
      if (existing) db.prepare(`UPDATE npcs SET disposition = ?, notes = ?, location = ? WHERE id = ?`).run(npc.disposition, npc.notes, npc.location ?? null, existing.id);
      else db.prepare(`INSERT INTO npcs VALUES (?,?,?,?,?,?)`).run(id("npc"), campaignId, npc.name, npc.disposition, npc.notes, npc.location ?? null);
    }
    for (const location of changes.locations.filter((entry) => !isLikelyPersonAsLocation(entry, state))) {
      const existing = db.prepare(`SELECT id FROM locations WHERE campaign_id = ? AND lower(name) = lower(?)`).get(campaignId, location.name) as any;
      if (existing) db.prepare(`UPDATE locations SET description = ?, discovered = 1 WHERE id = ?`).run(location.description, existing.id);
      else db.prepare(`INSERT INTO locations VALUES (?,?,?,?,?)`).run(id("loc"), campaignId, location.name, location.description, 1);
    }
    for (const memory of changes.memories) {
      db.prepare(`INSERT INTO memories VALUES (?,?,?,?,?)`).run(id("mem"), campaignId, memory.content, memory.importance, now());
    }
    if (changes.campaignSummary) {
      db.prepare(`UPDATE campaigns SET summary = ?, updated_at = ? WHERE id = ?`).run(changes.campaignSummary, now(), campaignId);
    } else {
      db.prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`).run(now(), campaignId);
    }
  });
  tx();
}

export async function handleAdventureAction(campaignId: string, action: string): Promise<AdventureResponse> {
  if (!action.trim()) throw new Error("Action is required");
  const before = getGameState(campaignId);
  const inferred = inferCheck(action);
  const rolls = inferred ? [rollSkillCheck(before.character, inferred.ability, inferred.dc, inferred.reason)] : [];
  const { envelope, mode } = await generateNarration(before, action, rolls);
  const playerMessage = addMessage(campaignId, "player", action, { rolls });
  const dmMessage = addMessage(campaignId, "dm", envelope.narration, { stateChanges: envelope.stateChanges, llmMode: mode });
  applyStateChanges(campaignId, envelope.stateChanges, action);
  return { state: getGameState(campaignId), dmMessage, playerMessage, rolls, llmMode: mode };
}
