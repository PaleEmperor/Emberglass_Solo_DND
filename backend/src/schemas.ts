import { z } from "zod";

export const StateChangeSchema = z.object({
  healthDelta: z.number().int().min(-50).max(50).optional(),
  addInventory: z.array(z.object({
    name: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(20).default(1),
    description: z.string().max(300).default("")
  })).default([]),
  removeInventory: z.array(z.object({
    name: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(20).default(1)
  })).default([]),
  newQuests: z.array(z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(500),
    reward: z.string().max(200).default("")
  })).default([]),
  questUpdates: z.array(z.object({
    title: z.string().min(1).max(120),
    progress: z.string().max(500),
    status: z.enum(["active", "completed", "failed"]).default("active")
  })).default([]),
  npcs: z.array(z.object({
    name: z.string().min(1).max(80),
    disposition: z.string().max(80).default("unknown"),
    notes: z.string().max(500),
    location: z.string().max(120).optional()
  })).default([]),
  locations: z.array(z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500)
  })).default([]),
  memories: z.array(z.object({
    content: z.string().min(1).max(500),
    importance: z.number().int().min(1).max(5).default(3)
  })).default([]),
  campaignSummary: z.string().max(1200).optional()
});

export type StateChange = z.infer<typeof StateChangeSchema>;

export const LlmEnvelopeSchema = z.object({
  narration: z.string().min(1),
  stateChanges: StateChangeSchema.default({})
});

export type LlmEnvelope = z.infer<typeof LlmEnvelopeSchema>;
