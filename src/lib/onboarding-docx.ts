import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { OnboardingRecord } from '@/types/onboarding';

const TEMPLATE_PATH = path.join(process.cwd(), 'src', 'templates', 'onboarding-template.docx');
const CONFIDENTIALITY_TEMPLATE_PATH = path.join(process.cwd(), 'src', 'templates', 'confidentiality-agreement-template.docx');
const SIGNATURE_REL_ID = 'rId7';
const CONFIDENTIALITY_STYLE_PREFIX = 'confidentiality-';
const CONFIDENTIALITY_NUMBERING_OFFSET = 200;

interface ZipEntry {
  path: string;
  content: Buffer;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function formatDate(value?: string | null): string {
  const raw = text(value);
  if (!raw) return '';

  const localDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}:\d{2})?$/);
  if (localDate) {
    return `${localDate[1]}-${localDate[2].padStart(2, '0')}-${localDate[3].padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsed);
    const getPart = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  }

  return raw.slice(0, 10);
}

function formatChineseDate(value?: string | null): string {
  const normalized = formatDate(value);
  if (!normalized) return '____年__月__日';
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return normalized;
  return `${year}年${month.padStart(2, '0')}月${day.padStart(2, '0')}日`;
}

function checkbox(checked: boolean): string {
  return checked ? '☑' : '□';
}

function optionLine(options: string[], selected: string): string {
  return options.map((option) => `${checkbox(selected === option)} ${option}`).join('   ');
}

function money(value?: string | null): string {
  const amount = text(value);
  if (!amount) return '';
  return amount.includes('元') ? amount : `${amount} 元/月`;
}

function createZip(files: Array<{ path: string; content: Buffer | string }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);

    offset += local.length + name.length + content.length;
  }

  const centralOffset = offset;
  const centralContent = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralContent.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralContent, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error('Invalid DOCX template: EOCD not found');
}

function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('Invalid DOCX template: central directory is corrupted');
    }

    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const fileNameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const fileName = buffer.subarray(pointer + 46, pointer + 46 + fileNameLength).toString('utf8');

    const localFileNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);

    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported DOCX compression method: ${method}`);
    }

    entries.push({ path: fileName, content });
    pointer += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntry(entries: ZipEntry[], filePath: string): string {
  const entry = entries.find((item) => item.path === filePath);
  if (!entry) throw new Error(`DOCX template is missing ${filePath}`);
  return entry.content.toString('utf8');
}

function writeEntry(entries: ZipEntry[], filePath: string, content: Buffer | string) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const entry = entries.find((item) => item.path === filePath);
  if (entry) {
    entry.content = buffer;
  } else {
    entries.push({ path: filePath, content: buffer });
  }
}

function cleanParagraphProperties(value: string): string {
  return value.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '');
}

function runXml(value: string, rPr: string): string {
  const parts = value.split('\n');
  const content = parts.map((part, index) => {
    const breakXml = index > 0 ? '<w:br/>' : '';
    return `${breakXml}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`;
  }).join('');
  return `<w:r>${rPr}${content}</w:r>`;
}

function paragraphXml(value: string, pPr: string, rPr: string): string {
  return `<w:p>${cleanParagraphProperties(pPr)}${runXml(value || ' ', rPr)}</w:p>`;
}

function replacementParagraph(originalParagraph: string, value: string): string {
  const start = originalParagraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = originalParagraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
  const rPr = originalParagraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || defaultRunProperties();
  return `${start}${paragraphXml(value, pPr, rPr).replace(/^<w:p>|<\/w:p>$/g, '')}</w:p>`;
}

function defaultRunProperties(): string {
  return '<w:rPr><w:rFonts w:hint="eastAsia" w:ascii="宋体" w:hAnsi="宋体"/><w:color w:val="000000"/><w:szCs w:val="21"/></w:rPr>';
}

function withFontSize(rPr: string, halfPoints: number): string {
  let next = rPr;
  if (next.includes('<w:sz ')) {
    next = next.replace(/<w:sz w:val="[^"]+"\/>/g, `<w:sz w:val="${halfPoints}"/>`);
  } else {
    next = next.replace('</w:rPr>', `<w:sz w:val="${halfPoints}"/></w:rPr>`);
  }

  if (next.includes('<w:szCs ')) {
    next = next.replace(/<w:szCs w:val="[^"]+"\/>/g, `<w:szCs w:val="${halfPoints}"/>`);
  } else {
    next = next.replace('</w:rPr>', `<w:szCs w:val="${halfPoints}"/></w:rPr>`);
  }

  return next;
}

function setCellText(cellXml: string, value: string): string {
  const start = cellXml.match(/^<w:tc\b[^>]*>/)?.[0] || '<w:tc>';
  const tcPr = cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
  const firstParagraph = cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/)?.[0] || '';
  const pPr = firstParagraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
  const rPr = withFontSize(firstParagraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || defaultRunProperties(), 20);
  return `${start}${tcPr}${paragraphXml(value, pPr, rPr)}</w:tc>`;
}

function replaceNthMatch(input: string, regex: RegExp, index: number, replacement: string): string {
  let current = -1;
  return input.replace(regex, (match) => {
    current += 1;
    return current === index ? replacement : match;
  });
}

function replaceTableCell(documentXml: string, rowIndex: number, cellIndex: number, value: string): string {
  const tableStart = documentXml.indexOf('<w:tbl>');
  const tableEnd = documentXml.indexOf('</w:tbl>', tableStart);
  if (tableStart < 0 || tableEnd < 0) throw new Error('DOCX template table not found');

  const before = documentXml.slice(0, tableStart);
  const table = documentXml.slice(tableStart, tableEnd + '</w:tbl>'.length);
  const after = documentXml.slice(tableEnd + '</w:tbl>'.length);
  const rows = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  const row = rows[rowIndex];
  if (!row) throw new Error(`DOCX template row ${rowIndex} not found`);

  const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
  const cell = cells[cellIndex];
  if (!cell) throw new Error(`DOCX template cell ${rowIndex}:${cellIndex} not found`);

  const newCell = setCellText(cell, value);
  const newRow = replaceNthMatch(row, /<w:tc\b[\s\S]*?<\/w:tc>/g, cellIndex, newCell);
  const newTable = replaceNthMatch(table, /<w:tr\b[\s\S]*?<\/w:tr>/g, rowIndex, newRow);
  return `${before}${newTable}${after}`;
}

function replaceParagraphContaining(documentXml: string, needles: string[], value: string): string {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const hasAllNeedles = needles.every((needle) => paragraph.includes(needle));
    return hasAllNeedles ? replacementParagraph(paragraph, value) : paragraph;
  });
}

function removeParagraphContaining(documentXml: string, needles: string[]): string {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const hasAllNeedles = needles.every((needle) => paragraph.includes(needle));
    return hasAllNeedles ? '' : paragraph;
  });
}

function addPageBreakBeforeParagraphContaining(documentXml: string, needles: string[]): string {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const hasAllNeedles = needles.every((needle) => paragraph.includes(needle));
    if (!hasAllNeedles || paragraph.includes('<w:pageBreakBefore')) return paragraph;

    if (paragraph.includes('<w:pPr>')) {
      return paragraph.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore/>');
    }

    const start = paragraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
    return paragraph.replace(start, `${start}<w:pPr><w:pageBreakBefore/></w:pPr>`);
  });
}

function compactPromiseParagraphs(documentXml: string): string {
  let inPromise = false;

  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (paragraph.includes('入 职 承 诺')) {
      inPromise = true;
      return paragraph;
    }

    if (!inPromise || paragraph.includes('签  名：') || paragraph.includes('签 名：')) {
      return paragraph;
    }

    let next = paragraph
      .replace(/<w:spacing\b[^>]*\/>/g, '<w:spacing w:line="360" w:lineRule="atLeast"/>')
      .replace(/<w:sz w:val="[^"]+"\/>/g, '<w:sz w:val="22"/>')
      .replace(/<w:szCs w:val="[^"]+"\/>/g, '<w:szCs w:val="22"/>');

    if (!next.includes('<w:spacing ')) {
      next = next.replace('</w:pPr>', '<w:spacing w:line="360" w:lineRule="atLeast"/></w:pPr>');
    }

    return next;
  });
}

function signatureDrawingXml(relId: string): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="900000" cy="320000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1001" name="employee-signature"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1001" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="320000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function replaceSignatureParagraph(
  documentXml: string,
  signatureRelId: string | null,
  fallbackName: string,
  signatureDate: string,
): string {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!paragraph.includes('签  名：')) return paragraph;

    const start = paragraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
    const originalRPr = paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || defaultRunProperties();
    const rPr = withFontSize(originalRPr, 22);
    const signaturePPr = '<w:pPr><w:spacing w:before="1700" w:line="360" w:lineRule="atLeast"/><w:jc w:val="right"/></w:pPr>';
    const datePPr = '<w:pPr><w:spacing w:line="360" w:lineRule="atLeast"/><w:jc w:val="right"/></w:pPr>';
    const labelRun = runXml('签 名： ', rPr);
    const valueRun = signatureRelId
      ? `<w:r>${signatureDrawingXml(signatureRelId)}</w:r>`
      : runXml(fallbackName, rPr);
    const dateRun = runXml(`日 期：${signatureDate}`, rPr);

    return `${start}${signaturePPr}${labelRun}${valueRun}</w:p><w:p>${datePPr}${dateRun}</w:p>`;
  });
}

function ensureDrawingNamespaces(documentXml: string): string {
  let next = documentXml;
  if (!next.includes('xmlns:wp=')) {
    next = next.replace('<w:document ', '<w:document xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ');
  }
  if (!next.includes('xmlns:r=')) {
    next = next.replace('<w:document ', '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  }
  return next;
}

function addSignatureRelationship(entries: ZipEntry[]) {
  const relsPath = 'word/_rels/document.xml.rels';
  const relsXml = readEntry(entries, relsPath);
  if (relsXml.includes(`Id="${SIGNATURE_REL_ID}"`)) return;

  const relationship = `<Relationship Id="${SIGNATURE_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.png"/>`;
  writeEntry(entries, relsPath, relsXml.replace('</Relationships>', `${relationship}</Relationships>`));
}

function addPngContentType(entries: ZipEntry[]) {
  const contentTypesPath = '[Content_Types].xml';
  const contentTypesXml = readEntry(entries, contentTypesPath);
  if (contentTypesXml.includes('Extension="png"')) return;
  const pngType = '<Default Extension="png" ContentType="image/png"/>';
  writeEntry(entries, contentTypesPath, contentTypesXml.replace('</Types>', `${pngType}</Types>`));
}

function getSignatureImage(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

function renameConfidentialityStyles(xml: string): string {
  return xml
    .replace(/w:styleId="([^"]+)"/g, (_match, id: string) => `w:styleId="${CONFIDENTIALITY_STYLE_PREFIX}${id}"`)
    .replace(/<(w:(?:pStyle|rStyle|basedOn|next|link)) w:val="([^"]+)"/g, (_match, tag: string, id: string) => `<${tag} w:val="${CONFIDENTIALITY_STYLE_PREFIX}${id}"`);
}

function renameConfidentialityNumbering(xml: string): string {
  return xml
    .replace(/w:abstractNumId="(\d+)"/g, (_match, id: string) => `w:abstractNumId="${Number(id) + CONFIDENTIALITY_NUMBERING_OFFSET}"`)
    .replace(/<w:abstractNumId w:val="(\d+)"/g, (_match, id: string) => `<w:abstractNumId w:val="${Number(id) + CONFIDENTIALITY_NUMBERING_OFFSET}"`)
    .replace(/w:numId="(\d+)"/g, (_match, id: string) => `w:numId="${Number(id) + CONFIDENTIALITY_NUMBERING_OFFSET}"`)
    .replace(/<w:numId w:val="(\d+)"/g, (_match, id: string) => `<w:numId w:val="${Number(id) + CONFIDENTIALITY_NUMBERING_OFFSET}"`);
}

function importConfidentialityStyles(entries: ZipEntry[], sourceEntries: ZipEntry[]) {
  const stylesPath = 'word/styles.xml';
  const sourceStyles = renameConfidentialityStyles(readEntry(sourceEntries, stylesPath));
  const importedStyles = (sourceStyles.match(/<w:style\b[\s\S]*?<\/w:style>/g) || [])
    .map((style) => style.replace(/ w:default="1"/g, ''))
    .join('');
  if (!importedStyles) return;

  const styles = readEntry(entries, stylesPath);
  writeEntry(entries, stylesPath, styles.replace('</w:styles>', `${importedStyles}</w:styles>`));
}

function importConfidentialityNumbering(entries: ZipEntry[], sourceEntries: ZipEntry[]) {
  const numberingPath = 'word/numbering.xml';
  const sourceNumbering = renameConfidentialityNumbering(readEntry(sourceEntries, numberingPath));
  const abstractNumbers = (sourceNumbering.match(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g) || []).join('');
  const numbers = (sourceNumbering.match(/<w:num\b[\s\S]*?<\/w:num>/g) || []).join('');
  if (!abstractNumbers && !numbers) return;

  const numbering = readEntry(entries, numberingPath);
  writeEntry(entries, numberingPath, numbering.replace('</w:numbering>', `${abstractNumbers}${numbers}</w:numbering>`));
}

function confidentialitySignatureDrawingXml(relId: string): string {
  return signatureDrawingXml(relId)
    .replaceAll('1001', '2001')
    .replaceAll('cx="900000" cy="320000"', 'cx="760000" cy="210000"')
    .replace(
      /<wp:inline[^>]*>/,
      '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="line"><wp:posOffset>-90000</wp:posOffset></wp:positionV>',
    )
    .replace('</wp:inline>', '<wp:wrapNone/></wp:anchor>')
    .replace('name="employee-signature"', 'name="confidentiality-signature"')
    .replace('name="signature.png"', 'name="confidentiality-signature.png"');
}

function confidentialityParticipantParagraph(paragraph: string, record: OnboardingRecord): string {
  const start = paragraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
  const originalRPr = paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || defaultRunProperties();
  const plainRPr = originalRPr.replace(/<w:u\b[^>]*\/>/g, '<w:u w:val="none"/>');
  const underlinedRPr = plainRPr.replace('</w:rPr>', '<w:u w:val="single"/></w:rPr>');
  return `${start}${pPr}${runXml('乙方：', plainRPr)}${runXml(` ${record.name || ''} `, underlinedRPr)}${runXml('，    身份证号码：', plainRPr)}${runXml(` ${record.data.idCard || ''} `, underlinedRPr)}</w:p>`;
}

function confidentialitySigningParagraph(paragraph: string, record: OnboardingRecord, signatureRelId: string | null): string {
  const start = paragraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = (paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '')
    .replace(/w:before="100"/g, 'w:before="0"')
    .replace(/w:after="100"/g, 'w:after="0"');
  const originalRPr = paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || defaultRunProperties();
  const rPr = withFontSize(originalRPr, 24);
  const signature = signatureRelId
    ? `<w:r>${confidentialitySignatureDrawingXml(signatureRelId)}</w:r>`
    : runXml(record.name || '________________', rPr);
  return `${start}${pPr}${runXml('甲方（盖章）：                     乙方：', rPr)}${signature}</w:p>`;
}

function confidentialityDateParagraph(paragraph: string, signatureDate: string): string {
  const start = paragraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = (paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '')
    .replace(/w:before="100"/g, 'w:before="0"')
    .replace(/w:after="100"/g, 'w:after="0"');
  const rPr = paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || defaultRunProperties();
  return `${start}${pPr}${runXml(`年  月  日                         ${signatureDate}`, rPr)}</w:p>`;
}

function buildConfidentialitySection(sourceEntries: ZipEntry[], record: OnboardingRecord, signatureRelId: string | null): { body: string; sectPr: string } {
  let sourceDocument = renameConfidentialityStyles(readEntry(sourceEntries, 'word/document.xml'));
  sourceDocument = renameConfidentialityNumbering(sourceDocument);
  const bodyMatch = sourceDocument.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) throw new Error('Confidentiality template body not found');
  const sectPr = bodyMatch[1].match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0];
  if (!sectPr) throw new Error('Confidentiality template section settings not found');

  let body = bodyMatch[1].replace(sectPr, '');
  body = body.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (paragraph.includes('乙方：') && paragraph.includes('身份证号码：')) {
      return confidentialityParticipantParagraph(paragraph, record);
    }
    if (paragraph.includes('甲方') && paragraph.includes('盖章') && paragraph.includes('乙方')) {
      return confidentialitySigningParagraph(paragraph, record, signatureRelId);
    }
    const visibleText = (paragraph.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) || [])
      .join('')
      .replace(/<[^>]+>/g, '');
    if (/^年\s*月\s*日/.test(visibleText)) {
      return confidentialityDateParagraph(paragraph, formatChineseDate(record.data.signatureDate));
    }
    return paragraph;
  });
  // Filling the previously blank identity/signature slots adds a small amount
  // of vertical layout pressure. Compact only the source's 5 pt paragraph
  // before/after spacing by 1 pt so the retained A4 agreement stays one page.
  body = body
    .replace(/w:before="100"/g, 'w:before="80"')
    .replace(/w:after="100"/g, 'w:after="80"');
  return { body, sectPr };
}

function appendConfidentialityAgreement(documentXml: string, entries: ZipEntry[], record: OnboardingRecord, signatureRelId: string | null): string {
  const sourceEntries = readZip(fs.readFileSync(CONFIDENTIALITY_TEMPLATE_PATH));
  importConfidentialityStyles(entries, sourceEntries);
  importConfidentialityNumbering(entries, sourceEntries);
  const confidentiality = buildConfidentialitySection(sourceEntries, record, signatureRelId);
  const existingSectPrMatches = documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) || [];
  const existingSectPr = existingSectPrMatches.at(-1);
  if (!existingSectPr) throw new Error('Onboarding template section settings not found');
  const nextPageSectPr = existingSectPr.includes('<w:type ')
    ? existingSectPr.replace(/<w:type\b[^>]*\/>/, '<w:type w:val="nextPage"/>')
    : existingSectPr.replace(/<w:sectPr\b([^>]*)>/, '<w:sectPr$1><w:type w:val="nextPage"/>');
  const sectionBreak = `<w:p><w:pPr>${nextPageSectPr}</w:pPr></w:p>`;
  return documentXml.replace(`${existingSectPr}</w:body>`, `${sectionBreak}${confidentiality.body}${confidentiality.sectPr}</w:body>`);
}

function recruitmentSourceText(record: OnboardingRecord): string {
  const selected = new Set(record.data.recruitmentSource || []);
  const otherText = text(record.data.otherRecruitmentSource);
  const hasOther = selected.has('其他') || Boolean(otherText);
  return [
    `${checkbox(selected.has('网络'))}网络`,
    `${checkbox(selected.has('人才市场'))}人才市场`,
    `${checkbox(selected.has('内部推荐'))}内部推荐`,
    `${checkbox(hasOther)}其他${otherText ? `：${otherText}` : '___________________'}`,
  ].join('  ');
}

function healthText(record: OnboardingRecord): string {
  const data = record.data;
  return [
    `利手：${checkbox(data.dominantHand === '右')}右  ${checkbox(data.dominantHand === '左')}左`,
    `是否有重大疾病或家族病史：${checkbox(data.majorDisease === '无')}无  ${checkbox(data.majorDisease === '有')}有：${data.majorDiseaseNote || ''}`,
    `是否曾被认定工伤或持有残疾人证明：${checkbox(data.disabilityProof === '无')}无  ${checkbox(data.disabilityProof === '有')}有：${data.disabilityProofNote || ''}`,
    `是否从事过特别繁重体力劳动及有毒有害工种：${checkbox(data.heavyWork === '无')}无  ${checkbox(data.heavyWork === '有')}有：${data.heavyWorkNote || ''}`,
    `是否有职业病或慢性影响工作的疾病或怀孕：${checkbox(data.occupationalDisease === '无')}无  ${checkbox(data.occupationalDisease === '有')}有：${data.occupationalDiseaseNote || ''}`,
  ].join('            ');
}

function noticeText(record: OnboardingRecord): string {
  const data = record.data;
  return [
    `1、本人入厂日期为：${formatChineseDate(data.hireDate)}`,
    `2、劳动合同期限：${data.contractTerm || ''}`,
    `3、劳动合同签订后，自签订日期起，试用期为 ${data.probationMonths || ''} 个月，试用期工资为 ${money(data.probationSalary)}`,
    `4、入职岗位：${data.position || ''}，使用机器约定：${data.machineAgreement || ''}`,
    `5、本人的工资计算方式为 ${data.wageMethod || ''}`,
    '6、辞工必须递交书面辞工书，经领导审批后一个月之后方可离开工作岗位！',
    '7、认真做好本职工作，服从主管的安排！',
  ].join('\n');
}

function hrOpinionText(record: OnboardingRecord): string {
  return [
    record.hrOpinion || '同意入职。',
    `审核人：${record.reviewerName || ''}`,
  ].join('  ');
}

function fillTemplate(documentXml: string, record: OnboardingRecord): string {
  const data = record.data;
  const contact = data.emergencyContacts[0] || { name: '', relation: '', address: '', phone: '' };
  const fields: Array<[number, number, string]> = [
    [0, 1, recruitmentSourceText(record)],
    [1, 2, data.name],
    [1, 4, data.gender],
    [1, 6, data.ethnicity],
    [2, 2, data.nativePlace],
    [2, 4, data.education],
    [2, 6, data.politicalStatus],
    [3, 2, optionLine(['已婚有子女', '已婚无子女', '未婚', '其他'], data.maritalStatus)],
    [4, 2, data.idCard],
    [4, 4, data.phone],
    [5, 2, data.wechat],
    [5, 4, data.email],
    [8, 1, contact.name],
    [8, 2, contact.relation],
    [8, 3, contact.address],
    [8, 4, contact.phone],
    [9, 1, healthText(record)],
    [10, 1, noticeText(record)],
    [11, 3, hrOpinionText(record)],
  ];

  let nextXml = replaceParagraphContaining(
    documentXml,
    ['岗位：', '填表日期：'],
    `岗位：${data.position || ''}                         填表日期：${formatChineseDate(data.fillDate)}`,
  );

  for (const [row, cell, value] of fields) {
    nextXml = replaceTableCell(nextXml, row, cell, value);
  }

  nextXml = removeParagraphContaining(nextXml, ['日 期：']);
  nextXml = addPageBreakBeforeParagraphContaining(nextXml, ['入 职 承 诺']);
  return nextXml;
}

export function buildOnboardingDocx(record: OnboardingRecord): Buffer {
  const template = fs.readFileSync(TEMPLATE_PATH);
  const entries = readZip(template);
  const signature = getSignatureImage(record.data.signatureDataUrl || '');
  let documentXml = readEntry(entries, 'word/document.xml');

  documentXml = fillTemplate(documentXml, record);
  documentXml = compactPromiseParagraphs(documentXml);
  documentXml = replaceSignatureParagraph(
    documentXml,
    signature ? SIGNATURE_REL_ID : null,
    record.name,
    formatChineseDate(record.data.signatureDate),
  );
  documentXml = appendConfidentialityAgreement(
    documentXml,
    entries,
    record,
    signature ? SIGNATURE_REL_ID : null,
  );

  if (signature) {
    documentXml = ensureDrawingNamespaces(documentXml);
    writeEntry(entries, 'word/media/signature.png', signature);
    addSignatureRelationship(entries);
    addPngContentType(entries);
  }

  writeEntry(entries, 'word/document.xml', documentXml);

  return createZip(entries.map((entry) => ({ path: entry.path, content: entry.content })));
}
