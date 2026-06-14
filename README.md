# Emberglass Local Solo DM

A local-first solo DnD / AI Dungeon style MVP. The app uses a React frontend, an Express backend, SQLite persistence, deterministic dice/state handling, and an Ollama narrator when available. If Ollama is not running, it falls back to a built-in mock narrator so the game still works.

## Prerequisites

- Node.js 20+.
- Optional: [Ollama](https://ollama.com/) for local LLM narration.

PowerShell on Windows may block `npm.ps1`. Use `npm.cmd` if that happens.

## One-Click Start

Use the desktop shortcut:

```text
C:\Users\bjoer\OneDrive\Desktop\Emberglass Local Solo DM.lnk
```

Or run this from the project folder:

```powershell
.\Start-DND.cmd
```

The launcher:

- installs missing npm dependencies,
- starts Ollama if available,
- installs Ollama from the official installer if it is missing,
- stores Ollama models in `E:\DND\ollama-models`,
- downloads `llama3.2:3b` on first run,
- starts the local image forge when present,
- starts the backend and frontend,
- opens the app in your browser.

To stop the local app servers:

```powershell
.\Stop-DND.cmd
```

## Manual Install

```powershell
npm.cmd install
```

## Run

```powershell
npm.cmd run dev
```

Open the frontend at:

```text
http://127.0.0.1:5173
```

The backend runs at:

```text
http://127.0.0.1:8787
```

SQLite data is stored locally in:

```text
data/dnd.sqlite
```

## Local LLM Setup

The launcher already installed Ollama and downloaded `llama3.2:3b` on this machine. Manual setup is only needed if you want to change models yourself.

```powershell
ollama pull llama3.2:3b
ollama serve
```

The backend defaults to:

```text
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
```

You can choose another model:

```powershell
$env:OLLAMA_MODEL="mistral:7b"
npm.cmd run dev
```

Recommended practical models:

- `llama3.2:3b`
- `llama3.1:8b`
- `mistral:7b`
- `qwen2.5:7b`

## Local Image Generation

This machine is suitable for local image generation: Ryzen 9 5900X, 32 GB RAM, and RTX 4070 Ti SUPER with 16 GB VRAM.

The app supports Stable Diffusion WebUI/Forge API at:

```text
http://127.0.0.1:7860
```

Use:

```powershell
.\Start-ImageForge.cmd
```

That script installs Stable Diffusion WebUI Forge under `E:\DND\image-forge`, downloads the SDXL base checkpoint, and starts the API server. This has already been done on this machine. The first run took a while because it downloaded the model, PyTorch, and Forge dependencies.

Generated artwork is saved locally under:

```text
data/artwork
```

If the image forge is not ready, the app still creates local candle-card artwork so play is never blocked.

## What Persists

- Characters and stats.
- Campaign summary.
- Story messages.
- Inventory.
- Quests and quest progress.
- NPCs.
- Locations.
- Important memories.
- Character portraits and scene artwork.

## Architecture

- `frontend/src`: React app with campaign selection, character creation, and adventure UI.
- `backend/src/db.ts`: SQLite schema, migrations, persistence, and seed data helpers.
- `backend/src/engine.ts`: deterministic game loop, dice checks, and validated state mutations.
- `backend/src/llm.ts`: Ollama integration with mock fallback.
- `backend/src/prompt.ts`: structured DM prompt using recent conversation, state, memories, NPCs, locations, and quests.
- `backend/src/schemas.ts`: Zod schemas for model-proposed state changes.
- `backend/src/art.ts`: local image generation through Stable Diffusion WebUI/Forge, with saved fallback artwork.
- `shared/types.ts`: shared TypeScript game types.

The model writes narration and proposes structured state changes. The backend validates those proposals with schemas and applies them transactionally, so invalid JSON or implausible fields do not corrupt the database.

## Troubleshooting

- If the UI shows `Mock fallback`, Ollama is not reachable or the model returned invalid JSON. The game still runs.
- If the UI says the image forge is cold, scene and portrait buttons still create candle-card artwork. Start `Start-ImageForge.cmd` for SDXL paintings.
- If PowerShell blocks npm, use `npm.cmd`.
- If port `5173` is busy, Vite will print the alternate frontend URL.
- If port `8787` is busy, run the backend with a different port:

```powershell
$env:PORT="8790"
npm.cmd run dev
```

## MVP Features

- Prompt-based campaign creation followed by character creation inside that campaign.
- Seed fantasy campaign.
- Persistent SQLite state.
- Natural language player actions.
- Deterministic skill-check inference.
- Visible d20 rolls.
- Local LLM narration via Ollama.
- Mock fallback when no local model is installed.
- Structured state extraction and validation.
- Dark fantasy tavern/parchment interface.
- Character portraits during creation.
- Scene art for key story moments and manual requests.

## Quality Of Life Controls

- Desktop shortcut for one-click play.
- Campaign delete from the start screen.
- Ollama status indicator.
- Quick action chips during play.
- Search box for the story log.
- Manual dice tray with common dice and custom notation like `2d6+1`.
- HP `-1`, `+1`, and full rest controls.
- Local memory notes that are saved into persistent campaign memory.
- Copy latest DM reply.
- Refresh campaign state from disk.
- Write timestamped JSON backups to `data/backups`.
- Download the current campaign as JSON from the toolbar.
- Paint or repaint the character portrait.
- Paint the current story moment.
- Browse recent painted scenes in the side panel.
