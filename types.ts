
export enum EmotionType {
  Joy = 'Joy',
  Sadness = 'Sadness',
  Anger = 'Anger',
  Fear = 'Fear',
  Curiosity = 'Curiosity',
  Affection = 'Affection',
  Pride = 'Pride',
  Shame = 'Shame',
}

export interface EmotionalState {
  [key: string]: number;
  Joy: number;
  Sadness: number;
  Anger: number;
  Fear: number;
  Curiosity: number;
  Affection: number;
  Pride: number;
  Shame: number;
}

export interface PersonalityTraits {
  playfulness: number; // 0-100
  logic: number;      // 0-100
  shyness: number;    // 0-100
}

export interface Memory {
  id: string;
  content: string;
  timestamp: Date;
  emotion: EmotionType;
  importance: number;
  recalledCount?: number;
}

export interface MoodSnapshot {
  timestamp: number;
  emotion: EmotionType;
  intensity: number;
}

export interface SifSoul {
  name: string;
  age: number; 
  lifeEnergy: number;
  currentEmotion: EmotionalState;
  traits: PersonalityTraits;
  memories: Memory[];
  learnedPolicies: string[]; 
  desires: string[];
  relationships: Record<string, number>;
  moodHistory: MoodSnapshot[];
}

export interface Source {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'sif';
  text: string;
  emotion?: EmotionType;
  timestamp: Date;
  sources?: Source[];
  audioBase64?: string;
  image?: string;
  videoUrl?: string;
  memoryRecall?: string; // Content of memory used for this message
}