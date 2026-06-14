import { LlmEnvelopeSchema, type LlmEnvelope } from "./schemas";
import type { DiceRoll, GameState } from "../../shared/types";
import { buildDmPrompt } from "./prompt";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in model response");
  return JSON.parse(match[0]);
}

export async function generateNarration(state: GameState, action: string, rolls: DiceRoll[]): Promise<{ envelope: LlmEnvelope; mode: "ollama" | "mock" }> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: "json",
        messages: buildDmPrompt(state, action, rolls),
        options: { temperature: 0.75, num_ctx: 8192 }
      }),
      signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json() as { message?: { content?: string } };
    const parsed = LlmEnvelopeSchema.parse(extractJson(data.message?.content ?? ""));
    return { envelope: parsed, mode: "ollama" };
  } catch {
    return { envelope: mockNarration(state, action, rolls), mode: "mock" };
  }
}

function mockNarration(state: GameState, action: string, rolls: DiceRoll[]): LlmEnvelope {
  const roll = rolls[0];
  const result = roll ? (roll.success ? "The old place gives way by an inch." : "The old place takes its inch back.") : "The room seems to notice.";
  const cellar = state.locations.some((l) => l.name.toLowerCase().includes("cellar"));
  return {
    narration: `You set yourself to it: ${action}\n\n${result} Candlelight crawls along the wet grain of the floorboards. Beneath them, stone shifts with a patient scrape, and a breath of cold air climbs through the cracks smelling of rainwater, rust, and shut-away years.\n\nMara Vell does not interrupt. She only turns the cellar key once in her palm and watches the room the way sailors watch a black horizon.`,
    stateChanges: {
      addInventory: [],
      removeInventory: [],
      newQuests: [],
      questUpdates: [],
      npcs: [],
      locations: cellar ? [] : [{ name: "Cellar Stair", description: "A narrow stair beneath the ale barrels, slick with old mortar and scored by fresh drag marks." }],
      memories: [{ content: `${state.character.name} pressed deeper into the matter of the cellar: ${action}`, importance: 2 }],
      campaignSummary: `${state.campaign.summary} Lately: ${action}`
    }
  };
}
