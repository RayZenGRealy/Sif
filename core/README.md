# SIF Core v0.1

SIF Core separates the user interface from model providers, memory, tools, file analysis, training backends and robot actions.

## Main pieces

- ModelGateway: one interface for Gemini, local models and OpenAI-compatible servers.
- ToolRegistry: online, local and robot tools with confirmation support.
- MemoryStore: replaceable long-term memory layer.
- File analyzer: routes text, image, audio, video and binary files.
- Training types: common contract for future SFT, LoRA/QLoRA, DPO and RL backends.
- Robot tool contract: robot actions are confirmation-gated by default.

## Local models

Use OpenAICompatibleProvider with servers such as Ollama, LM Studio or vLLM when they expose an OpenAI-compatible chat endpoint.

Example:

    core.registerModel(new OpenAICompatibleProvider({
      id: 'local',
      displayName: 'Local LLM',
      baseUrl: 'http://localhost:11434',
      defaultModel: 'your-model',
      kind: 'local'
    }));

The browser must be allowed to reach the server and the server must permit CORS. For production, put local/remote model access behind a SIF backend gateway instead of exposing secrets in the browser.

## Next milestones

1. Backend gateway for credentials, tools and local-network connectors.
2. UI model/provider selector.
3. Persistent vector memory and document ingestion.
4. Video/audio ingestion pipeline.
5. Training worker service with dataset/version tracking.
6. ROS2 adapter with permissioned action execution.
