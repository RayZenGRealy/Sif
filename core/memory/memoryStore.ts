export interface CoreMemory {
  id: string;
  content: string;
  createdAt: number;
  importance: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  add(memory: CoreMemory): Promise<void>;
  list(limit?: number): Promise<CoreMemory[]>;
  search(query: string, limit?: number): Promise<CoreMemory[]>;
  clear(): Promise<void>;
}

export class BrowserMemoryStore implements MemoryStore {
  constructor(private readonly storageKey = 'sif_core_memories_v1') {}

  private load(): CoreMemory[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private save(memories: CoreMemory[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.storageKey, JSON.stringify(memories));
  }

  async add(memory: CoreMemory): Promise<void> {
    const memories = this.load();
    memories.unshift(memory);
    this.save(memories.slice(0, 500));
  }

  async list(limit = 100): Promise<CoreMemory[]> {
    return this.load().slice(0, limit);
  }

  async search(query: string, limit = 20): Promise<CoreMemory[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.load()
      .map(memory => {
        const haystack = (memory.content + ' ' + (memory.tags?.join(' ') || '')).toLowerCase();
        const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
        return { memory, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance)
      .slice(0, limit)
      .map(item => item.memory);
  }

  async clear(): Promise<void> {
    this.save([]);
  }
}
