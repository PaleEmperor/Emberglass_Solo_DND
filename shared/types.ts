export type AbilityKey = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

export type Character = {
  id: string;
  name: string;
  role: string;
  ancestry: string;
  background: string;
  appearance: string;
  level: number;
  xp: number;
  maxHp: number;
  hp: number;
  stats: Record<AbilityKey, number>;
  spells: string[];
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  tone: string;
  summary: string;
  characterId: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  campaignId: string;
  role: "player" | "dm" | "system";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type InventoryItem = {
  id: string;
  campaignId: string;
  characterId: string;
  name: string;
  quantity: number;
  description: string;
};

export type Quest = {
  id: string;
  campaignId: string;
  title: string;
  status: "active" | "completed" | "failed";
  description: string;
  progress: string;
  reward: string;
  xpReward: number;
};

export type Npc = {
  id: string;
  campaignId: string;
  name: string;
  disposition: string;
  notes: string;
  location?: string;
};

export type Location = {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  discovered: boolean;
};

export type Memory = {
  id: string;
  campaignId: string;
  content: string;
  importance: number;
  createdAt: string;
};

export type WorldFactCategory = "law" | "lore" | "faction" | "danger" | "tone" | "custom";

export type WorldFact = {
  id: string;
  campaignId: string;
  category: WorldFactCategory;
  title: string;
  content: string;
  priority: number;
  createdAt: string;
};

export type Artwork = {
  id: string;
  campaignId: string;
  characterId?: string;
  itemId?: string;
  kind: "portrait" | "scene" | "item" | "npc" | "location";
  title: string;
  prompt: string;
  imageUrl: string;
  source: "sd-webui" | "fallback";
  createdAt: string;
};

export type DiceRoll = {
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
  reason: string;
};

export type GameState = {
  character: Character;
  campaign: Campaign;
  messages: Message[];
  inventory: InventoryItem[];
  quests: Quest[];
  npcs: Npc[];
  locations: Location[];
  memories: Memory[];
  worldFacts: WorldFact[];
  artworks: Artwork[];
};

export type AdventureResponse = {
  state: GameState;
  dmMessage: Message;
  playerMessage: Message;
  rolls: DiceRoll[];
  llmMode: "ollama" | "mock";
};
