import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
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

const PORT = Number(process.env.SIF_GATEWAY_PORT || 8787);
const HOST = process.env.SIF_GATEWAY_HOST || '127.0.0.1';
const CORS_ORIGIN = process.env.SIF_CORS_ORIGIN || 'http://localhost:3000';
const MAX_BODY_BYTES = Number(process.env.SIF_MAX_BODY_BYTES || 25 * 1024 * 1024);

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function send(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function providerList() {
  const geminiEnabled = Boolean(process.env.GEMINI_API_KEY);
  const localBaseUrl = process.env.SIF_LOCAL_BASE_URL || 'http://127.0.0.1:11434';
  const localModel = process.env.SIF_LOCAL_MODEL || '';
  return [
    {
      id: 'gemini',
      displayName: 'Gemini через SIF Gateway',
      kind: 'cloud',
      enabled: geminiEnabled,
      model: process.env.SIF_GEMINI_MODEL || 'gemini-3-flash-preview',
      reason: geminiEnabled ? undefined : 'GEMINI_API_KEY не задан',
    },
    {
      id: 'local',
      displayName: 'Локальная модель',
      kind: 'local',
      enabled: Boolean(localModel),
      model: localModel || undefined,
      baseUrl: localBaseUrl,
      reason: localModel ? undefined : 'SIF_LOCAL_MODEL не задан',
    },
  ];
}

function normalizeImagePart(imageBase64) {
  if (!imageBase64) return null;
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  return {
    mimeType: match?.[1] || 'image/jpeg',
    data: match?.[2] || imageBase64,
  };
}

async function runGemini(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on SIF Gateway');
  const ai = new GoogleGenAI({ apiKey });
  const model = request.preferredModel || process.env.SIF_GEMINI_MODEL || 'gemini-3-flash-preview';
  const parts = [{ text: request.userText || '' }];
  const image = normalizeImagePart(request.imageBase64);
  if (image) parts.unshift({ inlineData: image });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction: request.systemInstruction,
      tools: request.enableWebSearch ? [{ googleSearch: {} }] : undefined,
    },
  });

  const sources = response?.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.filter(chunk => chunk?.web?.uri)
    .map(chunk => ({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri })) || [];

  return {
    text: response.text || '',
    sources,
    providerId: 'gemini',
    model,
  };
}

async function transcribeAudio(base64, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on SIF Gateway');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.SIF_TRANSCRIBE_MODEL || 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: 'Transcribe exactly.' },
      ],
    },
  });
  return response.text || '';
}

async function generateSpeech(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on SIF Gateway');
  const ai = new GoogleGenAI({ apiKey });
  const clean = String(text || '')
    .replace(/<<.*?>>/g, '')
    .replace(/\[\[.*?\]\]/g, '')
    .replace(/\{.*?\}/g, '');
  const response = await ai.models.generateContent({
    model: process.env.SIF_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: clean }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.SIF_TTS_VOICE || 'Kore' } },
      },
    },
  });
  return response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
}

async function runLocal(request) {
  const baseUrl = (process.env.SIF_LOCAL_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = request.preferredModel || process.env.SIF_LOCAL_MODEL;
  if (!model) throw new Error('SIF_LOCAL_MODEL is not configured on SIF Gateway');

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.SIF_LOCAL_API_KEY) {
    headers.Authorization = 'Bearer ' + process.env.SIF_LOCAL_API_KEY;
  }

  const userContent = [{ type: 'text', text: request.userText || '' }];
  if (request.imageBase64) {
    userContent.push({ type: 'image_url', image_url: { url: request.imageBase64 } });
  }

  const messages = [];
  if (request.systemInstruction) messages.push({ role: 'system', content: request.systemInstruction });
  messages.push({ role: 'user', content: request.imageBase64 ? userContent : (request.userText || '') });

  const upstream = await fetch(baseUrl + '/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    throw new Error('Local model error ' + upstream.status + ': ' + detail.slice(0, 500));
  }

  const data = await upstream.json();
  const text = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  return {
    text: typeof text === 'string' ? text : JSON.stringify(text),
    sources: [],
    providerId: 'local',
    model,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, jsonHeaders);
      return res.end();
    }

    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, service: 'sif-gateway' });
    }

    if (req.method === 'GET' && url.pathname === '/api/providers') {
      return send(res, 200, { providers: providerList() });
    }

    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const body = await readJson(req);
      const text = await transcribeAudio(body.base64 || '', body.mimeType || 'audio/webm');
      return send(res, 200, { text });
    }

    if (req.method === 'POST' && url.pathname === '/api/speech') {
      const body = await readJson(req);
      const audioBase64 = await generateSpeech(body.text || '');
      return send(res, 200, { audioBase64 });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readJson(req);
      const providerId = body.providerId || 'gemini';
      const request = body.request || {};
      const result = providerId === 'local'
        ? await runLocal(request)
        : providerId === 'gemini'
          ? await runGemini(request)
          : null;

      if (!result) return send(res, 400, { error: 'Unknown provider: ' + providerId });
      return send(res, 200, result);
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[SIF Gateway]', error);
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[SIF Gateway] http://${HOST}:${PORT}`);
});
