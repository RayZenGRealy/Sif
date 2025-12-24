

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

export interface Memory {
  id: string;
  content: string;
  timestamp: Date;
  emotion: EmotionType;
  importance: number;
}

export interface SifSoul {
  name: string;
  age: number; // Days
  lifeEnergy: number;
  currentEmotion: EmotionalState;
  memories: Memory[];
  learnedPolicies: string[]; // Explicit rules learned from user feedback
  desires: string[];
  relationships: Record<string, number>;
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
  audioBase64?: string; // Raw PCM data base64 encoded
  image?: string; // Base64 encoded image for display
  videoUrl?: string; // URL for Veo generated video
}
