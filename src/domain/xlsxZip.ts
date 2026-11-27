export interface ZipEntryInput {
  /** Forward-slash relative path inside the archive (e.g. `xl/workbook.xml`). */
  path: string;
  content: string | Uint8Array;
}

const textEncoder = new TextEncoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosTimestamp(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Packages UTF-8 XML files into a standards-compliant PKZIP 2.0 archive (Store mode / method 0),
 * accepted natively by Microsoft Excel, Google Sheets, LibreOffice Calc, and Apple Numbers.
 */
export function buildStoredZip(
  entries: readonly ZipEntryInput[],
  timestamp: Date = new Date(),
): Uint8Array {
  const { dosTime, dosDate } = getDosTimestamp(timestamp);

  interface PreparedEntry {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    localOffset: number;
  }

  const prepared: PreparedEntry[] = [];
  let offset = 0;
  let centralDirSize = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.path);
    const dataBytes =
      typeof entry.content === 'string' ? textEncoder.encode(entry.content) : entry.content;
    const crc = computeCrc32(dataBytes);
    prepared.push({ nameBytes, dataBytes, crc, localOffset: offset });

    offset += 30 + nameBytes.length + dataBytes.length;
    centralDirSize += 46 + nameBytes.length;
  }

  const centralDirOffset = offset;
  const totalSize = centralDirOffset + centralDirSize + 22;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // 1. Local File Headers + File Payloads
  let cursor = 0;
  for (const item of prepared) {
    view.setUint32(cursor, 0x04034b50, true); // Local file header signature
    view.setUint16(cursor + 4, 20, true); // Version needed (2.0)
    view.setUint16(cursor + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(cursor + 8, 0, true); // Compression: Store (0)
    view.setUint16(cursor + 10, dosTime, true);
    view.setUint16(cursor + 12, dosDate, true);
    view.setUint32(cursor + 14, item.crc, true);
    view.setUint32(cursor + 18, item.dataBytes.length, true);
    view.setUint32(cursor + 22, item.dataBytes.length, true);
    view.setUint16(cursor + 26, item.nameBytes.length, true);
    view.setUint16(cursor + 28, 0, true); // Extra field length
    cursor += 30;

    output.set(item.nameBytes, cursor);
    cursor += item.nameBytes.length;

    output.set(item.dataBytes, cursor);
    cursor += item.dataBytes.length;
  }

  // 2. Central Directory Records
  for (const item of prepared) {
    view.setUint32(cursor, 0x02014b50, true); // Central directory signature
    view.setUint16(cursor + 4, 20, true); // Version made by
    view.setUint16(cursor + 6, 20, true); // Version needed
    view.setUint16(cursor + 8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(cursor + 10, 0, true); // Compression: Store (0)
    view.setUint16(cursor + 12, dosTime, true);
    view.setUint16(cursor + 14, dosDate, true);
    view.setUint32(cursor + 16, item.crc, true);
    view.setUint32(cursor + 20, item.dataBytes.length, true);
    view.setUint32(cursor + 24, item.dataBytes.length, true);
    view.setUint16(cursor + 28, item.nameBytes.length, true);
    view.setUint16(cursor + 30, 0, true); // Extra length
    view.setUint16(cursor + 32, 0, true); // Comment length
    view.setUint16(cursor + 34, 0, true); // Disk number start
    view.setUint16(cursor + 36, 0, true); // Internal attributes
    view.setUint32(cursor + 38, 0, true); // External attributes
    view.setUint32(cursor + 42, item.localOffset, true);
    cursor += 46;

    output.set(item.nameBytes, cursor);
    cursor += item.nameBytes.length;
  }

  // 3. End of Central Directory Record (EOCD)
  view.setUint32(cursor, 0x06054b50, true);
  view.setUint16(cursor + 4, 0, true);
  view.setUint16(cursor + 6, 0, true);
  view.setUint16(cursor + 8, prepared.length, true);
  view.setUint16(cursor + 10, prepared.length, true);
  view.setUint32(cursor + 12, centralDirSize, true);
  view.setUint32(cursor + 16, centralDirOffset, true);
  view.setUint16(cursor + 20, 0, true);

  return output;
}
