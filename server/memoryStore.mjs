import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.cwd(), process.env.SIF_DATA_DIR || '.sif-data');
const DB_PATH = resolve(DATA_DIR, 'knowledge.json');
const TMP_PATH = resolve(DATA_DIR, 'knowledge.tmp.json');

const EMPTY_DB = { version: 2, documents: [], chunks: [] };

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadDb() {
  await ensureDataDir();
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 2,
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [],
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(EMPTY_DB);
    throw error;
  }
}

async function saveDb(db) {
  await ensureDataDir();
  await writeFile(TMP_PATH, JSON.stringify(db, null, 2), 'utf8');
  await rename(TMP_PATH, DB_PATH);
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text, targetSize = 1200, overlap = 180) {
  const source = normalizeText(text);
  if (!source) return [];
  if (source.length <= targetSize) return [source];

  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + targetSize);
    if (end < source.length) {
      const window = source.slice(start, end);
      const paragraphBreak = window.lastIndexOf('\n\n');
      const sentenceBreak = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
      const wordBreak = window.lastIndexOf(' ');
      const bestBreak = Math.max(paragraphBreak, sentenceBreak, wordBreak);
      if (bestBreak > targetSize * 0.55) end = start + bestBreak + 1;
    }
    const chunk = source.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= source.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [])
    .filter(token => !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  'это','как','что','для','или','при','так','его','ее','она','они','оно','мы','вы','ты','я',
  'the','and','for','with','that','this','from','are','was','were','you','your','have','has'
]);

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function lexicalScore(content, documentName, tokens, phrase) {
  const text = String(content || '').toLowerCase();
  const name = String(documentName || '').toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const occurrences = countOccurrences(text, token);
    if (occurrences) score += 2 + Math.min(occurrences, 4);
    if (name.includes(token)) score += 2;
  }
  if (phrase.length >= 5 && text.includes(phrase)) score += 12;
  score += Math.min(tokens.filter(token => text.includes(token)).length, 5);
  return score;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function ingestKnowledgeDocument({
  name,
  mimeType,
  size,
  text,
  embedder,
  embeddingModel,
}) {
  const normalized = normalizeText(text);
  if (!normalized) throw new Error('В документе не найден текст для индексации');

  const db = await loadDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const pieces = chunkText(normalized);
  let embeddings = [];

  if (embedder && pieces.length) {
    try {
      embeddings = await embedder(pieces);
    } catch (error) {
      console.warn('[SIF Memory] embedding during ingest failed, lexical memory remains available:', error);
      embeddings = [];
    }
  }

  const embeddedChunkCount = pieces.reduce(
    (sum, _content, index) => sum + (Array.isArray(embeddings[index]) && embeddings[index].length ? 1 : 0),
    0,
  );

  const document = {
    id,
    name,
    mimeType,
    size,
    createdAt,
    characters: normalized.length,
    chunkCount: pieces.length,
    embeddedChunkCount,
    embeddingModel: embeddedChunkCount ? embeddingModel : undefined,
  };

  db.documents.unshift(document);
  pieces.forEach((content, index) => {
    const embedding = Array.isArray(embeddings[index]) && embeddings[index].length
      ? embeddings[index]
      : undefined;
    db.chunks.push({
      id: id + ':' + index,
      documentId: id,
      index,
      content,
      createdAt,
      embedding,
      embeddingModel: embedding ? embeddingModel : undefined,
    });
  });
  await saveDb(db);
  return document;
}

export async function listKnowledgeDocuments(limit = 100) {
  const db = await loadDb();
  return db.documents.slice(0, Math.max(1, limit));
}

export async function getKnowledgeStats() {
  const db = await loadDb();
  const embeddedChunks = db.chunks.filter(chunk => Array.isArray(chunk.embedding) && chunk.embedding.length).length;
  return {
    documents: db.documents.length,
    chunks: db.chunks.length,
    embeddedChunks,
    semanticCoverage: db.chunks.length ? Math.round((embeddedChunks / db.chunks.length) * 100) : 0,
    characters: db.documents.reduce((sum, doc) => sum + (doc.characters || 0), 0),
    dataDir: DATA_DIR,
  };
}

export async function getEmbeddingCandidates(limit = 32) {
  const db = await loadDb();
  return db.chunks
    .filter(chunk => !Array.isArray(chunk.embedding) || !chunk.embedding.length)
    .slice(0, Math.max(1, limit))
    .map(chunk => ({ id: chunk.id, documentId: chunk.documentId, content: chunk.content }));
}

export async function saveChunkEmbeddings(items, embeddingModel) {
  if (!Array.isArray(items) || !items.length) return 0;
  const db = await loadDb();
  const updateMap = new Map(
    items
      .filter(item => item?.id && Array.isArray(item.embedding) && item.embedding.length)
      .map(item => [item.id, item.embedding]),
  );

  let updated = 0;
  for (const chunk of db.chunks) {
    const embedding = updateMap.get(chunk.id);
    if (!embedding) continue;
    chunk.embedding = embedding;
    chunk.embeddingModel = embeddingModel;
    updated += 1;
  }

  if (updated) {
    const counts = new Map();
    for (const chunk of db.chunks) {
      if (Array.isArray(chunk.embedding) && chunk.embedding.length) {
        counts.set(chunk.documentId, (counts.get(chunk.documentId) || 0) + 1);
      }
    }
    for (const document of db.documents) {
      document.embeddedChunkCount = counts.get(document.id) || 0;
      if (document.embeddedChunkCount) document.embeddingModel = embeddingModel;
    }
    await saveDb(db);
  }
  return updated;
}

export async function searchKnowledge(query, limit = 6, { queryEmbedding } = {}) {
  const db = await loadDb();
  const tokens = [...new Set(tokenize(query))];
  const phrase = String(query || '').trim().toLowerCase();
  const semanticEnabled = Array.isArray(queryEmbedding) && queryEmbedding.length > 0;

  if (!tokens.length && !semanticEnabled) return [];

  const docMap = new Map(db.documents.map(doc => [doc.id, doc]));

  return db.chunks
    .map(chunk => {
      const document = docMap.get(chunk.documentId);
      const lexical = lexicalScore(chunk.content, document?.name, tokens, phrase);
      const semantic = semanticEnabled ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding)) : 0;
      const score = lexical + semantic * 14;

      return {
        score,
        lexicalScore: lexical,
        semanticScore: semantic,
        searchMode: semanticEnabled && Array.isArray(chunk.embedding) ? 'hybrid' : 'lexical',
        chunkId: chunk.id,
        chunkIndex: chunk.index,
        content: chunk.content,
        documentId: chunk.documentId,
        documentName: document?.name || 'Документ',
      };
    })
    .filter(item => item.lexicalScore > 0 || item.semanticScore >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}
