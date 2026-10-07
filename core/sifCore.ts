import { ModelGateway } from './modelGateway';
import { ModelProvider, ModelRequest, ModelResponse } from './modelTypes';
import { BackendGatewayProvider } from './providers/backendGatewayProvider';
import { BrowserMemoryStore, MemoryStore } from './memory/memoryStore';
import { ToolDefinition, ToolRegistry } from './tools/toolRegistry';
import { analyzeFile, FileAnalysis } from './files/fileAnalyzer';

export class SifCore {
  readonly models = new ModelGateway();
  readonly tools = new ToolRegistry();

  constructor(readonly memory: MemoryStore = new BrowserMemoryStore()) {}

  registerModel(provider: ModelProvider): void {
    this.models.register(provider);
  }

  registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.register(tool);
  }

  generate(providerId: string, request: ModelRequest): Promise<ModelResponse> {
    return this.models.generate(providerId, request);
  }

  analyzeFile(file: File): Promise<FileAnalysis> {
    return analyzeFile(file);
  }
}

export function createDefaultSifCore(): SifCore {
  const core = new SifCore();
  core.registerModel(new BackendGatewayProvider({
    id: 'gemini',
    displayName: 'Gemini через SIF Gateway',
    kind: 'cloud',
  }));
  core.registerModel(new BackendGatewayProvider({
    id: 'local',
    displayName: 'Локальная модель',
    kind: 'local',
  }));
  return core;
}
