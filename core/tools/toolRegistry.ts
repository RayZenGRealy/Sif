export type ToolKind = 'local' | 'online' | 'robot';

export interface ToolContext {
  conversationId?: string;
  userId?: string;
  signal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  description: string;
  kind: ToolKind;
  requiresConfirmation?: boolean;
  run(input: TInput, context: ToolContext): Promise<TOutput>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any, any>>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.set(tool.id, tool);
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  async execute<TOutput = unknown>(
    toolId: string,
    input: unknown,
    context: ToolContext = {},
    confirmed = false,
  ): Promise<TOutput> {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error('Unknown tool: ' + toolId);
    if (tool.requiresConfirmation && !confirmed) {
      throw new Error('Tool "' + tool.name + '" requires user confirmation');
    }
    return tool.run(input, context) as Promise<TOutput>;
  }
}
