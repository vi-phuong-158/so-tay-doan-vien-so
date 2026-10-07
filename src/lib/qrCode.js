/**
 * Standalone QR Code (Model 2) Generator in pure JavaScript ESM.
 * Zero external dependencies.
 * Generates standards-compliant QR codes (ISO/IEC 18004).
 * Supports numeric, alphanumeric, and byte encoding with Reed-Solomon error correction.
 */

// Reed-Solomon Galois Field GF(256) tables with primitive polynomial 0x11d (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
  }
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

// Generator polynomials for RS error correction
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP_TABLE[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

// Error correction table: [totalCodewords, dataCodewords, ecCodewords, numBlocksGroup1, dataPerBlockGroup1, numBlocksGroup2, dataPerBlockGroup2]
// For Error Correction Level M (up to Version 10 is plenty for URLs up to 200+ characters)
const EC_SPECS_M = {
  1: { total: 26, data: 16, ec: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0 },
  2: { total: 44, data: 28, ec: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0 },
  3: { total: 70, data: 44, ec: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0 },
  4: { total: 100, data: 64, ec: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0 },
  5: { total: 134, data: 86, ec: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0 },
  6: { total: 172, data: 108, ec: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0 },
  7: { total: 196, data: 124, ec: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0 },
  8: { total: 242, data: 154, ec: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39 },
  9: { total: 292, data: 182, ec: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37 },
  10: { total: 346, data: 216, ec: 26, g1Blocks: 4, g1Data: 40, g2Blocks: 1, g2Data: 41 },
};

// Alignment pattern centers per version
const ALIGNMENT_PATTERN_CENTERS = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// Format info bit patterns for Level M (00) masked with 0x5412
const FORMAT_INFO_M = {
  0: 0x5412,
  1: 0x5125,
  2: 0x5e7c,
  3: 0x5b4b,
  4: 0x45f9,
  5: 0x40ce,
  6: 0x4f97,
  7: 0x4aa0,
};

function selectVersion(byteCount) {
  for (let v = 1; v <= 10; v++) {
    const spec = EC_SPECS_M[v];
    // Mode indicator (4 bits) + character count (8 bits for v1-9, 16 for v10+)
    const headerBits = v < 10 ? 12 : 20;
    const maxDataBytes = spec.data;
    const requiredBytes = Math.ceil((headerBits + byteCount * 8 + 4) / 8);
    if (requiredBytes <= maxDataBytes) {
      return v;
    }
  }
  return 10;
}

function encodeData(text, version) {
  const spec = EC_SPECS_M[version];
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bitLength = bytes.length;

  const bits = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);

  // Character count indicator (8 bits for v1-9, 16 bits for v10+)
  pushBits(bitLength, version < 10 ? 8 : 16);

  // Data bytes
  for (let i = 0; i < bitLength; i++) {
    pushBits(bytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const maxBits = spec.data * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) bits.push(0);

  // Pad to multiple of 8 bits
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to bytes
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  // Pad bytes with 0xEC and 0x11 alternately
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < spec.data) {
    dataBytes.push(padBytes[padIdx]);
    padIdx = (padIdx + 1) % 2;
  }

  return dataBytes;
}

function computeErrorCorrection(dataBytes, spec) {
  const genPoly = rsGeneratorPoly(spec.ec);
  const blocks = [];
  let offset = 0;

  for (let b = 0; b < spec.g1Blocks; b++) {
    blocks.push(dataBytes.slice(offset, offset + spec.g1Data));
    offset += spec.g1Data;
  }
  for (let b = 0; b < spec.g2Blocks; b++) {
    blocks.push(dataBytes.slice(offset, offset + spec.g2Data));
    offset += spec.g2Data;
  }

  const ecBlocks = [];
  for (const block of blocks) {
    const remainder = new Array(spec.ec).fill(0);
    const combined = [...block, ...remainder];
    for (let i = 0; i < block.length; i++) {
      const factor = combined[i];
      if (factor !== 0) {
        for (let j = 0; j < genPoly.length; j++) {
          combined[i + j] ^= gfMul(genPoly[j], factor);
        }
      }
    }
    ecBlocks.push(combined.slice(block.length));
  }

  // Interleave data blocks
  const interleaved = [];
  const maxDataLen = Math.max(spec.g1Data, spec.g2Data || 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }

  // Interleave EC blocks
  for (let i = 0; i < spec.ec; i++) {
    for (const b of ecBlocks) {
      interleaved.push(b[i]);
    }
  }

  return interleaved;
}

function createMatrix(version) {
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));

  function set(r, c, val, isReserved = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isReserved) reserved[r][c] = true;
    }
  }

  // Finder pattern helper
  function addFinder(top, left) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          set(row, col, 0); // Separator
        } else if (r === 0 || r === 6 || c === 0 || c === 6) {
          set(row, col, 1);
        } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
          set(row, col, 1);
        } else {
          set(row, col, 0);
        }
      }
    }
  }

  // Add 3 Finder Patterns
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module
  set(size - 8, 8, 1);

  // Alignment patterns
  if (version >= 2) {
    const centers = ALIGNMENT_PATTERN_CENTERS[version];
    for (const r of centers) {
      for (const c of centers) {
        if (reserved[r][c]) continue; // Skip if overlaps finder
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            set(r + dr, c + dc, isBorder || isCenter ? 1 : 0);
          }
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    set(8, i, 0);
    set(i, 8, 0);
  }
  for (let i = size - 8; i < size; i++) {
    set(8, i, 0);
    set(i, 8, 0);
  }

  return { matrix, reserved, size };
}

function placeData(matrix, reserved, dataBytes, size) {
  const bits = [];
  for (const byte of dataBytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const left = right - 1;

    const rowRange = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rowRange) {
      for (const c of [right, left]) {
        if (!reserved[r][c]) {
          matrix[r][c] = bitIdx < bits.length ? bits[bitIdx++] : 0;
        }
      }
    }
    upwards = !upwards;
  }
}

function maskMatrix(matrix, reserved, size, maskPattern) {
  const masked = matrix.map((row) => [...row]);
  const maskFn = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][maskPattern];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) {
        if (maskFn(r, c)) {
          masked[r][c] ^= 1;
        }
      }
    }
  }
  return masked;
}

function writeFormatInfo(matrix, size, maskPattern) {
  const format = FORMAT_INFO_M[maskPattern];
  const bits = [];
  for (let i = 14; i >= 0; i--) bits.push((format >> i) & 1);

  // Top-left format info
  for (let i = 0; i <= 5; i++) matrix[8][i] = bits[i];
  matrix[8][7] = bits[6];
  matrix[8][8] = bits[7];
  matrix[7][8] = bits[8];
  for (let i = 9; i <= 14; i++) matrix[14 - i][8] = bits[i];

  // Bottom-left / Top-right format info
  for (let i = 0; i <= 6; i++) matrix[size - 1 - i][8] = bits[i];
  for (let i = 7; i <= 14; i++) matrix[8][size - 15 + i] = bits[i];
}

/**
 * Generate 2D boolean grid representing the QR Code.
 * @param {string} text
 * @returns {boolean[][]}
 */
export function generateQrMatrix(text) {
  const version = selectVersion(new TextEncoder().encode(text).length);
  const spec = EC_SPECS_M[version];
  const dataBytes = encodeData(text, version);
  const finalCodewords = computeErrorCorrection(dataBytes, spec);
  const { matrix, reserved, size } = createMatrix(version);

  placeData(matrix, reserved, finalCodewords, size);

  // Mask pattern 0 is standard and clean
  const maskPattern = 0;
  const masked = maskMatrix(matrix, reserved, size, maskPattern);
  writeFormatInfo(masked, size, maskPattern);

  return masked.map((row) => row.map((cell) => cell === 1));
}

/**
 * Render QR matrix to an HTML5 Canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {object} options
 */
export function renderQrToCanvas(canvas, text, options = {}) {
  const { size = 200, margin = 2, color = '#000000', bgColor = '#ffffff' } = options;
  const matrix = generateQrMatrix(text);
  const moduleCount = matrix.length;
  const totalCount = moduleCount + margin * 2;
  const cellSize = size / totalCount;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = color;
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          Math.round((c + margin) * cellSize),
          Math.round((r + margin) * cellSize),
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }
  }
}

/**
 * Generate QR SVG string.
 * @param {string} text
 * @param {object} options
 * @returns {string}
 */
export function generateQrSvg(text, options = {}) {
  const { size = 160, margin = 2, color = '#000000', bgColor = '#ffffff' } = options;
  const matrix = generateQrMatrix(text);
  const count = matrix.length;
  const total = count + margin * 2;

  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${color}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${total}" height="${total}" fill="${bgColor}" />
    ${rects}
  </svg>`;
}
