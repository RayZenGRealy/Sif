export interface AvailableProvider {
  id: string;
  displayName: string;
  kind: 'cloud' | 'local' | 'custom';
  enabled: boolean;
  model?: string;
  models?: string[];
  audio?: { stt: boolean; tts: boolean };
  reason?: string;
}

export async function getAvailableProviders(): Promise<AvailableProvider[]> {
  try {
    const response = await fetch('/api/providers');
    if (!response.ok) throw new Error('gateway unavailable');
    const data = await response.json();
    return Array.isArray(data.providers) ? data.providers : [];
  } catch {
    return [
      {
        id: 'gemini',
        displayName: 'Gemini через SIF Gateway',
        kind: 'cloud',
        enabled: false,
        reason: 'SIF Gateway не запущен',
      },
      {
        id: 'local',
        displayName: 'Локальная модель',
        kind: 'local',
        enabled: false,
        reason: 'SIF Gateway не запущен',
      },
    ];
  }
}
