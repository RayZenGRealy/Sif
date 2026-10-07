export interface KnowledgeDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  characters: number;
  chunkCount: number;
}

export interface KnowledgeStats {
  documents: number;
  chunks: number;
  embeddedChunks?: number;
  semanticCoverage?: number;
  semanticEnabled?: boolean;
  embeddingModel?: string | null;
  characters: number;
}

export interface KnowledgeSearchResult {
  score: number;
  chunkId: string;
  chunkIndex: number;
  content: string;
  documentId: string;
  documentName: string;
  lexicalScore?: number;
  semanticScore?: number;
  searchMode?: 'hybrid' | 'lexical';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.readAsDataURL(file);
  });
}

export async function ingestKnowledgeFile(file: File): Promise<KnowledgeDocument> {
  const base64 = await fileToBase64(file);
  const response = await fetch('/knowledge-api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      base64,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || ('Ошибка индексации: ' + response.statusText));
  return data.document;
}

export async function getKnowledgeStats(): Promise<KnowledgeStats> {
  const response = await fetch('/knowledge-api/stats');
  if (!response.ok) return { documents: 0, chunks: 0, characters: 0 };
  return response.json();
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const response = await fetch('/knowledge-api/documents');
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.documents) ? data.documents : [];
}

export async function searchKnowledge(query: string, limit = 6): Promise<KnowledgeSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const response = await fetch('/knowledge-api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

export interface EmbeddingReindexResult {
  enabled: boolean;
  updated: number;
  remaining: number;
  model: string | null;
}

export async function reindexKnowledgeEmbeddings(limit = 64): Promise<EmbeddingReindexResult> {
  const response = await fetch('/knowledge-api/embeddings/reindex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || ('Ошибка semantic reindex: ' + response.statusText));
  return data;
}
