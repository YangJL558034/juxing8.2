import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { ResignationRecord, ResignationType } from '@/types/resignation';

const TEMPLATE_PATH = path.join(process.cwd(), 'src', 'templates', 'resignation-application-template.docx');
const SIGNATURE_REL_ID = 'rIdResignationApplicantSignature';

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

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: Array<{ path: string; content: Buffer | string }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

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
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error('Invalid DOCX template');
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
    if (method !== 0 && method !== 8) throw new Error(`Unsupported DOCX compression method: ${method}`);
    entries.push({ path: fileName, content: method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed) });
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
  const entry = entries.find((item) => item.path === filePath);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (entry) entry.content = buffer;
  else entries.push({ path: filePath, content: buffer });
}

function runXml(value: string, rPr: string): string {
  return value.split('\n').map((line, index) => {
    const prefix = index > 0 ? '<w:br/>' : '';
    return `<w:r>${rPr}${prefix}<w:t xml:space="preserve">${escapeXml(line || ' ')}</w:t></w:r>`;
  }).join('');
}

function paragraphWithRuns(originalParagraph: string, runs: string): string {
  const start = originalParagraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = originalParagraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
  return `${start}${pPr}${runs}</w:p>`;
}

function paragraphText(originalParagraph: string, value: string): string {
  const rPr = originalParagraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '<w:rPr><w:rFonts w:hint="eastAsia"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  return paragraphWithRuns(originalParagraph, runXml(value, rPr));
}

function replaceNthMatch(input: string, regex: RegExp, index: number, replacement: string): string {
  let current = -1;
  return input.replace(regex, (match) => {
    current += 1;
    return current === index ? replacement : match;
  });
}

function replaceGlobalRowCell(documentXml: string, rowIndex: number, cellIndex: number, replacer: (cellXml: string) => string): string {
  const rows = documentXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  const row = rows[rowIndex];
  if (!row) throw new Error(`DOCX template row ${rowIndex} not found`);
  const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
  const cell = cells[cellIndex];
  if (!cell) throw new Error(`DOCX template cell ${rowIndex}:${cellIndex} not found`);
  const nextCell = replacer(cell);
  const nextRow = replaceNthMatch(row, /<w:tc\b[\s\S]*?<\/w:tc>/g, cellIndex, nextCell);
  return replaceNthMatch(documentXml, /<w:tr\b[\s\S]*?<\/w:tr>/g, rowIndex, nextRow);
}

function setCellParagraph(cellXml: string, paragraphIndex: number, value: string): string {
  const paragraphs = cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph) return cellXml;
  return replaceNthMatch(cellXml, /<w:p\b[\s\S]*?<\/w:p>/g, paragraphIndex, paragraphText(paragraph, value));
}

function setCellFirstParagraph(cellXml: string, value: string): string {
  return setCellParagraph(cellXml, 0, value);
}

function formatChineseDate(value?: string | null): string {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}年 ${Number(match[2])}月 ${Number(match[3])}日`;
}

function signatureDrawingXml(relId: string): string {
  return `<w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>260000</wp:posOffset></wp:positionH><wp:positionV relativeFrom="line"><wp:posOffset>-85000</wp:posOffset></wp:positionV><wp:extent cx="760000" cy="210000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="3001" name="resignation-signature"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="3001" name="resignation-signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="760000" cy="210000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>`;
}

function typeText(option: ResignationType, selected: ResignationType, other: string): string {
  const checked = selected === option ? '√' : ' ';
  if (option === '急辞') {
    return `急辞（自愿扣除20%工资）（${checked}）`;
  }
  if (option === '其他' && selected === '其他' && other) {
    return `其他（${other}）（${checked}）`;
  }
  return `${option}（${checked}）`;
}

function fillTemplate(documentXml: string, record: ResignationRecord, signatureRelId: string | null): string {
  const data = record.data;
  let nextXml = documentXml;

  const simpleFields: Array<[number, number, string]> = [
    [0, 1, data.name || record.name],
    [0, 3, data.employeeNo || record.employeeNo],
    [0, 5, data.department || record.department],
    [1, 1, data.idCard || record.idCard],
    [2, 1, formatChineseDate(data.hireDate || record.hireDate)],
    [2, 3, formatChineseDate(data.contractEndDate || record.contractEndDate)],
    [2, 5, data.position || record.position],
    [3, 1, formatChineseDate(data.applyDate || record.applyDate)],
    [3, 3, formatChineseDate(data.resignationDate || record.resignationDate)],
    [9, 1, data.name || record.name],
    [9, 3, formatChineseDate(data.resignationDate || record.resignationDate)],
    [9, 5, formatChineseDate(data.handoverDate || record.handoverDate)],
  ];

  for (const [row, cell, value] of simpleFields) {
    nextXml = replaceGlobalRowCell(nextXml, row, cell, (cellXml) => setCellFirstParagraph(cellXml, value));
  }

  const selectedType = data.resignationType || record.resignationType || '';
  const typeOptions: ResignationType[] = ['辞职', '辞退', '自离', '开除', selectedType === '其他' ? '其他' : '急辞'];
  typeOptions.forEach((type, index) => {
    nextXml = replaceGlobalRowCell(nextXml, 4, index + 1, (cellXml) => setCellFirstParagraph(cellXml, typeText(type, selectedType, data.resignationTypeOther)));
  });

  nextXml = replaceGlobalRowCell(nextXml, 5, 1, (cellXml) => {
    let next = setCellParagraph(cellXml, 0, data.resignationReason || '');
    if (signatureRelId) {
      const paragraphs = next.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
      const signParagraph = paragraphs[3];
      if (signParagraph) {
        const rPr = signParagraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '<w:rPr><w:rFonts w:hint="eastAsia"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
        const runs = `${runXml('签名：', rPr)}<w:r>${signatureDrawingXml(signatureRelId)}</w:r>${runXml('________________', rPr)}`;
        next = replaceNthMatch(next, /<w:p\b[\s\S]*?<\/w:p>/g, 3, paragraphWithRuns(signParagraph, runs));
      }
    }
    return next;
  });

  return nextXml;
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
  const relationship = `<Relationship Id="${SIGNATURE_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/resignation-signature.png"/>`;
  writeEntry(entries, relsPath, relsXml.replace('</Relationships>', `${relationship}</Relationships>`));
}

function addPngContentType(entries: ZipEntry[]) {
  const contentTypesPath = '[Content_Types].xml';
  const contentTypesXml = readEntry(entries, contentTypesPath);
  if (contentTypesXml.includes('Extension="png"')) return;
  writeEntry(entries, contentTypesPath, contentTypesXml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
}

function getSignatureImage(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

export function buildResignationDocx(record: ResignationRecord): Buffer {
  const template = fs.readFileSync(TEMPLATE_PATH);
  const entries = readZip(template);
  const signature = getSignatureImage(record.data.applicantSignatureDataUrl || '');
  let documentXml = fillTemplate(readEntry(entries, 'word/document.xml'), record, signature ? SIGNATURE_REL_ID : null);
  if (signature) {
    documentXml = ensureDrawingNamespaces(documentXml);
    writeEntry(entries, 'word/media/resignation-signature.png', signature);
    addSignatureRelationship(entries);
    addPngContentType(entries);
  }
  writeEntry(entries, 'word/document.xml', documentXml);
  return createZip(entries.map((entry) => ({ path: entry.path, content: entry.content })));
}
