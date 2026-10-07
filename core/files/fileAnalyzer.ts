export type FileKind = 'text' | 'image' | 'audio' | 'video' | 'binary';

export interface FileAnalysis {
  name: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  text?: string;
  dataUrl?: string;
  note?: string;
}

const TEXT_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'py', 'html', 'css', 'xml', 'yaml', 'yml'];

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function kindOf(file: File): FileKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('text/') || TEXT_EXTENSIONS.includes(extensionOf(file.name))) return 'text';
  return 'binary';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const kind = kindOf(file);
  const base: FileAnalysis = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind,
  };

  if (kind === 'text') {
    return { ...base, text: await file.text() };
  }

  if (kind === 'image') {
    return { ...base, dataUrl: await readAsDataUrl(file) };
  }

  if (kind === 'audio' || kind === 'video') {
    return {
      ...base,
      note: 'Media detected. The core can route this file to a provider with audio/video capability.',
    };
  }

  return {
    ...base,
    note: 'Binary file detected. Add a parser/connector for this MIME type before semantic analysis.',
  };
}
