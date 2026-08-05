import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { socialSecurityWaiverReasonCode } from '@/lib/social-security-records';
import type { SocialSecurityRecord } from '@/types/social-security';

const TEMPLATE_BY_TYPE = {
  combined: path.join(process.cwd(), 'src', 'templates', 'social-security-no-purchase-template.docx'),
  no_purchase: path.join(process.cwd(), 'src', 'templates', 'social-security-no-purchase-template.docx'),
  waiver: path.join(process.cwd(), 'src', 'templates', 'social-security-waiver-template.docx'),
} as const;

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

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
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
  if (entry) entry.content = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
}

function formatChineseDate(value?: string | null): string {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '      年    月    日';
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function parseChineseDateParts(value?: string | null) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return { year: '　　', month: '　', day: '　' };
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

function paragraphText(originalParagraph: string, value: string): string {
  const start = originalParagraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = originalParagraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
  const rPr = originalParagraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '<w:rPr><w:rFonts w:hint="eastAsia"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  return `${start}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;
}

function visibleParagraphText(paragraph: string): string {
  return [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(match => match[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function replaceTextNode(paragraph: string, original: string, replacement: string, occurrence = 0): string {
  let seen = 0;
  return paragraph.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (match, open: string, text: string, close: string) => {
    if (unescapeXml(text) !== original) return match;
    if (seen !== occurrence) {
      seen += 1;
      return match;
    }
    seen += 1;
    return `${open}${escapeXml(replacement)}${close}`;
  });
}

function fillNoPurchaseTemplate(documentXml: string, record: SocialSecurityRecord): string {
  const data = record.data;
  const name = data.name || record.name || '';
  const idCard = data.idCard || record.idCard || '';
  const hireDate = parseChineseDateParts(data.hireDate || record.hireDate);
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = visibleParagraphText(paragraph);
    if (text.includes('本人　　　　，身份证号')) {
      return replaceTextNode(
        replaceTextNode(
          replaceTextNode(
            replaceTextNode(
              replaceTextNode(paragraph, '　　　　', name),
              '　　　　　　　　　',
              idCard,
            ),
            '　　',
            hireDate.year,
          ),
          '　',
          hireDate.month,
        ),
        '　',
        hireDate.day,
      );
    }
    if (text.trim() === '申请人：') return paragraphText(paragraph, `申请人：${name}`);
    if (text.includes('日期：')) return paragraphText(paragraph, `　　　　　　　　　　　　　　　　　　　　   日期：${formatChineseDate(data.applicationDate || record.applicationDate)}`);
    return paragraph;
  });
}

function fillWaiverTemplate(documentXml: string, record: SocialSecurityRecord): string {
  const data = record.data;
  const company = data.companyName || '东莞山泽新能源科技有限公司';
  const city = data.bureauCity || '东莞';
  const companyBeforeSuffix = company.endsWith('公司') ? company.slice(0, -2) : company;
  const reasonCode = socialSecurityWaiverReasonCode(data.reason);
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = visibleParagraphText(paragraph);
    if (text.includes('市人力资源和社会保障局')) {
      return replaceTextNode(
        replaceTextNode(paragraph, '      市', `      ${city}市`),
        '                         ',
        companyBeforeSuffix,
      );
    }
    if (text.includes('本人确认') && text.includes('以下简称公司')) {
      return replaceTextNode(
        replaceTextNode(paragraph, '                       ', company),
        '     ',
        `  ${reasonCode}  `,
      );
    }
    if (text.includes('关于购买社保事宜针对')) {
      return replaceTextNode(paragraph, '  ', companyBeforeSuffix);
    }
    if (text.includes('申请人（签字捺印）：')) {
      return replaceTextNode(paragraph, ' ', data.name || record.name || '');
    }
    if (text.includes('身份证号码：')) {
      return replaceTextNode(paragraph, '                                  身份证号码：', `                                  身份证号码：${data.idCard || record.idCard || ''}`);
    }
    if (text.includes('日      期：')) {
      return replaceTextNode(paragraph, '                                  日      期：       年     月     日', `                                  日      期：${formatChineseDate(data.applicationDate || record.applicationDate)}`);
    }
    return paragraph;
  });
}

function renameWaiverNumbering(xml: string): string {
  const offset = 100;
  return xml
    .replace(/w:abstractNumId="(\d+)"/g, (_match, id: string) => `w:abstractNumId="${Number(id) + offset}"`)
    .replace(/<w:abstractNumId w:val="(\d+)"/g, (_match, id: string) => `<w:abstractNumId w:val="${Number(id) + offset}"`)
    .replace(/w:numId="(\d+)"/g, (_match, id: string) => `w:numId="${Number(id) + offset}"`)
    .replace(/<w:numId w:val="(\d+)"/g, (_match, id: string) => `<w:numId w:val="${Number(id) + offset}"`);
}

function importWaiverNumbering(entries: ZipEntry[], waiverEntries: ZipEntry[]) {
  const numberingPath = 'word/numbering.xml';
  const source = renameWaiverNumbering(readEntry(waiverEntries, numberingPath));
  const abstractNumbers = (source.match(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g) || []).join('');
  const numbers = (source.match(/<w:num\b[\s\S]*?<\/w:num>/g) || []).join('');
  const target = readEntry(entries, numberingPath);
  writeEntry(entries, numberingPath, target.replace('</w:numbering>', `${abstractNumbers}${numbers}</w:numbering>`));
}

function withNextPageSection(sectPr: string): string {
  return sectPr.includes('<w:type ')
    ? sectPr.replace(/<w:type\b[^>]*\/>/, '<w:type w:val="nextPage"/>')
    : sectPr.replace(/<w:sectPr\b([^>]*)>/, '<w:sectPr$1><w:type w:val="nextPage"/>');
}

function mergeCombinedDocuments(
  entries: ZipEntry[],
  waiverEntries: ZipEntry[],
  noPurchaseXml: string,
  waiverXml: string,
): string {
  importWaiverNumbering(entries, waiverEntries);
  const renamedWaiverXml = renameWaiverNumbering(waiverXml);
  const noPurchaseSectPr = (noPurchaseXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) || []).at(-1);
  const waiverBody = renamedWaiverXml.match(/<w:body>([\s\S]*?)<\/w:body>/)?.[1];
  const waiverSectPr = (renamedWaiverXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) || []).at(-1);
  if (!noPurchaseSectPr || !waiverBody || !waiverSectPr) {
    throw new Error('Social security template section settings are missing');
  }
  const waiverContent = waiverBody.replace(waiverSectPr, '');
  const sectionBreak = `<w:p><w:pPr>${withNextPageSection(noPurchaseSectPr)}</w:pPr></w:p>`;
  return noPurchaseXml.replace(
    `${noPurchaseSectPr}</w:body>`,
    `${sectionBreak}${waiverContent}${waiverSectPr}</w:body>`,
  );
}

export function buildSocialSecurityDocx(record: SocialSecurityRecord): Buffer {
  if (record.documentType === 'combined') {
    const entries = readZip(fs.readFileSync(TEMPLATE_BY_TYPE.no_purchase));
    const waiverEntries = readZip(fs.readFileSync(TEMPLATE_BY_TYPE.waiver));
    const noPurchaseXml = fillNoPurchaseTemplate(readEntry(entries, 'word/document.xml'), record);
    const waiverXml = fillWaiverTemplate(readEntry(waiverEntries, 'word/document.xml'), record);
    writeEntry(entries, 'word/document.xml', mergeCombinedDocuments(entries, waiverEntries, noPurchaseXml, waiverXml));
    return createZip(entries.map((entry) => ({ path: entry.path, content: entry.content })));
  }
  const templatePath = TEMPLATE_BY_TYPE[record.documentType];
  const template = fs.readFileSync(templatePath);
  const entries = readZip(template);
  const documentXml = readEntry(entries, 'word/document.xml');
  const filledXml = record.documentType === 'waiver'
    ? fillWaiverTemplate(documentXml, record)
    : fillNoPurchaseTemplate(documentXml, record);
  writeEntry(entries, 'word/document.xml', filledXml);
  return createZip(entries.map((entry) => ({ path: entry.path, content: entry.content })));
}
