import { ModelProvider, ModelRequest, ModelResponse, ProviderKind } from '../modelTypes';

export interface BackendGatewayProviderConfig {
  id: string;
  displayName: string;
  kind: ProviderKind;
  endpoint?: string;
}

export class BackendGatewayProvider implements ModelProvider {
  readonly id: string;
  readonly displayName: string;
  readonly kind: ProviderKind;
  readonly capabilities = {
    text: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    webSearch: true,
  };
  private readonly endpoint: string;

  constructor(config: BackendGatewayProviderConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.kind = config.kind;
    this.endpoint = config.endpoint || '/api/chat';
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: this.id, request }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || ('SIF gateway failed: ' + response.status + ' ' + response.statusText));
    }

    const data = await response.json();
    return {
      text: data.text || '',
      sources: data.sources || [],
      providerId: data.providerId || this.id,
      model: data.model,
      raw: data.raw,
    };
  }
}
