import { createCampaign, createCharacter, db } from "./db";

export function ensureSeedData() {
  const count = db.prepare(`SELECT count(*) AS total FROM campaigns`).get() as { total: number };
  if (count.total > 0) return;
  const character = createCharacter({
    name: "Seren Ashvale",
    role: "Ranger",
    ancestry: "Human",
    background: "Carried sealed letters through wolf weather and border trouble. Still reads roads, faces, and debts better than most books.",
    maxHp: 12,
    hp: 12,
    stats: { strength: 12, dexterity: 16, constitution: 13, intelligence: 11, wisdom: 15, charisma: 10 },
    spells: ["Hunter's Mark", "Cure Wounds"]
  });
  createCampaign(character, "The Emberglass Cellar", "rain on leaded glass, old stone under warm floorboards");
}
