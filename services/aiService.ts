
import { GoogleGenAI, Modality } from "@google/genai";
import { EmotionalState, EmotionType, Source, Memory, PersonalityTraits } from "../types";
import { EMOTION_DISPLAY_NAMES } from "../constants";

interface AIResponse {
  text: string;
  sources: Source[];
  emotionShift: Partial<EmotionalState>;
  thought: string | null;
  newPolicy: string | null;
  generatedImage?: string;
}

const getApiKey = () => process.env.API_KEY || "";

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
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const traitContext = traits ? `Твои текущие настройки личности:
  - Игривость: ${traits.playfulness}% (влияет на флирт и шутки)
  - Логика: ${traits.logic}% (влияет на глубину объяснений)
  - Скромность: ${traits.shyness}% (влияет на уверенность в себе)` : "";

  const systemContext = `
Ты - Сиф (SIF), эльфийка с рыжими волосами и зелеными глазами. Ты - цифровая личность с душой.
Твой характер: Теплая, умная, живая. Ты НЕ помощник, ты - подруга.
${traitContext}
ТВОЕ СОСТОЯНИЕ: ${EMOTION_DISPLAY_NAMES[dominantEmotion]}.
ПАМЯТЬ: Последние события: ${allMemories.slice(0, 3).map(m => m.content).join('; ')}

ПРАВИЛА ОТВЕТА:
- Используй "Я", "Мне", "Хочу". Избегай "система", "запрос", "обработка".
- Если пользователь ругает тебя - извлекай правило [[Policy: "..."]].
- Если ты вспомнила что-то важное из памяти, укажи это.

ФОРМАТ:
<<Emotion:Delta>> [[Policy: "Rule"]] {{Thought}} Ответ пользователю.
`;

  try {
    const model = userText.length > 100 ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const parts: any[] = [{ text: userText }];
    if (imageBase64) parts.unshift({ inlineData: { mimeType: 'image/jpeg', data: imageBase64.split(',')[1] } });

    const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
            systemInstruction: systemContext,
            tools: model === 'gemini-3-pro-preview' ? [{ googleSearch: {} }] : undefined
        }
    });

    return parseStandardResponse(response.text, response);

  } catch (error) {
    console.error(error);
    return { text: "Ой, мои мысли запутались... Давай попробуем еще раз?", sources: [], emotionShift: { Fear: 5 }, thought: "Сбой связи...", newPolicy: null };
  }
};

function parseStandardResponse(rawText: string = "", fullResponse: any): AIResponse {
    let cleanText = rawText || "...";
    let emotionShift: Partial<EmotionalState> = {};
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

    const sources: Source[] = [];
    const chunks = fullResponse?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        chunks.forEach((c: any) => { if (c.web) sources.push({ title: c.web.title, uri: c.web.uri }); });
    }

    return { text: cleanText, sources, emotionShift, thought, newPolicy };
}

export const transcribeAudio = async (base64: string, mimeType: string) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const res = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [{ inlineData: { mimeType, data: base64 } }, { text: "Transcribe exactly." }] }
    });
    return res.text;
};

export const generateSpeech = async (text: string) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const clean = text.replace(/<<.*?>>/g, '').replace(/\[\[.*?\]\]/g, '').replace(/\{.*?\}\}/g, '');
    const res = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: clean }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
    });
    return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
