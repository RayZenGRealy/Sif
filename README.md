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

`npm run dev` starts the SIF Gateway on port 8787, the local Knowledge Service on port 8788, and Vite on port 3000. Vite proxies `/api/*` and `/knowledge-api/*` to the local services.

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

## Полностью автономный режим

Чтобы запретить любые облачные обращения:

```env
SIF_OFFLINE_ONLY=true
SIF_LOCAL_BASE_URL=http://127.0.0.1:11434
SIF_LOCAL_MODEL=
SIF_STT_BASE_URL=http://127.0.0.1:8000
SIF_STT_MODEL=whisper
SIF_TTS_BASE_URL=http://127.0.0.1:8880
SIF_TTS_MODEL=kokoro
```

`SIF_LOCAL_MODEL` можно оставить пустым: gateway попробует найти модели автоматически через `/v1/models` или Ollama `/api/tags`.

В `SIF_OFFLINE_ONLY=true` Gemini отключается даже при наличии ключа. Для голоса необходимо отдельно запустить локальные STT/TTS сервисы с OpenAI-compatible endpoints.

## Локальная база знаний

Кнопка со скрепкой в чате индексирует документы в `.sif-data/knowledge.json`. Данные не коммитятся в Git.

Поддерживаются текстовые/кодовые файлы, PDF, DOCX и XLSX. Документ разбивается на фрагменты, а перед каждым ответом SIF локально ищет наиболее релевантные фрагменты и добавляет их в контекст выбранной модели.

```env
SIF_KNOWLEDGE_PORT=8788
SIF_DATA_DIR=.sif-data
SIF_MEMORY_TOP_K=6
SIF_MAX_DOCUMENT_BYTES=15728640
```

Первый поиск в v0.3 лексический и полностью локальный. Следующий шаг — embeddings/vector search для семантической памяти.
