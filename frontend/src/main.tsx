import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Archive, BookOpen, Brush, ChevronDown, ChevronRight, Coins, Copy, Dices, Download, Heart, Image as ImageIcon, Map, MessageSquare, Package, RefreshCw, Save, ScrollText, Sparkles, Trash2, UserRound, X } from "lucide-react";
import type { AbilityKey, AdventureResponse, DiceRoll, GameState, InventoryItem, Location, Npc, Quest, WorldFactCategory } from "../../shared/types";
import "./styles.css";

type CampaignListItem = {
  id: string;
  name: string;
  tone: string;
  summary: string;
  character_name: string;
  character_role: string;
  updated_at: string;
};

type LlmStatus = { available: boolean; model: string; models: Array<{ name: string; size?: number }> };
type ImageStatus = { available: boolean; url: string };
type NarratorInsight = { believes: string[]; worldRules: string[]; cast: string[]; places: string[]; unanswered: string[] };

const api = {
  async json<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  campaigns: () => api.json<CampaignListItem[]>("/api/campaigns"),
  llmStatus: () => api.json<LlmStatus>("/api/llm/status"),
  imageStatus: () => api.json<ImageStatus>("/api/image/status"),
  state: (id: string) => api.json<GameState>(`/api/campaigns/${id}`),
  create: (payload: unknown) => api.json<GameState>("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  act: (id: string, action: string) => api.json<AdventureResponse>(`/api/campaigns/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }),
  rest: (id: string) => api.json<GameState>(`/api/campaigns/${id}/rest`, { method: "POST" }),
  setHp: (id: string, hp: number) => api.json<GameState>(`/api/campaigns/${id}/hp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hp }) }),
  addMemory: (id: string, content: string, importance = 3) => api.json<GameState>(`/api/campaigns/${id}/memory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, importance }) }),
  insight: (id: string) => api.json<NarratorInsight>(`/api/campaigns/${id}/narrator-insight`),
  addWorldFact: (id: string, payload: { category: WorldFactCategory; title: string; content: string; priority: number }) => api.json<GameState>(`/api/campaigns/${id}/world-facts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  deleteWorldFact: (id: string, factId: string) => api.json<GameState>(`/api/campaigns/${id}/world-facts/${factId}`, { method: "DELETE" }),
  addNpc: (id: string, payload: { name: string; disposition: string; notes: string; location?: string }) => api.json<GameState>(`/api/campaigns/${id}/npcs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  addLocation: (id: string, payload: { name: string; description: string; discovered: boolean }) => api.json<GameState>(`/api/campaigns/${id}/locations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  backup: (id: string) => api.json<{ file: string }>(`/api/campaigns/${id}/backup`, { method: "POST" }),
  art: (id: string, payload: { kind: "portrait" | "scene" | "item" | "npc" | "location"; itemId?: string; title?: string; prompt?: string; subjectName?: string; subjectDescription?: string }) => api.json<{ artwork: GameState["artworks"][number]; state: GameState }>(`/api/campaigns/${id}/art`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  roll: (notation: string, reason = "Cast by hand") => api.json<DiceRoll>("/api/tools/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notation, reason }) }),
  deleteCampaign: async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
  }
};

const statLabels: Record<AbilityKey, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA"
};

const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

function xpProgress(level: number, xp: number) {
  const current = xpThresholds[Math.max(0, Math.min(level - 1, xpThresholds.length - 1))] ?? 0;
  const next = xpThresholds[Math.max(0, Math.min(level, xpThresholds.length - 1))] ?? current;
  const span = Math.max(1, next - current);
  return { current, next, percent: level >= 20 ? 100 : Math.max(0, Math.min(100, ((xp - current) / span) * 100)) };
}

const rolePresets = {
  Ranger: { hp: 12, stats: { strength: 12, dexterity: 16, constitution: 13, intelligence: 11, wisdom: 15, charisma: 10 }, spells: "Hunter's Mark, Cure Wounds" },
  Wizard: { hp: 8, stats: { strength: 8, dexterity: 13, constitution: 12, intelligence: 16, wisdom: 12, charisma: 11 }, spells: "Mage Hand, Shield, Burning Hands" },
  Fighter: { hp: 14, stats: { strength: 16, dexterity: 12, constitution: 15, intelligence: 10, wisdom: 11, charisma: 10 }, spells: "Second Wind, Action Surge" },
  Bard: { hp: 10, stats: { strength: 9, dexterity: 14, constitution: 12, intelligence: 12, wisdom: 10, charisma: 16 }, spells: "Vicious Mockery, Healing Word, Charm Person" }
};

function App() {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [view, setView] = useState<"start" | "create" | "play">("start");
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus | null>(null);
  const [error, setError] = useState("");

  async function refreshCampaigns() {
    try {
      setCampaigns(await api.campaigns());
      setStatus(await api.llmStatus());
      setImageStatus(await api.imageStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The campaign ledger would not open.");
    }
  }

  useEffect(() => {
    refreshCampaigns();
  }, []);

  async function openCampaign(id: string) {
    setState(await api.state(id));
    setView("play");
  }

  async function deleteCampaign(id: string) {
    if (!window.confirm("Burn this ledger and the name written in it?")) return;
    await api.deleteCampaign(id);
    await refreshCampaigns();
  }

  async function onCreated(next: GameState) {
    setState(next);
    await refreshCampaigns();
    setView("play");
    api.art(next.campaign.id, { kind: "portrait", title: next.character.name })
      .then((result) => setState(result.state))
      .catch(() => undefined);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <ScrollText size={28} />
          <div>
            <strong>Emberglass</strong>
            <span>The Hearth Beneath</span>
          </div>
        </div>
        <nav>
          <button className={view === "start" ? "active" : ""} onClick={() => { refreshCampaigns(); setView("start"); }}>Campaigns</button>
          <button className={view === "create" ? "active" : ""} onClick={() => setView("create")}>New campaign</button>
        </nav>
      </header>

      {error && <div className="toast">{error}</div>}
      {view === "start" && <StartScreen campaigns={campaigns} status={status} imageStatus={imageStatus} onOpen={openCampaign} onCreate={() => setView("create")} onDelete={deleteCampaign} onRefresh={refreshCampaigns} />}
      {view === "create" && <Creator onCreated={onCreated} />}
      {view === "play" && state && <Adventure initialState={state} initialStatus={status} onBack={() => { refreshCampaigns(); setView("start"); }} />}
    </div>
  );
}

function StartScreen({ campaigns, status, imageStatus, onOpen, onCreate, onDelete, onRefresh }: { campaigns: CampaignListItem[]; status: LlmStatus | null; imageStatus: ImageStatus | null; onOpen: (id: string) => void; onCreate: () => void; onDelete: (id: string) => void; onRefresh: () => void }) {
  const latest = campaigns[0];
  return (
    <main className="start-grid">
      <section className="intro-panel">
        <div className="sigil"><Sparkles size={34} /></div>
        <h1>The cellar door is waiting.</h1>
        <p>Keep your blade close, your choices sharper, and your secrets written where the candlelight can find them.</p>
        <div className="hero-actions">
          {latest ? (
            <button className="primary wide" onClick={() => onOpen(latest.id)}>Return to {latest.name} <ChevronRight size={18} /></button>
          ) : (
            <button className="primary wide" onClick={onCreate}>Create a campaign <ChevronRight size={18} /></button>
          )}
          {latest && <button className="ghost" onClick={onCreate}>New campaign</button>}
          <button className="ghost" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
        </div>
        <div className="ready-row">
          <span className={status?.available ? "ready-dot good" : "ready-dot warn"}>Story voice</span>
          <span className={imageStatus?.available ? "ready-dot good" : "ready-dot warn"}>Paint</span>
        </div>
      </section>
      <section className="campaign-list">
        <div className="section-title"><BookOpen size={18} /> Open ledgers</div>
        {campaigns.length === 0 && <p className="muted">No names have been written in the tavern book yet.</p>}
        {campaigns.map((campaign) => (
          <div className="campaign-row" key={campaign.id}>
            <button className="campaign-card" onClick={() => onOpen(campaign.id)}>
              <strong>{campaign.name}</strong>
              <span>{campaign.character_name}, {campaign.character_role}</span>
              <p>{campaign.summary}</p>
            </button>
            <button className="icon-button danger" title="Burn this ledger" onClick={() => onDelete(campaign.id)}><Trash2 size={17} /></button>
          </div>
        ))}
      </section>
    </main>
  );
}

function Creator({ onCreated }: { onCreated: (state: GameState) => void }) {
  const [step, setStep] = useState<"campaign" | "character">("campaign");
  const [role, setRole] = useState<keyof typeof rolePresets>("Ranger");
  const preset = rolePresets[role];
  const [form, setForm] = useState({
    campaignName: "The Black Tide Map",
    tone: "salt wind, candlelit bargains, and old magic below the waves",
    premise: "A drowned bell rings under the harbor each midnight, and every ship that hears it returns with one crew member missing.",
    name: "Seren Ashvale",
    ancestry: "Human",
    background: "Once carried sealed letters through bad weather and worse company. Knows which roads are old, which doors are watched, and how long a debt can follow footsteps.",
    appearance: "Lean road-worn traveler with sharp grey eyes, rain-dark hair tied back, a patched green cloak, weathered leather armor, and an old courier satchel."
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        campaignName: form.campaignName,
        tone: form.tone,
        premise: form.premise,
        character: {
          name: form.name,
          role,
          ancestry: form.ancestry,
          background: form.background,
          appearance: form.appearance,
          maxHp: preset.hp,
          hp: preset.hp,
          stats: preset.stats,
          spells: preset.spells.split(",").map((s) => s.trim()).filter(Boolean)
        }
      };
      onCreated(await api.create(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The ink would not take.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="creator">
      <form className="creation-panel" onSubmit={submit}>
        <div className="section-title">{step === "campaign" ? <BookOpen size={18} /> : <UserRound size={18} />} {step === "campaign" ? "Create the campaign" : "Choose who walks into it"}</div>
        {error && <div className="inline-error">{error}</div>}
        <div className="step-tabs">
          <button type="button" className={step === "campaign" ? "active" : ""} onClick={() => setStep("campaign")}>1. Campaign</button>
          <button type="button" className={step === "character" ? "active" : ""} onClick={() => setStep("character")}>2. Character</button>
        </div>
        {step === "campaign" ? (
          <>
            <label>Campaign name<input value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} /></label>
            <label>Premise<textarea className="big-textarea" value={form.premise} onChange={(e) => setForm({ ...form, premise: e.target.value })} placeholder="Write the kind of adventure you want: cursed city, desert caravan, haunted academy, pirate map, political murder, anything." /></label>
            <label>Tone<input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></label>
            <div className="preset-row">
              {[
                ["Harbor Curse", "The Black Tide Map", "salt wind, candlelit bargains, and old magic below the waves", "A drowned bell rings under the harbor each midnight, and every ship that hears it returns with one crew member missing."],
                ["Court Intrigue", "The Velvet Knife", "perfumed halls, locked doors, and smiling enemies", "At the duke's masked feast, every guest receives a card naming the person they must betray before dawn."],
                ["Old Forest", "The Road That Hungers", "wet leaves, old stones, and things watching from the treeline", "A trade road vanishes for one hour each dusk, and those who return from it speak with voices not their own."]
              ].map(([label, campaignName, tone, premise]) => (
                <button type="button" key={label} onClick={() => setForm({ ...form, campaignName, tone, premise })}>{label}</button>
              ))}
            </div>
            <div className="creator-actions">
              <button type="button" className="primary" onClick={() => setStep("character")}>Choose your character <ChevronRight size={18} /></button>
            </div>
          </>
        ) : (
          <>
            <div className="campaign-preview">
              <strong>{form.campaignName}</strong>
              <p>{form.premise}</p>
            </div>
            <div className="field-row">
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Ancestry<input value={form.ancestry} onChange={(e) => setForm({ ...form, ancestry: e.target.value })} /></label>
            </div>
            <label>Background<textarea value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} /></label>
            <label>Appearance for portrait generation<textarea value={form.appearance} onChange={(e) => setForm({ ...form, appearance: e.target.value })} placeholder="Face, hair, build, age, clothing, armor, colors, scars, symbols, weapons, mood, and anything the portrait must get right." /></label>
            <div className="roles">
              {(Object.keys(rolePresets) as Array<keyof typeof rolePresets>).map((name) => (
                <button type="button" className={role === name ? "role active" : "role"} onClick={() => setRole(name)} key={name}>{name}</button>
              ))}
            </div>
            <StatGrid stats={preset.stats} hp={preset.hp} />
            <div className="creator-actions">
              <button type="button" className="ghost" onClick={() => setStep("campaign")}>Back to campaign</button>
              <button className="primary" disabled={busy}>{busy ? "Finding the first scene..." : "Begin the campaign"}</button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}

function Adventure({ initialState, initialStatus, onBack }: { initialState: GameState; initialStatus: LlmStatus | null; onBack: () => void }) {
  const [state, setState] = useState(initialState);
  const [status, setStatus] = useState(initialStatus);
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastRolls, setLastRolls] = useState<AdventureResponse["rolls"]>([]);
  const [mode, setMode] = useState<"ollama" | "mock">(initialStatus?.available ? "ollama" : "mock");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [painting, setPainting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"quests" | "world" | "notes" | "art">("world");
  const [worldTab, setWorldTab] = useState<"overview" | "insight" | "truth" | "person" | "place">("overview");
  const [insight, setInsight] = useState<NarratorInsight | null>(null);
  const [factForm, setFactForm] = useState<{ category: WorldFactCategory; title: string; content: string; priority: number }>({ category: "law", title: "", content: "", priority: 5 });
  const [npcForm, setNpcForm] = useState({ name: "", disposition: "useful but guarded", notes: "", location: "" });
  const [placeForm, setPlaceForm] = useState({ name: "", description: "" });
  const logRef = useRef<HTMLDivElement | null>(null);

  const visibleMessages = useMemo(() => {
    const messages = state.messages.filter((m) => m.role !== "system");
    if (!search.trim()) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(search.toLowerCase()));
  }, [state.messages, search]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state.messages.length]);

  async function submit(event?: React.FormEvent, override?: string) {
    event?.preventDefault();
    const nextAction = (override ?? action).trim();
    if (!nextAction || busy) return;
    setAction("");
    setBusy(true);
    setToast("");
    try {
      const response = await api.act(state.campaign.id, nextAction);
      setState(response.state);
      setLastRolls(response.rolls);
      setMode(response.llmMode);
      const dramaticRoll = response.rolls.some((roll) => roll.rolls[0] === 1 || roll.rolls[0] === 20);
      const newSceneCount = response.state.artworks.filter((art) => art.kind === "scene").length;
      if (dramaticRoll || (response.rolls.length > 0 && response.state.messages.length % 8 === 0 && newSceneCount < 12)) {
        api.art(response.state.campaign.id, { kind: "scene", title: dramaticRoll ? "A fateful cast" : "A painted turn" })
          .then((result) => setState(result.state))
          .catch(() => undefined);
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "The moment slips away.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setState(await api.state(state.campaign.id));
    setStatus(await api.llmStatus());
  }

  async function backup() {
    const result = await api.backup(state.campaign.id);
    setToast(`A spare ledger was sealed here: ${result.file}`);
  }

  async function addNote() {
    if (!note.trim()) return;
    setState(await api.addMemory(state.campaign.id, note.trim(), 3));
    setNote("");
    setToast("The ledger remembers.");
  }

  async function loadInsight() {
    setInsight(await api.insight(state.campaign.id));
    setToast("The hearth showed its current thinking.");
  }

  async function addFact() {
    if (!factForm.title.trim() || !factForm.content.trim()) return;
    setState(await api.addWorldFact(state.campaign.id, { ...factForm, title: factForm.title.trim(), content: factForm.content.trim() }));
    setFactForm({ category: factForm.category, title: "", content: "", priority: factForm.priority });
    setInsight(null);
    setToast("The world accepts this as true.");
  }

  async function removeFact(factId: string) {
    setState(await api.deleteWorldFact(state.campaign.id, factId));
    setInsight(null);
    setToast("That truth was struck from the margin.");
  }

  async function addPerson() {
    if (!npcForm.name.trim() || !npcForm.notes.trim()) return;
    setState(await api.addNpc(state.campaign.id, {
      name: npcForm.name.trim(),
      disposition: npcForm.disposition.trim() || "unknown",
      notes: npcForm.notes.trim(),
      location: npcForm.location.trim() || undefined
    }));
    setNpcForm({ name: "", disposition: "useful but guarded", notes: "", location: "" });
    setInsight(null);
    setToast("A new name is in the cast.");
  }

  async function addPlace() {
    if (!placeForm.name.trim() || !placeForm.description.trim()) return;
    setState(await api.addLocation(state.campaign.id, { name: placeForm.name.trim(), description: placeForm.description.trim(), discovered: true }));
    setPlaceForm({ name: "", description: "" });
    setInsight(null);
    setToast("A new place is on the map.");
  }

  async function paint(kind: "portrait" | "scene", title?: string) {
    if (painting) return;
    setPainting(true);
    setToast(kind === "portrait" ? "A face is finding the page..." : "Paint is gathering around this moment...");
    try {
      const result = await api.art(state.campaign.id, { kind, title });
      setState(result.state);
      setToast(result.artwork.source === "sd-webui" ? "The painting is dry." : "A candle-card was inked while the image forge sleeps.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "The paint would not settle.");
    } finally {
      setPainting(false);
    }
  }

  async function paintItem(item: InventoryItem) {
    if (painting) return;
    setPainting(true);
    setToast(`Paint is gathering around ${item.name}...`);
    try {
      const result = await api.art(state.campaign.id, { kind: "item", itemId: item.id, title: item.name });
      setState(result.state);
      setToast(result.artwork.source === "sd-webui" ? "The item painting is dry." : "A candle-card was inked while the image forge sleeps.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "The paint would not settle.");
    } finally {
      setPainting(false);
    }
  }

  async function paintNpc(npc: Npc) {
    if (painting) return;
    setPainting(true);
    setToast(`Paint is gathering around ${npc.name}...`);
    try {
      const result = await api.art(state.campaign.id, {
        kind: "npc",
        title: npc.name,
        subjectName: npc.name,
        subjectDescription: `${npc.disposition}. ${npc.notes}${npc.location ? ` Location: ${npc.location}.` : ""}`
      });
      setState(result.state);
      setToast(result.artwork.source === "sd-webui" ? "The face is on the page." : "A candle-card was inked while the image forge sleeps.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "The paint would not settle.");
    } finally {
      setPainting(false);
    }
  }

  async function paintLocation(location: Location) {
    if (painting) return;
    setPainting(true);
    setToast(`Paint is gathering around ${location.name}...`);
    try {
      const result = await api.art(state.campaign.id, {
        kind: "location",
        title: location.name,
        subjectName: location.name,
        subjectDescription: location.description
      });
      setState(result.state);
      setToast(result.artwork.source === "sd-webui" ? "The place is on the page." : "A candle-card was inked while the image forge sleeps.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "The paint would not settle.");
    } finally {
      setPainting(false);
    }
  }

  const exportUrl = `/api/campaigns/${state.campaign.id}/export`;
  const latestDm = [...state.messages].reverse().find((m) => m.role === "dm");
  const portrait = state.artworks.find((art) => art.kind === "portrait" && art.characterId === state.character.id);
  const gallery = state.artworks.filter((art) => art.kind === "scene" || art.kind === "npc" || art.kind === "location");
  const selectedItemArt = selectedItem ? state.artworks.find((art) => art.kind === "item" && art.itemId === selectedItem.id) : undefined;

  return (
    <main className="adventure">
      <aside className="left-rail">
        <button className="ghost" onClick={onBack}>Back</button>
        <CharacterPanel state={state} portrait={portrait?.imageUrl} painting={painting} onPortrait={() => paint("portrait", state.character.name)} />
        <PackPanel inventory={state.inventory} onSelect={setSelectedItem} />
      </aside>
      <section className="story-column">
        <div className="story-header">
          <div>
            <h2>{state.campaign.name}</h2>
            <span>{state.campaign.tone}</span>
          </div>
          <div className="story-tools">
            <div className={mode === "ollama" ? "mode-pill good" : "mode-pill"}>{mode === "ollama" ? "Hearthvoice awake" : "Ink-and-candle mode"}</div>
            <button className="icon-button" title="Paint this moment" onClick={() => paint("scene", "A painted moment")}><Brush size={17} /></button>
            <button className="icon-button" title="More ledger tools" onClick={() => setToolsOpen(!toolsOpen)}><ChevronDown size={17} /></button>
            {toolsOpen && (
              <div className="tool-popover">
                <button onClick={refresh}><RefreshCw size={16} /> Turn back to the last page</button>
                <button onClick={backup}><Save size={16} /> Seal a spare copy</button>
                <a href={exportUrl}><Download size={16} /> Wrap the ledger for travel</a>
                <button onClick={() => latestDm && navigator.clipboard.writeText(latestDm.content)}><Copy size={16} /> Copy the last telling</button>
              </div>
            )}
          </div>
        </div>
        {lastRolls.length > 0 && (
          <div className="roll-strip">
            {lastRolls.map((roll) => <span key={roll.reason}><Dices size={16} /> {roll.total} vs DC {roll.dc} {roll.success ? "success" : "failure"}</span>)}
          </div>
        )}
        <div className="search-row">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a line in the ledger..." />
          {toast && <span>{toast}</span>}
        </div>
        <div className="story-log" ref={logRef}>
          {visibleMessages.map((message) => (
            <article className={message.role === "player" ? "entry player" : "entry dm"} key={message.id}>
              <span>{message.role === "player" ? state.character.name : "The Hearthvoice"}</span>
              <p>{message.content}</p>
            </article>
          ))}
        </div>
        <form className="action-bar" onSubmit={(event) => submit(event)}>
          <MessageSquare size={20} />
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="What do you risk next?" />
          <button className="primary" disabled={busy}>{busy ? "The room holds its breath..." : "Risk it"}</button>
        </form>
      </section>
      <CampaignSidePanel
        state={state}
        tab={rightTab}
        setTab={setRightTab}
        worldTab={worldTab}
        setWorldTab={setWorldTab}
        insight={insight}
        loadInsight={loadInsight}
        factForm={factForm}
        setFactForm={setFactForm}
        addFact={addFact}
        removeFact={removeFact}
        npcForm={npcForm}
        setNpcForm={setNpcForm}
        addPerson={addPerson}
        placeForm={placeForm}
        setPlaceForm={setPlaceForm}
        addPlace={addPlace}
        note={note}
        setNote={setNote}
        addNote={addNote}
        gallery={gallery}
        paintNpc={paintNpc}
        paintLocation={paintLocation}
        painting={painting}
      />
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          artwork={selectedItemArt}
          painting={painting}
          onClose={() => setSelectedItem(null)}
          onPaint={() => paintItem(selectedItem)}
        />
      )}
    </main>
  );
}

function ItemModal({ item, artwork, painting, onClose, onPaint }: { item: InventoryItem; artwork?: GameState["artworks"][number]; painting: boolean; onClose: () => void; onPaint: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="item-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span>Inventory</span>
            <h3>{item.name}</h3>
          </div>
          <button className="icon-button" onClick={onClose} title="Close"><X size={17} /></button>
        </div>
        <div className="item-modal-body">
          <button className="item-art-frame" onClick={artwork ? () => window.open(artwork.imageUrl, "_blank") : onPaint} title={artwork ? "Open item image" : "Paint this item"}>
            {artwork ? <img src={artwork.imageUrl} alt={artwork.title} /> : <span><Package size={34} />{painting ? "Paint gathering..." : "No image yet"}</span>}
          </button>
          <div className="item-details">
            <div className="item-quantity">Carried: x{item.quantity}</div>
            <p>{item.description || "No description has been written for this item yet."}</p>
            <button className="ghost full" onClick={onPaint} disabled={painting}><Brush size={16} /> {artwork ? "Repaint this item" : "Paint this item"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PackPanel({ inventory, onSelect }: { inventory: InventoryItem[]; onSelect: (item: InventoryItem) => void }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filtered = inventory.filter((item) => !query || `${item.name} ${item.description}`.toLowerCase().includes(query));
  const grouped = groupItems(filtered);
  return (
    <Panel title="Pack" icon={<Package size={17} />}>
      <input className="collection-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pack..." />
      {inventory.length === 0 && <p className="muted">Your hands are empty but for nerve.</p>}
      {inventory.length > 0 && filtered.length === 0 && <p className="muted">Nothing in the pack matches that search.</p>}
      <div className="pack-list">
        {Object.entries(grouped).map(([group, items]) => (
          <div className="collection-group" key={group}>
            <div className="collection-group-title">{group}</div>
            {items.map((item) => (
              <button type="button" className="list-line item-button rich" title={item.description} aria-label={`Inspect ${item.name}`} key={item.id} onClick={() => onSelect(item)}>
                <strong>{item.name}</strong>
                <span>x{item.quantity}</span>
                {item.description && <p>{item.description}</p>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function groupItems(items: InventoryItem[]) {
  const groups: Record<string, InventoryItem[]> = {};
  for (const item of items) {
    const text = `${item.name} ${item.description}`.toLowerCase();
    const group = /potion|ration|food|drink|oil|candle|chalk|tonic|salve/.test(text)
      ? "Consumables"
      : /dagger|blade|sword|bow|arrow|bolt|staff|wand|armor|shield/.test(text)
        ? "Arms and armor"
        : /letter|map|note|writ|pass|token|coin|seal|contract|key/.test(text)
          ? "Clues and leverage"
          : /tool|rope|flint|twine|pack|satchel|kit|hook/.test(text)
            ? "Tools"
            : "Other";
    groups[group] = [...(groups[group] ?? []), item];
  }
  return groups;
}

function CampaignSidePanel({
  state,
  tab,
  setTab,
  worldTab,
  setWorldTab,
  insight,
  loadInsight,
  factForm,
  setFactForm,
  addFact,
  removeFact,
  npcForm,
  setNpcForm,
  addPerson,
  placeForm,
  setPlaceForm,
  addPlace,
  paintNpc,
  paintLocation,
  painting,
  note,
  setNote,
  addNote,
  gallery
}: {
  state: GameState;
  tab: "quests" | "world" | "notes" | "art";
  setTab: (tab: "quests" | "world" | "notes" | "art") => void;
  worldTab: "overview" | "insight" | "truth" | "person" | "place";
  setWorldTab: (tab: "overview" | "insight" | "truth" | "person" | "place") => void;
  insight: NarratorInsight | null;
  loadInsight: () => void;
  factForm: { category: WorldFactCategory; title: string; content: string; priority: number };
  setFactForm: (form: { category: WorldFactCategory; title: string; content: string; priority: number }) => void;
  addFact: () => void;
  removeFact: (factId: string) => void;
  npcForm: { name: string; disposition: string; notes: string; location: string };
  setNpcForm: (form: { name: string; disposition: string; notes: string; location: string }) => void;
  addPerson: () => void;
  placeForm: { name: string; description: string };
  setPlaceForm: (form: { name: string; description: string }) => void;
  addPlace: () => void;
  paintNpc: (npc: Npc) => void;
  paintLocation: (location: Location) => void;
  painting: boolean;
  note: string;
  setNote: (note: string) => void;
  addNote: () => void;
  gallery: GameState["artworks"];
}) {
  const tabs: Array<[typeof tab, string, React.ReactNode]> = [
    ["world", "World", <BookOpen size={17} />],
    ["quests", "Oaths", <Coins size={17} />],
    ["notes", "Notes", <Archive size={17} />],
    ["art", "Art", <ImageIcon size={17} />]
  ];

  return (
    <aside className="campaign-side">
      <nav className="campaign-side-tabs">
        {tabs.map(([key, label, icon]) => (
          <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)} title={label}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <section className="campaign-side-content">
        {tab === "world" && (
          <>
            <div className="side-heading"><BookOpen size={18} /><strong>World bible</strong></div>
            <WorldBible
              state={state}
              tab={worldTab}
              setTab={setWorldTab}
              insight={insight}
              loadInsight={loadInsight}
              factForm={factForm}
              setFactForm={setFactForm}
              addFact={addFact}
              removeFact={removeFact}
              npcForm={npcForm}
              setNpcForm={setNpcForm}
              addPerson={addPerson}
              placeForm={placeForm}
              setPlaceForm={setPlaceForm}
              addPlace={addPlace}
              paintNpc={paintNpc}
              paintLocation={paintLocation}
              painting={painting}
            />
          </>
        )}

        {tab === "quests" && (
          <>
            <div className="side-heading"><Coins size={18} /><strong>Quest tracker</strong></div>
            <QuestTracker quests={state.quests} />
          </>
        )}

        {tab === "notes" && (
          <>
            <div className="side-heading"><Archive size={18} /><strong>Ledger scraps</strong></div>
            <div className="note-box">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Scratch a truth into the campaign ledger..." />
              <button className="ghost" onClick={addNote}>Set the ink</button>
            </div>
            <div className="side-list">
              {state.memories.map((memory) => <p className="memory" key={memory.id}>{memory.content}</p>)}
            </div>
          </>
        )}

        {tab === "art" && (
          <>
            <div className="side-heading"><ImageIcon size={18} /><strong>Painted pages</strong></div>
            {gallery.length === 0 && <p className="muted">No scene, face, or place has taken pigment yet.</p>}
            <div className="art-grid large">
              {gallery.map((art) => <button className="art-thumb" key={art.id} title={art.prompt} onClick={() => window.open(art.imageUrl, "_blank")}><img src={art.imageUrl} alt={art.title} /><span>{art.title}</span></button>)}
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

function QuestTracker({ quests }: { quests: Quest[] }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filtered = quests.filter((quest) => !query || `${quest.title} ${quest.status} ${quest.description} ${quest.progress} ${quest.reward}`.toLowerCase().includes(query));
  const groups: Array<[string, Quest[]]> = [
    ["Active", filtered.filter((quest) => quest.status === "active")],
    ["Completed", filtered.filter((quest) => quest.status === "completed")],
    ["Failed", filtered.filter((quest) => quest.status === "failed")]
  ];
  return (
    <div className="quest-tracker">
      <input className="collection-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quests..." />
      {quests.length === 0 && <p className="muted">No one has put a promise in your hands.</p>}
      {quests.length > 0 && filtered.length === 0 && <p className="muted">No quest matches that search.</p>}
      <div className="side-list">
        {groups.map(([label, items]) => items.length > 0 && (
          <div className="collection-group" key={label}>
            <div className="collection-group-title">{label}</div>
            {items.map((quest) => (
              <div className="quest" key={quest.id}>
                <strong>{quest.title}</strong>
                <span>{quest.status} / {quest.xpReward} XP</span>
                <p>{quest.progress}</p>
                {quest.description && <small>{quest.description}</small>}
                {quest.reward && <em>{quest.reward}</em>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorldBible({
  state,
  tab,
  setTab,
  insight,
  loadInsight,
  factForm,
  setFactForm,
  addFact,
  removeFact,
  npcForm,
  setNpcForm,
  addPerson,
  placeForm,
  setPlaceForm,
  addPlace,
  paintNpc,
  paintLocation,
  painting
}: {
  state: GameState;
  tab: "overview" | "insight" | "truth" | "person" | "place";
  setTab: (tab: "overview" | "insight" | "truth" | "person" | "place") => void;
  insight: NarratorInsight | null;
  loadInsight: () => void;
  factForm: { category: WorldFactCategory; title: string; content: string; priority: number };
  setFactForm: (form: { category: WorldFactCategory; title: string; content: string; priority: number }) => void;
  addFact: () => void;
  removeFact: (factId: string) => void;
  npcForm: { name: string; disposition: string; notes: string; location: string };
  setNpcForm: (form: { name: string; disposition: string; notes: string; location: string }) => void;
  addPerson: () => void;
  placeForm: { name: string; description: string };
  setPlaceForm: (form: { name: string; description: string }) => void;
  addPlace: () => void;
  paintNpc: (npc: Npc) => void;
  paintLocation: (location: Location) => void;
  painting: boolean;
}) {
  const [worldSearch, setWorldSearch] = useState("");
  const tabs: Array<[typeof tab, string]> = [["overview", "World"], ["insight", "Insight"], ["truth", "Truth"], ["person", "People"], ["place", "Places"]];
  const query = worldSearch.trim().toLowerCase();
  const facts = state.worldFacts.filter((fact) => !query || `${fact.title} ${fact.category} ${fact.content}`.toLowerCase().includes(query));
  const people = state.npcs.filter((npc) => !query || `${npc.name} ${npc.disposition} ${npc.location ?? ""} ${npc.notes}`.toLowerCase().includes(query));
  const places = state.locations.filter((location) => !query || `${location.name} ${location.description} ${location.discovered ? "known" : "rumored"}`.toLowerCase().includes(query));
  return (
    <div className="world-bible-body">
        <div className="world-tabs">
          {tabs.map(([key, label]) => <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        {tab === "overview" && (
          <div className="world-editor">
            <input className="collection-search" value={worldSearch} onChange={(event) => setWorldSearch(event.target.value)} placeholder="Search truths, people, places..." />
            <div className="world-counts">
              <span>{state.worldFacts.length} truths</span>
              <span>{state.npcs.length} people</span>
              <span>{state.locations.length} places</span>
            </div>
            <div className="world-list tall">
              {state.worldFacts.length === 0 && state.npcs.length === 0 && state.locations.length === 0 && <p className="muted">The world has not written much back yet.</p>}
              {query && facts.length === 0 && people.length === 0 && places.length === 0 && <p className="muted">Nothing in the bible matches that search.</p>}
              {facts.length > 0 && <WorldGroup title="Truths">{facts.map((fact) => <div className="compact-world-line" key={fact.id}><strong>{fact.title}</strong><span>{fact.category} truth / priority {fact.priority}</span><p>{fact.content}</p></div>)}</WorldGroup>}
              {people.length > 0 && <WorldGroup title="People">{people.map((npc) => <WorldNpcLine key={npc.id} npc={npc} onPaint={paintNpc} painting={painting} />)}</WorldGroup>}
              {places.length > 0 && <WorldGroup title="Places">{places.map((location) => <WorldLocationLine key={location.id} location={location} onPaint={paintLocation} painting={painting} />)}</WorldGroup>}
            </div>
          </div>
        )}

        {tab === "insight" && (
          <div className="world-editor">
            <button className="ghost full" onClick={loadInsight}>Ask what the hearth believes</button>
            {!insight && <p className="muted">See what the narrator is treating as important before the next scene moves.</p>}
            {insight && (
              <div className="insight-stack">
                <InsightBlock title="Current read" lines={insight.believes} />
                <InsightBlock title="Binding laws" lines={insight.worldRules} empty="No hard laws have been set." />
                <InsightBlock title="Cast in mind" lines={insight.cast} empty="No extra faces are pulling focus." />
                <InsightBlock title="Places in mind" lines={insight.places} empty="No places are marked yet." />
                <InsightBlock title="Loose threads" lines={insight.unanswered} empty="No loose thread has been pinned." />
              </div>
            )}
          </div>
        )}

        {tab === "truth" && (
          <div className="world-editor">
            <div className="mini-row">
              <select value={factForm.category} onChange={(e) => setFactForm({ ...factForm, category: e.target.value as WorldFactCategory })}>
                <option value="law">Law</option>
                <option value="tone">Tone</option>
                <option value="lore">Lore</option>
                <option value="faction">Faction</option>
                <option value="danger">Danger</option>
                <option value="custom">Custom</option>
              </select>
              <input type="number" min={1} max={5} value={factForm.priority} onChange={(e) => setFactForm({ ...factForm, priority: Number(e.target.value) })} title="Narrator priority" />
            </div>
            <input value={factForm.title} onChange={(e) => setFactForm({ ...factForm, title: e.target.value })} placeholder="The king still signs decrees" />
            <textarea value={factForm.content} onChange={(e) => setFactForm({ ...factForm, content: e.target.value })} placeholder="Write a rule, taboo, secret, faction motive, danger, or style command the narrator must respect." />
            <button className="ghost full" onClick={addFact}>Set this truth</button>
            <div className="world-list">
              {state.worldFacts.length === 0 && <p className="muted">No private laws have been written yet.</p>}
              {state.worldFacts.map((fact) => (
                <div className="truth-line" key={fact.id}>
                  <strong>{fact.title}</strong>
                  <span>{fact.category} / {fact.priority}</span>
                  <p>{fact.content}</p>
                  <button className="icon-button danger" title="Strike this truth" onClick={() => removeFact(fact.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "person" && (
          <div className="world-editor">
            <input value={npcForm.name} onChange={(e) => setNpcForm({ ...npcForm, name: e.target.value })} placeholder="Name" />
            <input value={npcForm.disposition} onChange={(e) => setNpcForm({ ...npcForm, disposition: e.target.value })} placeholder="Disposition" />
            <input value={npcForm.location} onChange={(e) => setNpcForm({ ...npcForm, location: e.target.value })} placeholder="Where they belong" />
            <textarea value={npcForm.notes} onChange={(e) => setNpcForm({ ...npcForm, notes: e.target.value })} placeholder="What they want, hide, fear, owe, or know." />
            <button className="ghost full" onClick={addPerson}>Add this person</button>
            <div className="world-list">
              {state.npcs.map((npc) => <WorldNpcLine key={npc.id} npc={npc} onPaint={paintNpc} painting={painting} />)}
            </div>
          </div>
        )}

        {tab === "place" && (
          <div className="world-editor">
            <input value={placeForm.name} onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })} placeholder="Place name" />
            <textarea value={placeForm.description} onChange={(e) => setPlaceForm({ ...placeForm, description: e.target.value })} placeholder="Smell, sound, danger, custom, landmark, or what locals refuse to say." />
            <button className="ghost full" onClick={addPlace}>Mark this place</button>
            <div className="world-list">
              {state.locations.map((location) => <WorldLocationLine key={location.id} location={location} onPaint={paintLocation} painting={painting} />)}
            </div>
          </div>
        )}
    </div>
  );
}

function WorldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="world-group"><div className="collection-group-title">{title}</div>{children}</div>;
}

function WorldNpcLine({ npc, onPaint, painting }: { npc: Npc; onPaint: (npc: Npc) => void; painting: boolean }) {
  return (
    <div className="compact-world-line with-action">
      <div>
        <strong>{npc.name}</strong>
        <span>person / {npc.disposition}{npc.location ? ` / ${npc.location}` : ""}</span>
        <p>{npc.notes}</p>
      </div>
      <button className="icon-button" title={`Paint ${npc.name}`} onClick={() => onPaint(npc)} disabled={painting}><Brush size={15} /></button>
    </div>
  );
}

function WorldLocationLine({ location, onPaint, painting }: { location: Location; onPaint: (location: Location) => void; painting: boolean }) {
  return (
    <div className="compact-world-line with-action">
      <div>
        <strong>{location.name}</strong>
        <span>{location.discovered ? "known place" : "rumored place"}</span>
        <p>{location.description}</p>
      </div>
      <button className="icon-button" title={`Paint ${location.name}`} onClick={() => onPaint(location)} disabled={painting}><Brush size={15} /></button>
    </div>
  );
}

function InsightBlock({ title, lines, empty = "Nothing here yet." }: { title: string; lines: string[]; empty?: string }) {
  return (
    <div className="insight-block">
      <strong>{title}</strong>
      {(lines.length ? lines : [empty]).map((line) => <p key={line}>{line}</p>)}
    </div>
  );
}

function CharacterPanel({ state, portrait, painting, onPortrait }: { state: GameState; portrait?: string; painting: boolean; onPortrait: () => void }) {
  const xp = xpProgress(state.character.level, state.character.xp);
  const [abilitySearch, setAbilitySearch] = useState("");
  const query = abilitySearch.trim().toLowerCase();
  const abilities = state.character.spells.filter((ability) => !query || ability.toLowerCase().includes(query));
  const groupedAbilities = abilities.reduce<Record<string, string[]>>((groups, ability) => {
    const group = ability.includes(":") ? "Story-earned" : /spell|mark|hand|word|shield|wounds|mockery|charm|burning/i.test(ability) ? "Spells" : "Class features";
    groups[group] = [...(groups[group] ?? []), ability];
    return groups;
  }, {});
  return (
    <Panel title={state.character.name} icon={<Heart size={17} />}>
      <button className="portrait-frame" onClick={onPortrait} title="Paint or repaint this face">
        {portrait ? <img src={portrait} alt={state.character.name} /> : <span><UserRound size={34} />{painting ? "Paint gathering..." : "Paint this face"}</span>}
      </button>
      <div className="identity">{state.character.ancestry} {state.character.role}</div>
      {state.character.appearance && <p className="character-note">{state.character.appearance}</p>}
      <div className="xp-row">
        <div><strong>Level {state.character.level}</strong><span>{state.character.level >= 20 ? `${state.character.xp} XP` : `${state.character.xp}/${xp.next} XP`}</span></div>
        <div className="xp-bar"><span style={{ width: `${xp.percent}%` }} /></div>
      </div>
      <div className="hp"><span style={{ width: `${(state.character.hp / state.character.maxHp) * 100}%` }} /></div>
      <div className="hp-text">{state.character.hp}/{state.character.maxHp} HP</div>
      <StatGrid stats={state.character.stats} hp={state.character.maxHp} compact />
      <div className="capability-title">Class features and spells</div>
      <input className="collection-search" value={abilitySearch} onChange={(event) => setAbilitySearch(event.target.value)} placeholder="Search abilities..." />
      <div className="ability-list">
        {state.character.spells.length === 0 && <p className="muted">No class features are written yet.</p>}
        {state.character.spells.length > 0 && abilities.length === 0 && <p className="muted">No ability matches that search.</p>}
        {Object.entries(groupedAbilities).map(([group, entries]) => (
          <div className="collection-group" key={group}>
            <div className="collection-group-title">{group}</div>
            <div className="spell-list">{entries.map((spell) => <span key={spell}>{spell}</span>)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function StatGrid({ stats, hp, compact = false }: { stats: Record<AbilityKey, number>; hp: number; compact?: boolean }) {
  const modifier = (score: number) => Math.floor((score - 10) / 2);
  return (
    <div className={compact ? "stats compact" : "stats"}>
      {(Object.keys(stats) as AbilityKey[]).map((key) => {
        const mod = modifier(stats[key]);
        return <div className="stat" key={key}><span>{statLabels[key]}</span><strong>{stats[key]}</strong><em>{mod >= 0 ? "+" : ""}{mod}</em></div>;
      })}
      {!compact && <div className="stat"><span>HP</span><strong>{hp}</strong></div>}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-title">{icon}{title}</div>{children}</section>;
}

createRoot(document.getElementById("root")!).render(<App />);
