import { LlmEnvelopeSchema, type LlmEnvelope } from "./schemas";
import { z } from "zod";
import type { Character, DiceRoll, GameState } from "../../shared/types";
import { buildDmPrompt } from "./prompt";
import type { CampaignSeed } from "./db";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in model response");
  return JSON.parse(match[0]);
}

function cleanNarration(text: string) {
  return text
    .replace(/(?:\n|\r|\s)*(?:StateChanges|stateChanges|STATECHANGES)\s*:\s*[\s\S]*$/u, "")
    .replace(/(?:\n|\r|\s)*```(?:json)?\s*[\s\S]*$/u, "")
    .trim();
}

const CampaignSeedSchema = z.object({
  name: z.string().min(1).max(200),
  tone: z.string().min(1).max(1500),
  premise: z.string().min(1).max(3000),
  startingLocation: z.string().min(1).max(200),
  startingLocationDescription: z.string().min(1).max(1600),
  openingNpcName: z.string().min(1).max(200),
  openingNpcDisposition: z.string().min(1).max(240),
  openingNpcNotes: z.string().min(1).max(1600),
  questTitle: z.string().min(1).max(200),
  questDescription: z.string().min(1).max(1600),
  questProgress: z.string().min(1).max(1600),
  questReward: z.string().max(800),
  questXpReward: z.coerce.number().int().min(50).max(600),
  openingMessage: z.string().min(1).max(5000),
  memory: z.string().min(1).max(1600),
  startingItems: z.array(z.object({
    name: z.string().min(1).max(160),
    quantity: z.coerce.number().int().min(1).max(20),
    description: z.string().min(1).max(1000)
  })).min(1).max(6)
});

const CampaignSeedJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    tone: { type: "string", minLength: 1 },
    premise: { type: "string", minLength: 1 },
    startingLocation: { type: "string", minLength: 1 },
    startingLocationDescription: { type: "string", minLength: 1 },
    openingNpcName: { type: "string", minLength: 1 },
    openingNpcDisposition: { type: "string", minLength: 1 },
    openingNpcNotes: { type: "string", minLength: 1 },
    questTitle: { type: "string", minLength: 1 },
    questDescription: { type: "string", minLength: 1 },
    questProgress: { type: "string", minLength: 1 },
    questReward: { type: "string" },
    questXpReward: { type: "integer", minimum: 50, maximum: 600 },
    openingMessage: { type: "string", minLength: 1 },
    memory: { type: "string", minLength: 1 },
    startingItems: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1 },
          quantity: { type: "integer", minimum: 1, maximum: 20 },
          description: { type: "string", minLength: 1 }
        },
        required: ["name", "quantity", "description"]
      }
    }
  },
  required: [
    "name",
    "tone",
    "premise",
    "startingLocation",
    "startingLocationDescription",
    "openingNpcName",
    "openingNpcDisposition",
    "openingNpcNotes",
    "questTitle",
    "questDescription",
    "questProgress",
    "questReward",
    "questXpReward",
    "openingMessage",
    "memory",
    "startingItems"
  ]
} as const;

const namedQuantitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    quantity: { type: "integer", minimum: 1, maximum: 20 },
    description: { type: "string" }
  },
  required: ["name", "quantity", "description"]
} as const;

const LlmEnvelopeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    narration: { type: "string", minLength: 1 },
    stateChanges: {
      type: "object",
      additionalProperties: false,
      properties: {
        healthDelta: { type: "integer", minimum: -50, maximum: 50 },
        xpDelta: { type: "integer", minimum: 0, maximum: 5000 },
        addInventory: {
          type: "array",
          items: namedQuantitySchema
        },
        removeInventory: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1 },
              quantity: { type: "integer", minimum: 1, maximum: 20 }
            },
            required: ["name", "quantity"]
          }
        },
        addAbilities: { type: "array", items: { type: "string", minLength: 1 } },
        removeAbilities: { type: "array", items: { type: "string", minLength: 1 } },
        newQuests: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", minLength: 1 },
              description: { type: "string" },
              progress: { type: "string" },
              reward: { type: "string" },
              xpReward: { type: "integer", minimum: 0, maximum: 5000 }
            },
            required: ["title", "description", "progress", "reward", "xpReward"]
          }
        },
        questUpdates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", minLength: 1 },
              progress: { type: "string" },
              status: { type: "string", enum: ["active", "completed", "failed"] }
            },
            required: ["title", "progress", "status"]
          }
        },
        npcs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1 },
              disposition: { type: "string" },
              notes: { type: "string" },
              location: { type: "string" }
            },
            required: ["name", "disposition", "notes"]
          }
        },
        locations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1 },
              description: { type: "string" }
            },
            required: ["name", "description"]
          }
        },
        memories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              content: { type: "string", minLength: 1 },
              importance: { type: "integer", minimum: 1, maximum: 5 }
            },
            required: ["content", "importance"]
          }
        },
        campaignSummary: { type: "string" }
      },
      required: ["addInventory", "removeInventory", "addAbilities", "removeAbilities", "newQuests", "questUpdates", "npcs", "locations", "memories"]
    }
  },
  required: ["narration", "stateChanges"]
} as const;

type SeedCharacter = Pick<Character, "name" | "role" | "ancestry" | "background" | "appearance" | "stats" | "spells">;

async function completeCampaignSeedFields(seed: unknown, context: { campaignName: string; tone: string; premise: string; character: SeedCharacter }, missingFields: string[], validationErrors = "", attempt = 1): Promise<CampaignSeed> {
  if (!seed || typeof seed !== "object" || Array.isArray(seed) || missingFields.length === 0) {
    throw new Error("Local narrator returned an invalid campaign seed");
  }
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: CampaignSeedJsonSchema,
      messages: [
        {
          role: "system",
          content: [
            "Fill only the requested missing campaign seed fields.",
            "Return one flat JSON object whose keys are exactly the missing field names.",
            "All fields are non-empty strings except questXpReward, which is an integer from 50 to 600.",
            "No markdown, no wrapper key, no empty values, no placeholders."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({ context, currentSeed: seed, missingFields, validationErrors })
        }
      ],
      options: { temperature: 0.55, top_p: 0.9, repeat_penalty: 1.05, num_ctx: 8192 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error(`Local narrator returned ${response.status}`);
  const data = await response.json() as { message?: { content?: string } };
  const completed = extractJson(data.message?.content ?? "");
  if (!completed || typeof completed !== "object" || Array.isArray(completed)) throw new Error("Local narrator returned invalid field completions");
  const merged = { ...seed, ...completed };
  const parsed = CampaignSeedSchema.safeParse(merged);
  if (!parsed.success) {
    if (attempt >= 2) throw new Error(`Local narrator returned an invalid campaign seed: ${parsed.error.message}`);
    const nextMissing = parsed.error.issues
      .filter((issue) => issue.path.length === 1 && (issue.code === "too_small" || issue.code === "invalid_type"))
      .map((issue) => String(issue.path[0]));
    return completeCampaignSeedFields(merged, context, [...new Set(nextMissing)], parsed.error.message, attempt + 1);
  }
  return { ...parsed.data, name: context.campaignName, tone: context.tone };
}

async function repairCampaignSeed(raw: unknown, context: { campaignName: string; tone: string; premise: string; character: SeedCharacter }, validationErrors: string, attempt = 1): Promise<CampaignSeed> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: CampaignSeedJsonSchema,
      messages: [
        {
          role: "system",
          content: [
            "Repair this campaign seed into exactly the required JSON object.",
            "Return only the object. No markdown. No wrapper key.",
            "Do not use placeholders or templates. Preserve and complete the creative content from the draft.",
            "Every required string must be non-empty. If a field is empty or missing, invent specific fitting content from the context.",
            "Required shape: {\"name\":\"...\",\"tone\":\"...\",\"premise\":\"...\",\"startingLocation\":\"...\",\"startingLocationDescription\":\"...\",\"openingNpcName\":\"...\",\"openingNpcDisposition\":\"...\",\"openingNpcNotes\":\"...\",\"questTitle\":\"...\",\"questDescription\":\"...\",\"questProgress\":\"...\",\"questReward\":\"...\",\"questXpReward\":150,\"openingMessage\":\"...\",\"memory\":\"...\",\"startingItems\":[{\"name\":\"...\",\"quantity\":1,\"description\":\"...\"}]}."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({ context, validationErrors, draft: raw })
        }
      ],
      options: { temperature: 0.35, top_p: 0.9, repeat_penalty: 1.06, num_ctx: 8192 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`Local narrator returned ${response.status}`);
  const data = await response.json() as { message?: { content?: string } };
  const repaired = extractJson(data.message?.content ?? "");
  const parsed = CampaignSeedSchema.safeParse(repaired);
  if (!parsed.success) {
    if (attempt >= 2) {
      const missingFields = parsed.error.issues
        .filter((issue) => issue.path.length === 1 && (issue.code === "too_small" || issue.code === "invalid_type"))
        .map((issue) => String(issue.path[0]));
      return completeCampaignSeedFields(repaired, context, [...new Set(missingFields)], parsed.error.message);
    }
    const secondPass = await repairCampaignSeed(repaired, context, parsed.error.message, attempt + 1);
    return { ...secondPass, name: context.campaignName, tone: context.tone };
  }
  return { ...parsed.data, name: context.campaignName, tone: context.tone };
}

export async function generateCampaignSeed(input: { campaignName: string; tone: string; premise: string; mode: "new" | "restart" }, character: SeedCharacter): Promise<CampaignSeed> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: CampaignSeedJsonSchema,
      messages: [
        {
          role: "system",
          content: [
            "You generate the starting state for a local solo tabletop RPG campaign.",
            "Return only valid JSON matching the requested keys. Do not include markdown.",
            "Everything must be newly invented by you from the premise and character. Do not use templates, stock taverns, placeholder names, or repeated examples.",
            "For restarts, keep the same campaign premise, tone, and player character, but create a fresh opening scene, starting location, first NPC, first quest, and starting details.",
            "Do not mention Emberglass, Mara, Copper Veil, cellars, taverns, servants, balcony doors, wax seals, or any prior sample unless the user's premise explicitly asks for them.",
            "The openingMessage is the first narrator chat message. Write it like a grounded human GM: concrete scene, NPC behavior, immediate situation.",
            "Do not give A/B/C choices. Do not write 'you can'. Do not tell the player what they feel, notice, or choose. Do not end with a menu or instruction.",
            "The narrator controls the world and NPCs only. The player controls the character.",
            "Use plain, low-cheese language. Avoid grand declarations, prophecy-speak, and repeated dramatic abstractions."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            returnExactlyThisShape: {
              name: "string",
              tone: "string",
              premise: "string",
              startingLocation: "string",
              startingLocationDescription: "string",
              openingNpcName: "string",
              openingNpcDisposition: "string",
              openingNpcNotes: "string",
              questTitle: "string",
              questDescription: "string",
              questProgress: "string",
              questReward: "string",
              questXpReward: 150,
              openingMessage: "string",
              memory: "string",
              startingItems: [{ name: "string", quantity: 1, description: "string" }]
            },
            mode: input.mode,
            campaignName: input.campaignName,
            tone: input.tone,
            premise: input.premise,
            character,
            startingItems: "Invent 2 to 4 practical items that fit the character and opening situation.",
            openingMessage: "Write 3 to 5 short paragraphs. Start in the scene. Include the first NPC doing or saying something specific. Leave the moment open without offering listed actions."
          })
        }
      ],
      options: { temperature: 0.92, top_p: 0.95, repeat_penalty: 1.08, num_ctx: 8192 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`Local narrator returned ${response.status}`);
  const data = await response.json() as { message?: { content?: string } };
  const raw = extractJson(data.message?.content ?? "");
  const parsed = CampaignSeedSchema.safeParse(raw);
  if (parsed.success) return { ...parsed.data, name: input.campaignName, tone: input.tone };
  return repairCampaignSeed(raw, { campaignName: input.campaignName, tone: input.tone, premise: input.premise, character }, parsed.error.message);
}

export async function generateNarration(state: GameState, action: string, rolls: DiceRoll[]): Promise<{ envelope: LlmEnvelope; mode: "ollama" }> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: LlmEnvelopeJsonSchema,
      messages: buildDmPrompt(state, action, rolls),
      options: { temperature: 0.55, top_p: 0.9, repeat_penalty: 1.12, num_ctx: 8192 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error(`Local narrator returned ${response.status}`);
  const data = await response.json() as { message?: { content?: string } };
  const parsed = LlmEnvelopeSchema.parse(extractJson(data.message?.content ?? ""));
  const narration = cleanNarration(parsed.narration);
  if (!narration) throw new Error("Local narrator returned state data without narration");
  return { envelope: { ...parsed, narration }, mode: "ollama" };
}
