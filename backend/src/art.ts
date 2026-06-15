import fs from "node:fs";
import path from "node:path";
import type { Artwork, GameState } from "../../shared/types";
import { addArtwork } from "./db";

const artDir = path.resolve("data", "artwork");
fs.mkdirSync(artDir, { recursive: true });

const SD_URL = process.env.SD_WEBUI_URL ?? "http://127.0.0.1:7860";

type ArtRequest = {
  kind: "portrait" | "scene" | "item" | "npc" | "location";
  itemId?: string;
  title?: string;
  prompt?: string;
  subjectName?: string;
  subjectDescription?: string;
};

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) || "art";
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(text: string, max = 34) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

export function buildArtPrompt(state: GameState, request: ArtRequest) {
  const character = state.character;
  const recentDm = [...state.messages].reverse().find((m) => m.role === "dm")?.content ?? state.campaign.summary;
  if (request.prompt?.trim()) return request.prompt.trim();

  if (request.kind === "portrait") {
    return [
      `high quality painted fantasy character portrait of ${character.name}`,
      `${character.ancestry} ${character.role}`,
      character.appearance ? `appearance: ${character.appearance}` : "appearance: grounded practical adventurer, distinctive face, worn travel clothing",
      `background: ${character.background}`,
      "candlelit tavern ambience, rain-muted shadows, grounded practical adventurer, expressive face, worn travel clothing, subtle class details",
      "painterly realism, rich texture, sharp eyes, cinematic portrait lighting, no text, no watermark"
    ].join(", ");
  }

  if (request.kind === "item") {
    const item = state.inventory.find((entry) => entry.id === request.itemId || entry.name === request.title);
    return [
      "high quality painted fantasy item illustration",
      `item: ${item?.name ?? request.title ?? "adventuring item"}`,
      item?.description ? `description: ${item.description}` : "grounded worn object with practical use",
      `campaign tone: ${state.campaign.tone}`,
      "single object focus, laid on dark wood or worn cloth, candlelit, visible material texture, grounded fantasy design, painterly realism, no text, no watermark"
    ].join(", ");
  }

  if (request.kind === "npc") {
    return [
      "high quality painted dark fantasy NPC portrait",
      `person: ${request.subjectName ?? request.title ?? "unknown local"}`,
      request.subjectDescription ? `known details: ${request.subjectDescription}` : "distinctive face, grounded clothing, readable motives",
      `campaign tone: ${state.campaign.tone}`,
      "expressive face, practical costume, candlelit realism, restrained menace, portrait composition, no text, no watermark"
    ].join(", ");
  }

  if (request.kind === "location") {
    return [
      "high quality painted dark fantasy location illustration",
      `place: ${request.subjectName ?? request.title ?? "known place"}`,
      request.subjectDescription ? `known details: ${request.subjectDescription}` : "specific local landmark with lived-in details",
      `campaign tone: ${state.campaign.tone}`,
      "wide establishing view, readable entrances and hazards, candlelit or weathered atmosphere, grounded fantasy design, no text, no watermark"
    ].join(", ");
  }

  return [
    "high quality dark fantasy story illustration",
    `scene from campaign: ${state.campaign.name}`,
    `current moment: ${recentDm.slice(0, 700)}`,
    `hero present: ${character.name}, ${character.ancestry} ${character.role}`,
    "candlelit tavern and old-stone atmosphere, grounded details, dramatic composition, painterly realism, rich texture, no text, no watermark"
  ].join(", ");
}

async function generateWithSdWebUi(prompt: string, kind: ArtRequest["kind"]) {
  const portrait = kind === "portrait" || kind === "npc";
  const item = kind === "item";
  const response = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      negative_prompt: "low quality, blurry, bad anatomy, extra fingers, missing fingers, deformed face, cross-eye, watermark, logo, text, signature, modern objects, plastic skin, oversaturated",
      steps: 28,
      cfg_scale: 6,
      width: portrait ? 768 : item ? 768 : 1024,
      height: portrait ? 1024 : item ? 768 : 768,
      sampler_name: "DPM++ 2M Karras",
      restore_faces: portrait,
      batch_size: 1,
      n_iter: 1
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(`Stable Diffusion returned ${response.status}`);
  const data = await response.json() as { images?: string[] };
  const image = data.images?.[0];
  if (!image) throw new Error("Stable Diffusion returned no image");
  return Buffer.from(image.replace(/^data:image\/png;base64,/, ""), "base64");
}

function fallbackSvg(state: GameState, request: ArtRequest, prompt: string) {
  const title = request.title ?? (request.kind === "portrait" ? state.character.name : request.kind === "item" ? "A kept thing" : request.kind === "npc" ? request.subjectName ?? "A known face" : request.kind === "location" ? request.subjectName ?? "A known place" : "A painted moment");
  const subtitle = request.kind === "portrait"
    ? `${state.character.ancestry} ${state.character.role}`
    : request.kind === "item"
      ? "Inventory"
      : request.kind === "npc"
        ? "Person"
        : request.kind === "location"
          ? "Place"
          : state.campaign.name;
  const lines = wrapText(prompt.replace(/high quality|painterly realism|no text|no watermark/gi, "").replace(/\s*,\s*/g, " "), 42);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#25130e"/>
      <stop offset="0.45" stop-color="#5b301d"/>
      <stop offset="1" stop-color="#0c1a18"/>
    </linearGradient>
    <radialGradient id="candle" cx="34%" cy="24%" r="52%">
      <stop offset="0" stop-color="#ffd889" stop-opacity=".95"/>
      <stop offset=".42" stop-color="#c98a36" stop-opacity=".24"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .14"/></feComponentTransfer></filter>
  </defs>
  <rect width="1024" height="768" fill="url(#bg)"/>
  <rect width="1024" height="768" fill="url(#candle)"/>
  <rect width="1024" height="768" filter="url(#grain)" opacity=".7"/>
  <path d="M0 612 C175 548 320 620 491 578 C676 532 816 592 1024 520 L1024 768 L0 768 Z" fill="#0b0a08" opacity=".48"/>
  <circle cx="224" cy="206" r="82" fill="#f5cc82" opacity=".13"/>
  <circle cx="224" cy="206" r="38" fill="#ffd889" opacity=".16"/>
  <path d="M744 170 l64 42 -18 76 -78 21 -55 -57 25 -73z" fill="#111c1a" stroke="#f5cc82" stroke-opacity=".42" stroke-width="3"/>
  <path d="M706 496 q93 -55 183 0" fill="none" stroke="#e0b66f" stroke-opacity=".24" stroke-width="9"/>
  <rect x="92" y="82" width="520" height="604" rx="12" fill="#ead6ad" opacity=".88"/>
  <rect x="116" y="110" width="472" height="548" rx="8" fill="#2b1b13" opacity=".12"/>
  <text x="142" y="172" fill="#532d1d" font-family="Georgia, serif" font-size="52" font-weight="700">${escapeXml(title)}</text>
  <text x="144" y="220" fill="#7b4a2b" font-family="Georgia, serif" font-size="28">${escapeXml(subtitle)}</text>
  ${lines.map((line, index) => `<text x="146" y="${300 + index * 46}" fill="#3a281e" font-family="Georgia, serif" font-size="30">${escapeXml(line)}</text>`).join("")}
  <text x="146" y="612" fill="#7b4a2b" font-family="Georgia, serif" font-size="22">Paint waits for the local image forge.</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

export async function createArtwork(campaignId: string, state: GameState, request: ArtRequest): Promise<Artwork> {
  const prompt = buildArtPrompt(state, request);
  const item = request.kind === "item" ? state.inventory.find((entry) => entry.id === request.itemId) : undefined;
  const title = request.title ?? (request.kind === "portrait" ? state.character.name : request.kind === "item" ? item?.name ?? "Inventory item" : request.kind === "npc" ? request.subjectName ?? "Known face" : request.kind === "location" ? request.subjectName ?? "Known place" : "Painted moment");
  let source: Artwork["source"] = "sd-webui";
  let ext = "png";
  let bytes: Buffer;
  try {
    bytes = await generateWithSdWebUi(prompt, request.kind);
  } catch {
    source = "fallback";
    ext = "svg";
    bytes = fallbackSvg(state, request, prompt);
  }
  const filename = `${Date.now()}-${request.kind}-${safeFilePart(title)}.${ext}`;
  fs.writeFileSync(path.join(artDir, filename), bytes);
  return addArtwork({
    campaignId,
    characterId: request.kind === "portrait" ? state.character.id : undefined,
    itemId: request.kind === "item" ? request.itemId : undefined,
    kind: request.kind,
    title,
    prompt,
    imageUrl: `/artwork/${filename}`,
    source
  });
}
