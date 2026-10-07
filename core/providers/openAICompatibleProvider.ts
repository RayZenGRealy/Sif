import { ModelProvider, ModelRequest, ModelResponse } from '../modelTypes';

export interface OpenAICompatibleConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  kind?: 'cloud' | 'local' | 'custom';
  headers?: Record<string, string>;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly displayName: string;
  readonly kind: 'cloud' | 'local' | 'custom';
  readonly capabilities = {
    text: true,
    vision: true,
    tools: true,
  };

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.kind = config.kind || 'custom';
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers.Authorization = 'Bearer ' + this.config.apiKey;
    }

    const userContent: any[] = [{ type: 'text', text: request.userText }];
    if (request.imageBase64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: request.imageBase64 },
      });
    }

    const messages: any[] = [];
    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }
    messages.push({
      role: 'user',
      content: request.imageBase64 ? userContent : request.userText,
    });

    const response = await fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.preferredModel || this.config.defaultModel,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(
        this.displayName + ' request failed: ' + response.status + ' ' + response.statusText,
      );
    }

    const data = await response.json();
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      '';

    return {
      text: typeof text === 'string' ? text : JSON.stringify(text),
      raw: data,
      providerId: this.id,
      model: request.preferredModel || this.config.defaultModel,
    };
  }
}
