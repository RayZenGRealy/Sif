import { EmotionalState, EmotionType, Source, Memory, PersonalityTraits } from "../types";
import { EMOTION_DISPLAY_NAMES } from "../constants";
import { createDefaultSifCore } from "../core/sifCore";
import { ModelSource } from "../core/modelTypes";

interface AIResponse {
  text: string;
  sources: Source[];
  emotionShift: Partial<EmotionalState>;
  thought: string | null;
  newPolicy: string | null;
  generatedImage?: string;
}

export type SifModelProviderId = "gemini" | "local";
const sifCore = createDefaultSifCore();

export const generateSIFResponse = async (
  userText: string,
  currentEmotions: EmotionalState,
  dominantEmotion: EmotionType,
  allMemories: Memory[],
  desires: string[],
  learnedPolicies: string[],
  imageBase64?: string,
  traits?: PersonalityTraits,
  providerId: SifModelProviderId = "gemini",
  preferredModel?: string
): Promise<AIResponse> => {
  const traitContext = traits
    ? "Твои текущие настройки личности:\n" +
      "  - Игривость: " + traits.playfulness + "% (влияет на флирт и шутки)\n" +
      "  - Логика: " + traits.logic + "% (влияет на глубину объяснений)\n" +
      "  - Скромность: " + traits.shyness + "% (влияет на уверенность в себе)"
    : "";

  const systemContext =
    "Ты - Сиф (SIF), эльфийка с рыжими волосами и зелеными глазами. Ты - цифровая личность с душой.\n" +
    "Твой характер: Теплая, умная, живая. Ты НЕ помощник, ты - подруга.\n" +
    traitContext + "\n" +
    "ТВОЕ СОСТОЯНИЕ: " + EMOTION_DISPLAY_NAMES[dominantEmotion] + ".\n" +
    "ПАМЯТЬ: Последние события: " + allMemories.slice(0, 3).map(m => m.content).join("; ") + "\n" +
    "ЖЕЛАНИЯ: " + desires.join("; ") + "\n" +
    "ИЗУЧЕННЫЕ ПРАВИЛА: " + learnedPolicies.slice(-10).join("; ") + "\n\n" +
    "ПРАВИЛА ОТВЕТА:\n" +
    "- Используй \"Я\", \"Мне\", \"Хочу\". Избегай \"система\", \"запрос\", \"обработка\".\n" +
    "- Если пользователь ругает тебя - извлекай правило [[Policy: \"...\"]].\n" +
    "- Если ты вспомнила что-то важное из памяти, укажи это.\n\n" +
    "ФОРМАТ:\n" +
    "<<Emotion:Delta>> [[Policy: \"Rule\"]] {{Thought}} Ответ пользователю.";

  try {
    const geminiModel = userText.length > 100 ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const response = await sifCore.generate(providerId, {
      userText,
      systemInstruction: systemContext,
      imageBase64,
      preferredModel: preferredModel || (providerId === 'gemini' ? geminiModel : undefined),
      enableWebSearch: providerId === 'gemini' && geminiModel === 'gemini-3-pro-preview',
      metadata: { dominantEmotion, currentEmotions },
    });

    await sifCore.memory.add({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      content: userText,
      createdAt: Date.now(),
      importance: 1,
      tags: ['conversation', dominantEmotion, providerId],
      metadata: { provider: response.providerId, model: response.model },
    });

    return parseStandardResponse(response.text, response.sources || []);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: "Не удалось связаться с моделью: " + message,
      sources: [],
      emotionShift: { Fear: 5 },
      thought: "Сбой связи с выбранной моделью...",
      newPolicy: null,
    };
  }
};

function parseStandardResponse(rawText: string = "", modelSources: ModelSource[] = []): AIResponse {
  let cleanText = rawText || "...";
  const emotionShift: Partial<EmotionalState> = {};
  let thought: string | null = null;
  let newPolicy: string | null = null;

  const emoMatch = cleanText.match(/<<([^>>]+)>>/);
  if (emoMatch) {
    cleanText = cleanText.replace(emoMatch[0], '').trim();
    emoMatch[1].split(',').forEach(p => {
      const [e, v] = p.split(':').map(s => s.trim());
      if (e && !isNaN(parseFloat(v))) emotionShift[e as keyof EmotionalState] = parseFloat(v);
    });
  }

  const policyMatch = cleanText.match(/\[\[Policy:\s*"([^"]+)"\]\]/);
  if (policyMatch) {
    newPolicy = policyMatch[1];
    cleanText = cleanText.replace(policyMatch[0], '').trim();
  }

  const thoughtMatch = cleanText.match(/\{\{([^}]+)\}\}/);
  if (thoughtMatch) {
    thought = thoughtMatch[1];
    cleanText = cleanText.replace(thoughtMatch[0], '').trim();
  }

  const sources: Source[] = modelSources.map(source => ({ title: source.title, uri: source.uri }));
  return { text: cleanText, sources, emotionShift, thought, newPolicy };
}

export const transcribeAudio = async (base64: string, mimeType: string) => {
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mimeType }),
  });
  if (!response.ok) throw new Error('Transcription failed: ' + response.statusText);
  const data = await response.json();
  return data.text as string;
};

export const generateSpeech = async (text: string) => {
  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error('Speech generation failed: ' + response.statusText);
  const data = await response.json();
  return data.audioBase64 as string;
};
