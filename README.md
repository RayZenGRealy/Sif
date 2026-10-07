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

В v0.4 SIF поддерживает hybrid search: обычный лексический поиск + cosine similarity по локальным embedding-векторам. Если embedding-сервис не настроен или временно недоступен, память автоматически возвращается к лексическому поиску.

### Semantic memory

Подключи любой локальный OpenAI-compatible embedding endpoint (`/v1/embeddings`):

```env
SIF_EMBEDDING_BASE_URL=http://127.0.0.1:11434
SIF_EMBEDDING_MODEL=your-embedding-model
SIF_EMBEDDING_API_KEY=
SIF_EMBEDDING_BATCH_SIZE=16
```

Если `SIF_EMBEDDING_BASE_URL` пустой, Knowledge Service использует `SIF_LOCAL_BASE_URL`. Новые документы получают embeddings при загрузке. Для старой базы нажми **ДОИНДЕКСИРОВАТЬ ПО СМЫСЛУ** в панели SIF.

Embedding-векторы хранятся локально в `.sif-data/knowledge.json`; облако для semantic memory не требуется.

## Audio / Video Memory

В v0.5 кнопка со скрепкой принимает аудио и видео. Аудио отправляется в локальный STT, а видео разбирается через FFmpeg: из него извлекается звуковая дорожка и, если настроена vision-модель, периодические кадры.

Результат превращается в обычный текстовый источник памяти: транскрипт речи + описания визуальных событий. После этого он автоматически проходит тот же chunking, embeddings и hybrid search, что PDF/DOCX/XLSX.

Для аудио нужен локальный OpenAI-compatible STT:

```env
SIF_STT_BASE_URL=http://127.0.0.1:8000
SIF_STT_MODEL=whisper
SIF_STT_LANGUAGE=ru
```

Для видео установи FFmpeg и при желании подключи локальную vision-модель:

```env
SIF_FFMPEG_PATH=ffmpeg
SIF_VIDEO_FRAME_INTERVAL_SECONDS=15
SIF_VIDEO_MAX_FRAMES=12
SIF_VISION_BASE_URL=http://127.0.0.1:11434
SIF_VISION_MODEL=your-vision-model
SIF_VISION_API_KEY=
```

Если vision-модель не настроена, видео всё равно может попасть в память по своей звуковой дорожке. Если в видео нет полезного аудио, для его понимания нужна vision-модель. Лимит браузерной загрузки v0.5 — 100 МБ.

В `SIF_OFFLINE_ONLY=true` весь этот pipeline остаётся локальным: FFmpeg + локальный STT + локальная vision-модель + локальные embeddings.
