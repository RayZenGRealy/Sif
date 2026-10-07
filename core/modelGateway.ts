import { ModelProvider, ModelRequest, ModelResponse } from './modelTypes';

export class ModelGateway {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  list(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  async generate(providerId: string, request: ModelRequest): Promise<ModelResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      const available = this.list().map(p => p.id).join(', ') || 'none';
      throw new Error('Unknown model provider "' + providerId + '". Available: ' + available);
    }
    return provider.generate(request);
  }
}
