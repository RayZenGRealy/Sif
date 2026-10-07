import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';

function extensionOf(name) {
  return extname(String(name || '')).toLowerCase().replace('.', '');
}

export function isSupportedMedia(name, mimeType = '') {
  const ext = extensionOf(name);
  return (
    String(mimeType).startsWith('audio/') ||
    String(mimeType).startsWith('video/') ||
    ['mp3','wav','m4a','aac','ogg','opus','flac','webm','mp4','mov','mkv','avi','m4v'].includes(ext)
  );
}

function isVideo(name, mimeType = '') {
  const ext = extensionOf(name);
  return String(mimeType).startsWith('video/') || ['mp4','mov','mkv','avi','m4v','webm'].includes(ext);
}

function decodeBase64(base64) {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(clean, 'base64');
}

function runCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(command + ' exited with code ' + code + ': ' + stderr.slice(-1200)));
    });
  });
}

function mimeForAudio(name, fallback = 'audio/wav') {
  const ext = extensionOf(name);
  const map = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
  };
  return map[ext] || fallback;
}

async function transcribeBuffer(buffer, {
  name,
  mimeType,
  baseUrl,
  model,
  apiKey,
  language,
}) {
  if (!baseUrl || !model) {
    throw new Error('Для Audio/Video Memory настрой SIF_STT_BASE_URL и SIF_STT_MODEL');
  }

  const headers = {};
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: mimeType || mimeForAudio(name) }),
    name || 'audio.wav',
  );
  form.append('model', model);
  if (language) form.append('language', language);

  const response = await fetch(baseUrl.replace(/\/+$/, '') + '/v1/audio/transcriptions', {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Local STT error ' + response.status + ': ' + detail.slice(0, 700));
  }

  const data = await response.json();
  return String(data?.text || '').trim();
}

async function describeFrame(buffer, {
  baseUrl,
  model,
  apiKey,
  frameNumber,
  seconds,
}) {
  if (!baseUrl || !model) return '';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

  const imageUrl = 'data:image/jpeg;base64,' + buffer.toString('base64');
  const response = await fetch(baseUrl.replace(/\/+$/, '') + '/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Кратко опиши этот кадр видео для долговременной памяти ИИ. ' +
              'Укажи людей, объекты, действия, текст на экране и важный контекст. ' +
              'Не выдумывай невидимое. Кадр #' + frameNumber + ', примерно ' + seconds + ' сек.',
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Vision error ' + response.status + ': ' + detail.slice(0, 700));
  }

  const data = await response.json();
  const value = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  return typeof value === 'string' ? value.trim() : JSON.stringify(value);
}

async function extractVideoAudio(inputPath, outputPath, ffmpegPath) {
  await runCommand(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    outputPath,
  ]);
}

async function extractVideoFrames(inputPath, frameDir, ffmpegPath, intervalSeconds, maxFrames) {
  const outputPattern = join(frameDir, 'frame-%03d.jpg');
  await runCommand(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-vf', 'fps=1/' + intervalSeconds + ',scale=960:-2',
    '-frames:v', String(maxFrames),
    '-q:v', '3',
    outputPattern,
  ]);

  const names = (await readdir(frameDir))
    .filter(name => /^frame-\d+\.jpg$/i.test(name))
    .sort();

  return names.map((name, index) => ({
    path: join(frameDir, name),
    frameNumber: index + 1,
    seconds: index * intervalSeconds,
  }));
}

export async function extractMediaKnowledge({
  name,
  mimeType,
  base64,
  maxBytes,
  ffmpegPath = 'ffmpeg',
  stt = {},
  vision = {},
  frameIntervalSeconds = 15,
  maxFrames = 12,
}) {
  const buffer = decodeBase64(base64);
  if (!buffer.length) throw new Error('Медиафайл пустой');
  if (buffer.length > maxBytes) throw new Error('Медиафайл слишком большой для текущего лимита');

  const video = isVideo(name, mimeType);
  if (!video) {
    const transcript = await transcribeBuffer(buffer, {
      name,
      mimeType,
      ...stt,
    });
    if (!transcript) throw new Error('STT не вернул текст из аудио');

    return {
      text: [
        '# Аудио: ' + name,
        '',
        '## Расшифровка',
        transcript,
      ].join('\n'),
      metadata: {
        mediaType: 'audio',
        transcriptCharacters: transcript.length,
        visionFrames: 0,
      },
    };
  }

  const workDir = await mkdtemp(join(tmpdir(), 'sif-media-'));
  try {
    const inputExt = extensionOf(name) || 'mp4';
    const inputPath = join(workDir, 'input.' + inputExt);
    const audioPath = join(workDir, 'audio.wav');
    await writeFile(inputPath, buffer);

    let transcript = '';
    try {
      await extractVideoAudio(inputPath, audioPath, ffmpegPath);
      const audioBuffer = await readFile(audioPath);
      transcript = await transcribeBuffer(audioBuffer, {
        name: 'audio.wav',
        mimeType: 'audio/wav',
        ...stt,
      });
    } catch (error) {
      console.warn('[SIF Media] audio track/STT failed:', error);
    }

    const frameDescriptions = [];
    if (vision.baseUrl && vision.model) {
      try {
        const frameDir = join(workDir, 'frames');
        await runCommand(process.execPath, [
          '-e',
          "require('fs').mkdirSync(process.argv[1],{recursive:true})",
          frameDir,
        ]);
        const frames = await extractVideoFrames(
          inputPath,
          frameDir,
          ffmpegPath,
          frameIntervalSeconds,
          maxFrames,
        );

        for (const frame of frames) {
          try {
            const frameBuffer = await readFile(frame.path);
            const description = await describeFrame(frameBuffer, {
              ...vision,
              frameNumber: frame.frameNumber,
              seconds: frame.seconds,
            });
            if (description) {
              frameDescriptions.push({
                seconds: frame.seconds,
                description,
              });
            }
          } catch (error) {
            console.warn('[SIF Media] frame vision failed:', error);
          }
        }
      } catch (error) {
        console.warn('[SIF Media] frame extraction failed:', error);
      }
    }

    if (!transcript && !frameDescriptions.length) {
      throw new Error(
        'Видео не удалось понять: нужен локальный STT и/или vision-модель, а для кадров требуется FFmpeg'
      );
    }

    const sections = ['# Видео: ' + name];
    if (transcript) {
      sections.push('', '## Речь / аудио', transcript);
    }
    if (frameDescriptions.length) {
      sections.push('', '## Визуальные события');
      for (const frame of frameDescriptions) {
        sections.push(
          '[' + Math.round(frame.seconds) + ' сек] ' + frame.description
        );
      }
    }

    return {
      text: sections.join('\n'),
      metadata: {
        mediaType: 'video',
        transcriptCharacters: transcript.length,
        visionFrames: frameDescriptions.length,
        frameIntervalSeconds,
      },
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
