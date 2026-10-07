# SIF Core v0.1

SIF Core separates UI, model providers, memory, tools, file analysis, training and robot actions.

## Runtime flow

`React UI -> SIF Core -> BackendGatewayProvider -> /api/chat -> cloud or local model`

The backend gateway keeps ordinary chat credentials out of the browser and lets SIF switch providers without changing the UI.

## Providers

- `gemini`: Gemini through SIF Gateway.
- `local`: any OpenAI-compatible local/server model configured with `SIF_LOCAL_BASE_URL` and `SIF_LOCAL_MODEL`.
- `OpenAICompatibleProvider`: lower-level provider contract for future direct/server-side integrations.

## Memory and tools

`BrowserMemoryStore` is the first replaceable memory implementation. `ToolRegistry` supports local, online and robot tools; tools can require explicit confirmation.

## File/media layer

The current analyzer identifies text, images, audio, video and binary files and routes them toward capable providers. Rich document parsing and timed video ingestion are next milestones.

## Training

`TrainingBackend` defines a common contract for SFT, LoRA, QLoRA, DPO and RL jobs. v0.1 defines the interface only; a worker service will execute jobs later.

## Robot layer

`createRobotTool` marks robot actions as confirmation-required by default. The future ROS2 adapter should translate approved high-level actions into constrained robot commands and return sensor/state feedback.

## Next milestones

1. Persistent vector memory + document ingestion.
2. PDF/DOCX/XLSX and timed audio/video ingestion.
3. Tool execution service and connector permissions.
4. Training worker with dataset/model versioning.
5. ROS2 adapter and simulation tests.
