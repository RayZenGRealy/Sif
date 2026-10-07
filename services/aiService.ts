import { GoogleGenAI, Modality } from "@google/genai";
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

const getApiKey = () => process.env.API_KEY || "";
const sifCore = createDefaultSifCore(getApiKey);

export const generateSIFResponse = async (
  userText: string,
  currentEmotions: EmotionalState,
  dominantEmotion: EmotionType,
  allMemories: Memory[],
  desires: string[],
  learnedPolicies: string[],
  imageBase64?: string,
  traits?: PersonalityTraits
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
    const model = userText.length > 100 ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const response = await sifCore.generate('gemini', {
      userText,
      systemInstruction: systemContext,
      imageBase64,
      preferredModel: model,
      enableWebSearch: model === 'gemini-3-pro-preview',
      metadata: { dominantEmotion, currentEmotions },
    });

    await sifCore.memory.add({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      content: userText,
      createdAt: Date.now(),
      importance: 1,
      tags: ['conversation', dominantEmotion],
      metadata: { provider: response.providerId, model: response.model },
    });

    return parseStandardResponse(response.text, response.sources || []);
  } catch (error) {
    console.error(error);
    return {
      text: "Ой, мои мысли запутались... Давай попробуем еще раз?",
      sources: [],
      emotionShift: { Fear: 5 },
      thought: "Сбой связи...",
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
      if (e && !isNaN(parseFloat(v))) {
        emotionShift[e as keyof EmotionalState] = parseFloat(v);
      }
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

  const sources: Source[] = modelSources.map(source => ({
    title: source.title,
    uri: source.uri,
  }));

  return { text: cleanText, sources, emotionShift, thought, newPolicy };
}

export const transcribeAudio = async (base64: string, mimeType: string) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const res = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: "Transcribe exactly." },
      ],
    },
  });
  return res.text;
};

export const generateSpeech = async (text: string) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const clean = text
    .replace(/<<.*?>>/g, '')
    .replace(/\[\[.*?\]\]/g, '')
    .replace(/\{.*?\}/g, '');

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: clean }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
