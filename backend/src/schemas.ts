import { z } from "zod";

const objectArray = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => z.preprocess(
  (value) => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : value,
  z.array(schema).default([])
);

export const StateChangeSchema = z.object({
  healthDelta: z.number().int().min(-50).max(50).optional(),
  xpDelta: z.number().int().min(0).max(5000).optional(),
  addInventory: objectArray(z.object({
    name: z.string().min(1).max(160),
    quantity: z.number().int().min(1).max(20).default(1),
    description: z.string().max(1200).default("")
  })),
  removeInventory: objectArray(z.object({
    name: z.string().min(1).max(160),
    quantity: z.number().int().min(1).max(20).default(1)
  })),
  addAbilities: z.array(z.string().min(1).max(240)).default([]),
  removeAbilities: z.array(z.string().min(1).max(240)).default([]),
  newQuests: objectArray(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1600),
    progress: z.string().max(1600).default("Accepted."),
    reward: z.string().max(800).default(""),
    xpReward: z.number().int().min(0).max(5000).default(100)
  })),
  questUpdates: objectArray(z.object({
    title: z.string().min(1).max(200),
    progress: z.string().max(1600),
    status: z.enum(["active", "completed", "failed"]).default("active")
  })),
  npcs: objectArray(z.object({
    name: z.string().min(1).max(200),
    disposition: z.string().max(240).default("unknown"),
    notes: z.string().max(1600),
    location: z.string().max(200).optional()
  })),
  locations: objectArray(z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1600)
  })),
  memories: objectArray(z.object({
    content: z.string().min(1).max(1600),
    importance: z.number().int().min(1).max(5).default(3)
  })),
  campaignSummary: z.string().max(3000).optional()
});

export type StateChange = z.infer<typeof StateChangeSchema>;

export const LlmEnvelopeSchema = z.object({
  narration: z.string().min(1),
  stateChanges: StateChangeSchema.default({})
});

export type LlmEnvelope = z.infer<typeof LlmEnvelopeSchema>;
