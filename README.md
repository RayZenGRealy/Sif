# SIF

SIF is evolving from a single-provider AI Studio app into a modular AI core with interchangeable cloud/local models, memory, tools, file analysis, training backends and robot integrations.

## Local development

**Prerequisite:** Node.js 20+.

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`.
3. Add `GEMINI_API_KEY` for Gemini through the backend gateway.
4. Optional local model: set `SIF_LOCAL_MODEL` and `SIF_LOCAL_BASE_URL` for an OpenAI-compatible server such as Ollama, LM Studio or vLLM.
5. Start SIF:
   `npm run dev`

`npm run dev` starts both the SIF Gateway on port 8787 and Vite on port 3000. Vite proxies `/api/*` to the gateway.

### Example local model configuration

```env
GEMINI_API_KEY=your_key
SIF_LOCAL_BASE_URL=http://127.0.0.1:11434
SIF_LOCAL_MODEL=your-local-model
```

In the SIF **ТЮНИНГ** panel, choose the active model. Providers that are not configured are shown as unavailable.

## Architecture

The new `core/` layer contains:

- model gateway and provider contracts
- backend gateway providers for cloud/local models
- replaceable memory store
- permission-aware tool registry
- file/media routing
- training backend contracts (SFT, LoRA, QLoRA, DPO, RL)
- robot action contract with confirmation required by default

See `core/README.md` for the roadmap.
