import express from "express";
import cors from "cors";
import path from "node:path";
import { z } from "zod";
import { addLocation, addMemory, addNpc, addWorldFact, backupCampaign, createCampaign, createCharacter, deleteCampaign, deleteWorldFact, getGameState, listCampaigns, migrate, setCharacterHp, type CampaignSeed } from "./db";
import { ensureSeedData } from "./seed";
import { handleAdventureAction } from "./engine";
import { rollNotation } from "./dice";
import { createArtwork } from "./art";

migrate();
ensureSeedData();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/artwork", express.static(path.resolve("data", "artwork")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/llm/status", async (_req, res) => {
  try {
    const response = await fetch(`${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json() as { models?: Array<{ name: string; size?: number }> };
    res.json({ available: true, model: process.env.OLLAMA_MODEL ?? "llama3.2:3b", models: data.models ?? [] });
  } catch {
    res.json({ available: false, model: process.env.OLLAMA_MODEL ?? "llama3.2:3b", models: [] });
  }
});
app.get("/api/image/status", async (_req, res) => {
  try {
    const response = await fetch(`${process.env.SD_WEBUI_URL ?? "http://127.0.0.1:7860"}/sdapi/v1/options`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Image forge returned ${response.status}`);
    res.json({ available: true, url: process.env.SD_WEBUI_URL ?? "http://127.0.0.1:7860" });
  } catch {
    res.json({ available: false, url: process.env.SD_WEBUI_URL ?? "http://127.0.0.1:7860" });
  }
});
app.get("/api/campaigns", (_req, res) => res.json(listCampaigns()));
app.get("/api/campaigns/:id", (req, res) => {
  try {
    res.json(getGameState(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Not found" });
  }
});

app.get("/api/campaigns/:id/export", (req, res) => {
  try {
    const state = getGameState(req.params.id);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${state.campaign.name.replace(/[^a-z0-9]+/gi, "-")}.json"`);
    res.send(JSON.stringify(state, null, 2));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Not found" });
  }
});

app.get("/api/campaigns/:id/narrator-insight", (req, res) => {
  try {
    const state = getGameState(req.params.id);
    const activeQuest = state.quests.find((quest) => quest.status === "active");
    const bindingTruths = state.worldFacts.filter((fact) => fact.category === "law" || fact.category === "tone").slice(0, 8);
    res.json({
      believes: [
        `This campaign is currently about ${state.campaign.summary}`,
        activeQuest ? `The strongest pressure is ${activeQuest.title}: ${activeQuest.progress}` : "No active oath is pulling the story yet.",
        `${state.character.name} is the center of the frame; the narrator should challenge them, not replace their choices.`
      ],
      worldRules: bindingTruths.map((fact) => `${fact.title}: ${fact.content}`),
      cast: state.npcs.slice(0, 8).map((npc) => `${npc.name} (${npc.disposition})${npc.location ? ` near ${npc.location}` : ""}: ${npc.notes}`),
      places: state.locations.slice(0, 8).map((location) => `${location.name}: ${location.description}`),
      unanswered: [
        ...state.worldFacts.filter((fact) => fact.category === "danger" || fact.category === "lore").slice(0, 5).map((fact) => `${fact.title}: ${fact.content}`),
        ...state.memories.slice(0, 5).map((memory) => memory.content)
      ].slice(0, 8)
    });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Not found" });
  }
});

app.post("/api/campaigns/:id/backup", (req, res) => {
  try {
    res.json(backupCampaign(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Not found" });
  }
});

app.delete("/api/campaigns/:id", (req, res) => {
  try {
    deleteCampaign(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Not found" });
  }
});

const CharacterSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(80),
  ancestry: z.string().min(1).max(80),
  background: z.string().min(1).max(500),
  maxHp: z.number().int().min(1).max(40),
  hp: z.number().int().min(1).max(40),
  stats: z.object({
    strength: z.number().int().min(3).max(20),
    dexterity: z.number().int().min(3).max(20),
    constitution: z.number().int().min(3).max(20),
    intelligence: z.number().int().min(3).max(20),
    wisdom: z.number().int().min(3).max(20),
    charisma: z.number().int().min(3).max(20)
  }),
  spells: z.array(z.string().min(1).max(80)).max(10)
});

function seedFromPrompt(input: { campaignName: string; tone: string; premise: string }, character: ReturnType<typeof createCharacter>): Partial<CampaignSeed> {
  const premise = input.premise.trim();
  const lower = premise.toLowerCase();
  const sea = /sea|ship|island|pirate|coast|harbor|storm/.test(lower);
  const city = /city|guild|noble|court|thief|street|mask|politic/.test(lower);
  const wild = /forest|swamp|mountain|wilderness|beast|ruin|ancient/.test(lower);
  const start = sea ? "The Lantern Quay" : city ? "The Copper Veil Inn" : wild ? "The Moss-Gate Camp" : "The Wayside Hearth";
  const npc = sea ? "Captain Ilyra Voss" : city ? "Vey Corren" : wild ? "Old Renn" : "Mara Vell";
  const hook = sea
    ? "A tide-stained chart has surfaced, and three crews have already bled over its missing corner."
    : city
      ? "A sealed invitation, a dead courier, and a locked balcony door have all named the same hour."
      : wild
        ? "Something old has shifted under root and stone, driving animals silent and travelers off the road."
        : "A quiet place has begun keeping a secret too large for its walls.";
  return {
    name: input.campaignName,
    tone: input.tone,
    premise: `${character.name}, a ${character.ancestry} ${character.role}, steps into ${input.campaignName}: ${premise}`,
    startingLocation: start,
    startingLocationDescription: sea
      ? "Wet rope, gull cries, black water under lanternlight, and ships creaking like old bones."
      : city
        ? "Velvet booths, shuttered alcoves, and enough whispered bargains to warm the room."
        : wild
          ? "A ring of low fires at the edge of old trees, where every path looks recently watched."
          : "A warm room at the edge of trouble, with rain at the windows and rumors under every cup.",
    openingNpcName: npc,
    openingNpcDisposition: "cautious patron",
    openingNpcNotes: `${npc} knows the first true thing about the trouble, and is afraid to say it too loudly.`,
    questTitle: sea ? "The Missing Corner" : city ? "The Hour Behind the Door" : wild ? "The Silence Under Root" : "The First Loose Thread",
    questDescription: hook,
    questProgress: "Learn what is true, who is lying, and why the matter has reached your hands tonight.",
    questReward: "Coin enough for the road, a dangerous favor, and first claim on whatever truth survives.",
    openingMessage: `${start} holds its breath around you. ${npc} waits until the nearest listeners turn away, then slides the problem across the table as if it might bite. "${premise}"`,
    memory: `Campaign premise: ${premise}`,
    startingItems: [
      { name: "Road-worn pack", quantity: 1, description: "Rations, flint, twine, chalk, a wrapped candle, and the small comforts that keep a bad night survivable." },
      { name: "Iron dagger", quantity: 1, description: "Plain, sharp, and easy to trust." }
    ]
  };
}

app.post("/api/campaigns", (req, res) => {
  try {
    const body = z.object({
      campaignName: z.string().min(1).max(120),
      tone: z.string().min(1).max(200),
      premise: z.string().min(1).max(1000).optional(),
      character: CharacterSchema
    }).parse(req.body);
    const character = createCharacter(body.character);
    const seed = body.premise ? seedFromPrompt({ campaignName: body.campaignName, tone: body.tone, premise: body.premise }, character) : undefined;
    const campaign = createCampaign(character, body.campaignName, body.tone, seed);
    res.status(201).json(getGameState(campaign.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
  }
});

app.post("/api/campaigns/:id/art", async (req, res) => {
  try {
    const body = z.object({
      kind: z.enum(["portrait", "scene"]),
      title: z.string().min(1).max(120).optional(),
      prompt: z.string().min(1).max(2000).optional()
    }).parse(req.body);
    const state = getGameState(req.params.id);
    const artwork = await createArtwork(req.params.id, state, body);
    res.status(201).json({ artwork, state: getGameState(req.params.id) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not paint this moment" });
  }
});

app.post("/api/campaigns/:id/action", async (req, res) => {
  try {
    const body = z.object({ action: z.string().min(1).max(1000) }).parse(req.body);
    res.json(await handleAdventureAction(req.params.id, body.action));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid action" });
  }
});

app.post("/api/campaigns/:id/rest", (req, res) => {
  try {
    const state = getGameState(req.params.id);
    setCharacterHp(req.params.id, state.character.maxHp);
    addMemory(req.params.id, `${state.character.name} took a safe rest and recovered to full health.`, 2);
    res.json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not rest" });
  }
});

app.post("/api/campaigns/:id/hp", (req, res) => {
  try {
    const body = z.object({ hp: z.number().int().min(0).max(999) }).parse(req.body);
    setCharacterHp(req.params.id, body.hp);
    res.json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not update HP" });
  }
});

app.post("/api/campaigns/:id/memory", (req, res) => {
  try {
    const body = z.object({ content: z.string().min(1).max(500), importance: z.number().int().min(1).max(5).default(3) }).parse(req.body);
    addMemory(req.params.id, body.content, body.importance);
    res.json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not add note" });
  }
});

app.post("/api/campaigns/:id/world-facts", (req, res) => {
  try {
    const body = z.object({
      category: z.enum(["law", "lore", "faction", "danger", "tone", "custom"]),
      title: z.string().min(1).max(120),
      content: z.string().min(1).max(1000),
      priority: z.number().int().min(1).max(5).default(4)
    }).parse(req.body);
    getGameState(req.params.id);
    addWorldFact(req.params.id, body.category, body.title, body.content, body.priority);
    res.status(201).json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not set this truth" });
  }
});

app.delete("/api/campaigns/:id/world-facts/:factId", (req, res) => {
  try {
    getGameState(req.params.id);
    deleteWorldFact(req.params.id, req.params.factId);
    res.json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not strike this truth" });
  }
});

app.post("/api/campaigns/:id/npcs", (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1).max(120),
      disposition: z.string().min(1).max(120),
      notes: z.string().min(1).max(1000),
      location: z.string().max(120).optional()
    }).parse(req.body);
    getGameState(req.params.id);
    addNpc(req.params.id, body.name, body.disposition, body.notes, body.location?.trim() || undefined);
    res.status(201).json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not add this person" });
  }
});

app.post("/api/campaigns/:id/locations", (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1).max(120),
      description: z.string().min(1).max(1000),
      discovered: z.boolean().default(true)
    }).parse(req.body);
    getGameState(req.params.id);
    addLocation(req.params.id, body.name, body.description, body.discovered);
    res.status(201).json(getGameState(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not add this place" });
  }
});

app.post("/api/tools/roll", (req, res) => {
  try {
    const body = z.object({ notation: z.string().min(2).max(20), reason: z.string().max(120).default("Cast by hand") }).parse(req.body);
    res.json(rollNotation(body.notation, body.reason));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not roll dice" });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`Local DnD DM backend running at http://127.0.0.1:${port}`);
});
