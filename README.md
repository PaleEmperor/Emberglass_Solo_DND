# Emberglass Local Solo DM

Emberglass is a local-first solo tabletop RPG companion. It combines a React interface, an Express backend, SQLite persistence, deterministic dice/state handling, optional local LLM narration through Ollama, and optional local image generation through a Stable Diffusion WebUI-compatible API.

The app is intended for private local play. It does not require accounts, hosted services, or online deployment.

## Quick Start

```powershell
.\Start-DND.cmd
```

The launcher installs missing npm dependencies, starts the local backend and frontend, attempts to start Ollama when available, and opens the app in a browser.

To stop the local app servers:

```powershell
.\Stop-DND.cmd
```

## Manual Run

```powershell
npm.cmd install
npm.cmd run dev
```

Frontend:

```text
http://127.0.0.1:5173
```

Backend:

```text
http://127.0.0.1:8787
```

SQLite data is stored in `data/dnd.sqlite`. Generated artwork is stored in `data/artwork`.

## Optional Local Narration

When Ollama is running, Emberglass uses it as the narrator. If Ollama is not reachable or returns invalid JSON, the game falls back to a built-in local mock narrator so play can continue.

Defaults:

```text
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
```

Useful commands:

```powershell
ollama pull llama3.2:3b
ollama serve
```

You can choose another model before starting the backend:

```powershell
$env:OLLAMA_MODEL="mistral:7b"
npm.cmd run dev
```

## Optional Local Image Generation

Emberglass can call a Stable Diffusion WebUI/Forge API at:

```text
http://127.0.0.1:7860
```

Use the included helper when you want to install/start the local image forge:

```powershell
.\Start-ImageForge.cmd
```

If the image API is unavailable, the app creates local fallback artwork cards instead of blocking play.

## Features

- Prompt-based campaign creation.
- Character creation inside the chosen campaign.
- Character portrait generation using appearance notes.
- Natural-language player actions.
- Automatic dice checks through the chat flow.
- Persistent campaign state in SQLite.
- DM-managed inventory, items, abilities, quests, XP, and levels.
- Quest tracker with progress, rewards, completion state, and XP awards.
- Searchable story log.
- Searchable and grouped world bible for truths, NPCs, and places.
- Manual additions for world truths, people, places, and memory notes.
- Narrator insight view for current world assumptions and loose threads.
- Item detail modal with optional item artwork.
- Optional generated art for scenes, character portraits, NPCs, locations, and items.
- JSON export and timestamped local backups.

## Architecture

- `frontend/src`: React app with campaign selection, campaign creation, character creation, adventure UI, world bible, inventory, quest tracker, and art gallery.
- `backend/src/db.ts`: SQLite schema, migrations, persistence, and seed helpers.
- `backend/src/engine.ts`: deterministic game loop, dice checks, XP progression, and validated state mutations.
- `backend/src/llm.ts`: Ollama integration with mock fallback.
- `backend/src/prompt.ts`: structured DM prompt using recent conversation, state, memories, world truths, NPCs, locations, inventory, and quests.
- `backend/src/schemas.ts`: Zod schemas for model-proposed state changes.
- `backend/src/art.ts`: local image generation through Stable Diffusion WebUI/Forge, with saved fallback artwork.
- `shared/types.ts`: shared TypeScript game types.

The model writes narration and proposes structured state changes. The backend validates those proposals and applies them transactionally so malformed or implausible fields do not corrupt the database.

## Troubleshooting

- If the UI shows mock/fallback narration, Ollama is not reachable or the model returned invalid JSON.
- If the image forge is unavailable, artwork buttons still create local fallback cards.
- If PowerShell blocks `npm`, use `npm.cmd`.
- If port `5173` is busy, Vite prints an alternate frontend URL.
- If port `8787` is busy, set a different backend port:

```powershell
$env:PORT="8790"
npm.cmd run dev
```
