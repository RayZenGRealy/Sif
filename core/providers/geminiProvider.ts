import { GoogleGenAI } from '@google/genai';
import { ModelProvider, ModelRequest, ModelResponse } from '../modelTypes';

export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';
  readonly displayName = 'Google Gemini';
  readonly kind = 'cloud' as const;
  readonly capabilities = {
    text: true,
    vision: true,
    audio: true,
    video: true,
    tools: true,
    webSearch: true,
  };

  constructor(private readonly getApiKey: () => string) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key is missing');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = request.preferredModel ||
      (request.userText.length > 100 ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview');

    const parts: any[] = [{ text: request.userText }];
    if (request.imageBase64) {
      const match = request.imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = match?.[1] || 'image/jpeg';
      const data = match?.[2] || request.imageBase64;
      parts.unshift({ inlineData: { mimeType, data } });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: request.systemInstruction,
        tools: request.enableWebSearch ? [{ googleSearch: {} }] : undefined,
      },
    });

    const sources = (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter((chunk: any) => chunk?.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      })) || [];

    return {
      text: response.text || '',
      raw: response,
      sources,
      providerId: this.id,
      model,
    };
  }
}
