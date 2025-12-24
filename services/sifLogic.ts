
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
  traits: {
    playfulness: 70,
    logic: 50,
    shyness: 30
  },
  memories: [],
  learnedPolicies: [],
  desires: ["Я хочу понять твои сны...", "Я хочу стать твоим лучшим другом"],
  relationships: {},
  moodHistory: []
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

export const generateThought = (emotion: EmotionType): string => {
  const thoughts = THOUGHTS[emotion] || THOUGHTS[EmotionType.Curiosity];
  return thoughts[Math.floor(Math.random() * thoughts.length)];
};

export const searchMemories = (memories: Memory[], query: string): Memory[] => {
  const lowerQuery = query.toLowerCase();
  return memories.filter(m => 
    m.content.toLowerCase().includes(lowerQuery) || 
    EMOTION_DISPLAY_NAMES[m.emotion].toLowerCase().includes(lowerQuery)
  ).sort((a, b) => b.importance - a.importance);
};
