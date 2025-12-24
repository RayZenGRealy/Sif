
import { SifSoul, EmotionalState, EmotionType, Memory } from '../types';
import { EMOTION_KEYWORDS, EMOTION_RESPONSES, THOUGHTS, EMOTION_DISPLAY_NAMES } from '../constants';

export const createInitialSoul = (): SifSoul => ({
  name: "SIF",
  age: 0,
  lifeEnergy: 100,
  currentEmotion: {
    Joy: 50,
    Sadness: 0,
    Anger: 0,
    Fear: 0,
    Curiosity: 50,
    Affection: 0,
    Pride: 0,
    Shame: 0,
  },
  memories: [],
  learnedPolicies: [], // Initialize empty
  desires: [],
  relationships: {},
});

export const normalizeEmotions = (emotions: EmotionalState): EmotionalState => {
  const total = Object.values(emotions).reduce((a, b) => a + b, 0);
  if (total > 100) {
    const factor = 100 / total;
    const newEmotions = { ...emotions };
    for (const key in newEmotions) {
      newEmotions[key] *= factor;
    }
    return newEmotions;
  }
  return emotions;
};

export const getDominantEmotion = (emotions: EmotionalState): EmotionType => {
  let maxVal = -1;
  let dominant = EmotionType.Curiosity;
  
  for (const [key, value] of Object.entries(emotions)) {
    if (value > maxVal) {
      maxVal = value;
      dominant = key as EmotionType;
    }
  }
  return dominant;
};

export const analyzeTone = (text: string): { emotion: EmotionType; strength: number } => {
  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  // Initialize scores
  Object.values(EmotionType).forEach(e => scores[e] = 0);

  // Count keywords
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    keywords.forEach(word => {
      if (lowerText.includes(word)) {
        scores[emotion] = (scores[emotion] || 0) + 1;
      }
    });
  }

  // Find dominant
  let maxScore = 0;
  let detectedEmotion = EmotionType.Curiosity; // Default

  for (const [key, val] of Object.entries(scores)) {
    if (val > maxScore) {
      maxScore = val;
      detectedEmotion = key as EmotionType;
    }
  }

  // Calculate Strength
  let strength = 1.0;
  strength += (text.match(/!/g) || []).length * 0.2;
  strength += (text.match(/\?/g) || []).length * 0.1;
  strength += Math.min(text.length / 100, 0.5);
  if (["❤️", "😊", "🥰"].some(emoji => text.includes(emoji))) strength += 0.3;

  return { emotion: detectedEmotion, strength: Math.max(0.5, Math.min(strength, 3.0)) };
};

export const generateResponse = (emotion: EmotionType): string => {
  const responses = EMOTION_RESPONSES[emotion] || EMOTION_RESPONSES[EmotionType.Curiosity];
  return responses[Math.floor(Math.random() * responses.length)];
};

export const generateThought = (emotion: EmotionType): string => {
  const thoughts = THOUGHTS[emotion] || THOUGHTS[EmotionType.Curiosity];
  return thoughts[Math.floor(Math.random() * thoughts.length)];
};

export const searchMemories = (memories: Memory[], query: string): Memory[] => {
  const lowerQuery = query.toLowerCase();
  
  // Basic heuristic: keyword match in content OR match in emotion name (local or english)
  return memories.filter(m => {
    const contentMatch = m.content.toLowerCase().includes(lowerQuery);
    const emotionName = EMOTION_DISPLAY_NAMES[m.emotion].toLowerCase();
    const emotionType = m.emotion.toLowerCase();
    const emotionMatch = emotionName.includes(lowerQuery) || emotionType.includes(lowerQuery);
    
    return contentMatch || emotionMatch;
  }).sort((a, b) => b.importance - a.importance); // prioritize high importance
};
