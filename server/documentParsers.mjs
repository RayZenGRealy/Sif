import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

const TEXT_EXTENSIONS = new Set([
  'txt','md','json','csv','ts','tsx','js','jsx','py','html','css','xml','yaml','yml','log','sql'
]);

function extensionOf(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || '';
}

function decodeBase64(base64) {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(clean, 'base64');
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

function cellToText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && value.text != null) return String(value.text);
    if ('result' in value && value.result != null) return String(value.result);
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  }
  return String(value);
}

async function extractXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sections = [];
  workbook.eachSheet(sheet => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      const values = [];
      row.eachCell({ includeEmpty: false }, cell => values.push(cellToText(cell)));
      if (values.some(Boolean)) rows.push(values.join('\t'));
    });
    sections.push('# Лист: ' + sheet.name + '\n' + rows.join('\n'));
  });
  return sections.join('\n\n');
}

export function isSupportedDocument(name, mimeType = '') {
  const ext = extensionOf(name);
  return TEXT_EXTENSIONS.has(ext) || ext === 'pdf' || ext === 'docx' || ext === 'xlsx' ||
    mimeType.startsWith('text/') || mimeType === 'application/pdf';
}

export async function extractDocumentText({ name, mimeType = '', base64, maxBytes = 15 * 1024 * 1024 }) {
  const buffer = decodeBase64(base64);
  if (!buffer.length) throw new Error('Файл пустой');
  if (buffer.length > maxBytes) throw new Error('Файл слишком большой для текущего лимита');

  const ext = extensionOf(name);
  if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/')) return buffer.toString('utf8');
  if (ext === 'pdf' || mimeType === 'application/pdf') return extractPdf(buffer);
  if (ext === 'docx') return extractDocx(buffer);
  if (ext === 'xlsx') return extractXlsx(buffer);

  throw new Error('Тип файла пока не поддерживается для индексации: ' + (ext || mimeType || 'unknown'));
}
