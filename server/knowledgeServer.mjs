import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractDocumentText, isSupportedDocument } from './documentParsers.mjs';
import { extractMediaKnowledge, isSupportedMedia } from './mediaProcessor.mjs';
import {
  getEmbeddingCandidates,
  getKnowledgeStats,
  ingestKnowledgeDocument,
  listKnowledgeDocuments,
  saveChunkEmbeddings,
  searchKnowledge,
} from './memoryStore.mjs';

function loadEnvFile(fileName) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const PORT = Number(process.env.SIF_KNOWLEDGE_PORT || 8788);
const HOST = process.env.SIF_GATEWAY_HOST || '127.0.0.1';
const MAX_BODY_BYTES = Number(process.env.SIF_KNOWLEDGE_MAX_BODY_BYTES || 160 * 1024 * 1024);
const MAX_MEDIA_BYTES = Number(process.env.SIF_MAX_MEDIA_BYTES || 100 * 1024 * 1024);
const FFMPEG_PATH = process.env.SIF_FFMPEG_PATH || 'ffmpeg';
const VIDEO_FRAME_INTERVAL_SECONDS = Math.max(1, Number(process.env.SIF_VIDEO_FRAME_INTERVAL_SECONDS || 15));
const VIDEO_MAX_FRAMES = Math.max(1, Number(process.env.SIF_VIDEO_MAX_FRAMES || 12));
const VISION_BASE_URL = String(process.env.SIF_VISION_BASE_URL || process.env.SIF_LOCAL_BASE_URL || '').replace(/\/+$/, '');
const VISION_MODEL = process.env.SIF_VISION_MODEL || '';
const VISION_API_KEY = process.env.SIF_VISION_API_KEY || process.env.SIF_LOCAL_API_KEY || '';
const EMBEDDING_BASE_URL = String(
  process.env.SIF_EMBEDDING_BASE_URL || process.env.SIF_LOCAL_BASE_URL || ''
).replace(/\/+$/, '');
const EMBEDDING_MODEL = process.env.SIF_EMBEDDING_MODEL || '';
const EMBEDDING_API_KEY = process.env.SIF_EMBEDDING_API_KEY || process.env.SIF_LOCAL_API_KEY || '';
const EMBEDDING_BATCH_SIZE = Math.max(1, Number(process.env.SIF_EMBEDDING_BATCH_SIZE || 16));

function embeddingEnabled() {
  return Boolean(EMBEDDING_BASE_URL && EMBEDDING_MODEL);
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function embedBatch(texts) {
  if (!embeddingEnabled()) throw new Error('Embedding service is not configured');
  if (!Array.isArray(texts) || !texts.length) return [];

  const headers = { 'Content-Type': 'application/json' };
  if (EMBEDDING_API_KEY) headers.Authorization = 'Bearer ' + EMBEDDING_API_KEY;

  const response = await fetch(EMBEDDING_BASE_URL + '/v1/embeddings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Embedding service error ' + response.status + ': ' + detail.slice(0, 500));
  }

  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .slice()
    .sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
    .map(row => row?.embedding)
    .filter(Array.isArray);
}

async function embedTexts(texts) {
  if (!embeddingEnabled()) return [];
  const output = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedBatch(batch);
    if (embeddings.length !== batch.length) {
      throw new Error('Embedding service returned an unexpected number of vectors');
    }
    output.push(...embeddings);
  }
  return output;
}

async function reindexMissingEmbeddings(limit = 64) {
  if (!embeddingEnabled()) {
    return { enabled: false, updated: 0, remaining: 0, model: null };
  }

  const candidates = await getEmbeddingCandidates(limit, EMBEDDING_MODEL);
  if (!candidates.length) {
    const stats = await getKnowledgeStats();
    return {
      enabled: true,
      updated: 0,
      remaining: Math.max(0, stats.chunks - stats.embeddedChunks),
      model: EMBEDDING_MODEL,
    };
  }

  const vectors = await embedTexts(candidates.map(item => item.content));
  const updated = await saveChunkEmbeddings(
    candidates.map((item, index) => ({ id: item.id, embedding: vectors[index] })),
    EMBEDDING_MODEL,
  );
  const stats = await getKnowledgeStats();
  return {
    enabled: true,
    updated,
    remaining: Math.max(0, stats.chunks - stats.embeddedChunks),
    model: EMBEDDING_MODEL,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, {
        ok: true,
        service: 'sif-knowledge',
        semanticMemory: {
          enabled: embeddingEnabled(),
          model: embeddingEnabled() ? EMBEDDING_MODEL : null,
        },
        mediaMemory: {
          stt: Boolean(process.env.SIF_STT_BASE_URL && process.env.SIF_STT_MODEL),
          vision: Boolean(VISION_BASE_URL && VISION_MODEL),
          ffmpeg: FFMPEG_PATH,
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/stats') {
      const stats = await getKnowledgeStats();
      return send(res, 200, {
        ...stats,
        semanticEnabled: embeddingEnabled(),
        embeddingModel: embeddingEnabled() ? EMBEDDING_MODEL : null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/documents') {
      return send(res, 200, { documents: await listKnowledgeDocuments() });
    }

    if (req.method === 'POST' && url.pathname === '/search') {
      const body = await readJson(req);
      const query = String(body.query || '');
      const limit = Number(body.limit || process.env.SIF_MEMORY_TOP_K || 6);
      let queryEmbedding;

      if (embeddingEnabled() && query.trim()) {
        try {
          queryEmbedding = (await embedTexts([query]))[0];
        } catch (error) {
          console.warn('[SIF Knowledge] semantic query failed, using lexical fallback:', error);
        }
      }

      const results = await searchKnowledge(query, limit, { queryEmbedding });
      return send(res, 200, {
        results,
        searchMode: queryEmbedding ? 'hybrid' : 'lexical',
        embeddingModel: queryEmbedding ? EMBEDDING_MODEL : null,
      });
    }

    if (req.method === 'POST' && url.pathname === '/embeddings/reindex') {
      const body = await readJson(req);
      const limit = Math.max(1, Number(body.limit || 64));
      return send(res, 200, await reindexMissingEmbeddings(limit));
    }

    if (req.method === 'POST' && url.pathname === '/ingest') {
      const body = await readJson(req);
      const name = String(body.name || 'document');
      const mimeType = String(body.mimeType || 'application/octet-stream');
      const media = isSupportedMedia(name, mimeType);

      if (!media && !isSupportedDocument(name, mimeType)) {
        return send(res, 415, { error: 'Этот тип файла пока не поддерживается: ' + name });
      }

      let text;
      let metadata = { sourceType: 'document' };

      if (media) {
        const result = await extractMediaKnowledge({
          name,
          mimeType,
          base64: body.base64 || '',
          maxBytes: MAX_MEDIA_BYTES,
          ffmpegPath: FFMPEG_PATH,
          stt: {
            baseUrl: process.env.SIF_STT_BASE_URL || '',
            model: process.env.SIF_STT_MODEL || '',
            apiKey: process.env.SIF_STT_API_KEY || '',
            language: process.env.SIF_STT_LANGUAGE || '',
          },
          vision: {
            baseUrl: VISION_BASE_URL,
            model: VISION_MODEL,
            apiKey: VISION_API_KEY,
          },
          frameIntervalSeconds: VIDEO_FRAME_INTERVAL_SECONDS,
          maxFrames: VIDEO_MAX_FRAMES,
        });
        text = result.text;
        metadata = { sourceType: 'media', ...result.metadata };
      } else {
        const maxBytes = Number(process.env.SIF_MAX_DOCUMENT_BYTES || 15 * 1024 * 1024);
        text = await extractDocumentText({
          name,
          mimeType,
          base64: body.base64 || '',
          maxBytes,
        });
      }

      const document = await ingestKnowledgeDocument({
        name,
        mimeType,
        size: Number(body.size || 0),
        text,
        metadata,
        embedder: embeddingEnabled() ? embedTexts : undefined,
        embeddingModel: embeddingEnabled() ? EMBEDDING_MODEL : undefined,
      });

      return send(res, 200, {
        document,
        media,
        semanticIndexed: Boolean(document.embeddedChunkCount),
        embeddingModel: document.embeddingModel || null,
      });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[SIF Knowledge]', error);
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    '[SIF Knowledge] http://' + HOST + ':' + PORT +
    (embeddingEnabled() ? ' · semantic=' + EMBEDDING_MODEL : ' · semantic=off')
  );
});
