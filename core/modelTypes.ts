export type ProviderKind = 'cloud' | 'local' | 'custom';

export interface ModelCapabilities {
  text: boolean;
  vision?: boolean;
  audio?: boolean;
  video?: boolean;
  tools?: boolean;
  webSearch?: boolean;
}

export interface ModelRequest {
  userText: string;
  systemInstruction?: string;
  imageBase64?: string;
  preferredModel?: string;
  enableWebSearch?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ModelSource {
  title: string;
  uri: string;
}

export interface ModelResponse {
  text: string;
  raw?: unknown;
  sources?: ModelSource[];
  providerId: string;
  model?: string;
}

export interface ModelProvider {
  readonly id: string;
  readonly displayName: string;
  readonly kind: ProviderKind;
  readonly capabilities: ModelCapabilities;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
