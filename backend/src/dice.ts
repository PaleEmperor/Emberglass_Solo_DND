import type { AbilityKey, Character, DiceRoll } from "../../shared/types";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollNotation(notation: string, reason = "Cast by hand"): DiceRoll {
  const match = notation.trim().toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error("Use dice like d20, 2d6, or 1d20+3");
  const count = Math.min(Number(match[1] || 1), 20);
  const sides = Math.min(Number(match[2]), 100);
  const modifier = Number(match[3] || 0);
  if (count < 1 || sides < 2) throw new Error("Invalid dice notation");
  const rolls = Array.from({ length: count }, () => rollDie(sides));
  return {
    notation,
    rolls,
    modifier,
    total: rolls.reduce((sum, roll) => sum + roll, modifier),
    reason
  };
}

export function rollSkillCheck(character: Character, ability: AbilityKey, dc: number, reason: string): DiceRoll {
  const base = rollDie(20);
  const modifier = abilityModifier(character.stats[ability]);
  const total = base + modifier;
  return {
    notation: `1d20${modifier >= 0 ? "+" : ""}${modifier}`,
    rolls: [base],
    modifier,
    total,
    dc,
    success: total >= dc,
    reason
  };
}

export function inferCheck(action: string): { ability: AbilityKey; dc: number; reason: string } | null {
  const text = action.toLowerCase();
  const match = (words: string[]) => words.some((word) => text.includes(word));
  if (match(["sneak", "hide", "stealth", "pick lock", "dodge"])) {
    return { ability: "dexterity", dc: 13, reason: "Dexterity check for a precise or stealthy action" };
  }
  if (match(["attack", "strike", "force", "break", "lift", "push", "grapple"])) {
    return { ability: "strength", dc: 13, reason: "Strength check for a forceful action" };
  }
  if (match(["recall", "study", "arcana", "investigate", "inspect", "decipher"])) {
    return { ability: "intelligence", dc: 12, reason: "Intelligence check for investigation or lore" };
  }
  if (match(["listen", "search", "track", "sense", "notice", "perceive"])) {
    return { ability: "wisdom", dc: 12, reason: "Wisdom check for awareness and intuition" };
  }
  if (match(["persuade", "deceive", "intimidate", "perform", "charm", "convince"])) {
    return { ability: "charisma", dc: 13, reason: "Charisma check for social influence" };
  }
  if (match(["endure", "resist", "survive", "poison", "cold", "fatigue"])) {
    return { ability: "constitution", dc: 12, reason: "Constitution check for endurance" };
  }
  return null;
}
