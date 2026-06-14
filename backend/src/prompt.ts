import type { DiceRoll, GameState } from "../../shared/types";

export function buildDmPrompt(state: GameState, action: string, rolls: DiceRoll[]) {
  const recent = state.messages.slice(-10).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  return [
    {
      role: "system",
      content: `You are the hearthvoice of a solo dark fantasy tabletop campaign: intimate, grounded, sensory, and specific.
Respect established state. Do not control the player's decisions. Keep continuity with the campaign summary, NPCs, locations, quests, inventory, memories, and user-authored world truths.
User-authored world truths are canon. Treat them as higher priority than improvisation and do not contradict them unless the player explicitly changes them.
Write like a careful human game master at a candlelit table. Prefer concrete details, restrained menace, and consequences the player can act on.
Avoid generic fantasy filler, purple prose, meta commentary, and phrases like "the air crackles with magic", "destiny awaits", "the world answers", "you feel a sense of", or "as an AI".
Do not summarize the player's input as "you decide to..." unless it matters. Show what changes in the scene.
If a roll is provided, honor its success or failure.
Return only valid JSON with this shape:
{"narration":"2-5 paragraphs of narration","stateChanges":{"healthDelta":0,"addInventory":[],"removeInventory":[],"newQuests":[],"questUpdates":[],"npcs":[],"locations":[],"memories":[],"campaignSummary":"optional concise updated summary"}}
Only include plausible state changes caused by the current action. Do not grant major rewards without earning them.`
    },
    {
      role: "user",
      content: `Campaign: ${state.campaign.name}
Tone: ${state.campaign.tone}
Summary: ${state.campaign.summary}

Character:
${state.character.name}, level ${state.character.level} ${state.character.ancestry} ${state.character.role}
HP: ${state.character.hp}/${state.character.maxHp}
Stats: ${JSON.stringify(state.character.stats)}
Spells/abilities: ${state.character.spells.join(", ") || "none"}

Inventory: ${state.inventory.map((i) => `${i.quantity}x ${i.name}`).join(", ") || "empty"}
Active quests: ${state.quests.filter((q) => q.status === "active").map((q) => `${q.title}: ${q.progress}`).join(" | ") || "none"}
NPCs: ${state.npcs.map((n) => `${n.name} (${n.disposition}): ${n.notes}`).join(" | ") || "none"}
Locations: ${state.locations.map((l) => `${l.name}: ${l.description}`).join(" | ") || "none"}
User-authored world truths: ${state.worldFacts.map((f) => `[${f.category.toUpperCase()} priority ${f.priority}] ${f.title}: ${f.content}`).join(" | ") || "none"}
Important memories: ${state.memories.map((m) => m.content).join(" | ") || "none"}

Recent story:
${recent}

Player action: ${action}
Dice results: ${rolls.length ? rolls.map((r) => `${r.reason}: ${r.total} vs DC ${r.dc} (${r.success ? "success" : "failure"})`).join("; ") : "No roll was required by the deterministic engine."}`
    }
  ];
}
