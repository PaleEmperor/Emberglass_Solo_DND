import { db, addMessage, getGameState, removeInventory, updateCharacterHp, upsertInventory } from "./db";
import { inferCheck, rollSkillCheck } from "./dice";
import { generateNarration } from "./llm";
import { StateChangeSchema, type StateChange } from "./schemas";
import { clamp, id, now } from "./util";
import type { AdventureResponse } from "../../shared/types";

function applyStateChanges(campaignId: string, raw: StateChange) {
  const state = getGameState(campaignId);
  const changes = StateChangeSchema.parse(raw);
  const tx = db.transaction(() => {
    if (typeof changes.healthDelta === "number") {
      updateCharacterHp(state.character.id, clamp(state.character.hp + changes.healthDelta, 0, state.character.maxHp));
    }
    for (const item of changes.addInventory) upsertInventory(campaignId, state.character.id, item.name, item.quantity, item.description);
    for (const item of changes.removeInventory) removeInventory(campaignId, item.name, item.quantity);
    for (const quest of changes.newQuests) {
      const existing = db.prepare(`SELECT id FROM quests WHERE campaign_id = ? AND lower(title) = lower(?)`).get(campaignId, quest.title);
      if (!existing) db.prepare(`INSERT INTO quests VALUES (?,?,?,?,?,?,?)`).run(id("quest"), campaignId, quest.title, "active", quest.description, "Started.", quest.reward);
    }
    for (const update of changes.questUpdates) {
      const existing = db.prepare(`SELECT id FROM quests WHERE campaign_id = ? AND lower(title) = lower(?)`).get(campaignId, update.title) as any;
      if (existing) db.prepare(`UPDATE quests SET progress = ?, status = ? WHERE id = ?`).run(update.progress, update.status, existing.id);
    }
    for (const npc of changes.npcs) {
      const existing = db.prepare(`SELECT id FROM npcs WHERE campaign_id = ? AND lower(name) = lower(?)`).get(campaignId, npc.name) as any;
      if (existing) db.prepare(`UPDATE npcs SET disposition = ?, notes = ?, location = ? WHERE id = ?`).run(npc.disposition, npc.notes, npc.location ?? null, existing.id);
      else db.prepare(`INSERT INTO npcs VALUES (?,?,?,?,?,?)`).run(id("npc"), campaignId, npc.name, npc.disposition, npc.notes, npc.location ?? null);
    }
    for (const location of changes.locations) {
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
  const playerMessage = addMessage(campaignId, "player", action, { rolls });
  const { envelope, mode } = await generateNarration(before, action, rolls);
  const dmMessage = addMessage(campaignId, "dm", envelope.narration, { stateChanges: envelope.stateChanges, llmMode: mode });
  applyStateChanges(campaignId, envelope.stateChanges);
  return { state: getGameState(campaignId), dmMessage, playerMessage, rolls, llmMode: mode };
}
