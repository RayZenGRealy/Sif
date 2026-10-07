import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractDocumentText, isSupportedDocument } from './documentParsers.mjs';
import { getKnowledgeStats, ingestKnowledgeDocument, listKnowledgeDocuments, searchKnowledge } from './memoryStore.mjs';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const PORT = Number(process.env.SIF_KNOWLEDGE_PORT || 8788);
const HOST = process.env.SIF_GATEWAY_HOST || '127.0.0.1';
const MAX_BODY_BYTES = Number(process.env.SIF_MAX_BODY_BYTES || 25 * 1024 * 1024);

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'sif-knowledge' });
    if (req.method === 'GET' && url.pathname === '/stats') return send(res, 200, await getKnowledgeStats());
    if (req.method === 'GET' && url.pathname === '/documents') return send(res, 200, { documents: await listKnowledgeDocuments() });
    if (req.method === 'POST' && url.pathname === '/search') {
      const body = await readJson(req);
      const limit = Number(body.limit || process.env.SIF_MEMORY_TOP_K || 6);
      return send(res, 200, { results: await searchKnowledge(String(body.query || ''), limit) });
    }
    if (req.method === 'POST' && url.pathname === '/ingest') {
      const body = await readJson(req);
      const name = String(body.name || 'document');
      const mimeType = String(body.mimeType || 'application/octet-stream');
      if (!isSupportedDocument(name, mimeType)) return send(res, 415, { error: 'Этот тип документа пока не поддерживается: ' + name });
      const maxBytes = Number(process.env.SIF_MAX_DOCUMENT_BYTES || 15 * 1024 * 1024);
      const text = await extractDocumentText({ name, mimeType, base64: body.base64 || '', maxBytes });
      const document = await ingestKnowledgeDocument({ name, mimeType, size: Number(body.size || 0), text });
      return send(res, 200, { document });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[SIF Knowledge]', error);
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => console.log(`[SIF Knowledge] http://${HOST}:${PORT}`));
