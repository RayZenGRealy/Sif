import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.cwd(), process.env.SIF_DATA_DIR || '.sif-data');
const DB_PATH = resolve(DATA_DIR, 'knowledge.json');
const TMP_PATH = resolve(DATA_DIR, 'knowledge.tmp.json');

const EMPTY_DB = { version: 1, documents: [], chunks: [] };

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadDb() {
  await ensureDataDir();
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
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

export async function ingestKnowledgeDocument({ name, mimeType, size, text }) {
  const normalized = normalizeText(text);
  if (!normalized) throw new Error('В документе не найден текст для индексации');

  const db = await loadDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const pieces = chunkText(normalized);
  const document = {
    id,
    name,
    mimeType,
    size,
    createdAt,
    characters: normalized.length,
    chunkCount: pieces.length,
  };

  db.documents.unshift(document);
  pieces.forEach((content, index) => {
    db.chunks.push({
      id: id + ':' + index,
      documentId: id,
      index,
      content,
      createdAt,
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
  return {
    documents: db.documents.length,
    chunks: db.chunks.length,
    characters: db.documents.reduce((sum, doc) => sum + (doc.characters || 0), 0),
    dataDir: DATA_DIR,
  };
}

export async function searchKnowledge(query, limit = 6) {
  const db = await loadDb();
  const tokens = [...new Set(tokenize(query))];
  if (!tokens.length) return [];
  const phrase = String(query || '').trim().toLowerCase();
  const docMap = new Map(db.documents.map(doc => [doc.id, doc]));

  return db.chunks
    .map(chunk => {
      const text = chunk.content.toLowerCase();
      const document = docMap.get(chunk.documentId);
      let score = 0;
      for (const token of tokens) {
        const occurrences = countOccurrences(text, token);
        if (occurrences) score += 2 + Math.min(occurrences, 4);
        if (document?.name?.toLowerCase().includes(token)) score += 2;
      }
      if (phrase.length >= 5 && text.includes(phrase)) score += 12;
      score += Math.min(tokens.filter(token => text.includes(token)).length, 5);
      return {
        score,
        chunkId: chunk.id,
        chunkIndex: chunk.index,
        content: chunk.content,
        documentId: chunk.documentId,
        documentName: document?.name || 'Документ',
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}
