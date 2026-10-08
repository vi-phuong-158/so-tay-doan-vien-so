import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  CERTIFICATE_PALETTE,
  CERTIFICATE_SIGNATURE_SIZE,
  CERTIFICATE_SIGNATURE_SRC,
  fitCanvasFontSize,
  renderCertificateToCanvas,
  wrapCanvasText
} from '../src/lib/certificateCanvas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createContext() {
  const context = {
    font: '500 16px sans-serif',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    draws: [],
    images: [],
    measureText(text) {
      const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16);
      return { width: String(text).length * size * 0.54 };
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    drawImage(image, ...args) {
      this.images.push({ src: image.src, args, alpha: this.globalAlpha });
    },
    fillText(text, x, y) {
      this.draws.push({ text, x, y, width: this.measureText(text).width, font: this.font });
    }
  };
  return context;
}

function installBrowserImageMocks({ failSignature = false } = {}) {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  class FakeImage {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
    }

    set src(value) {
      this._src = value;
      const isSignature = value.endsWith('chu-ky-certificate.png');
      this.width = this.naturalWidth = isSignature ? CERTIFICATE_SIGNATURE_SIZE.width : 452;
      this.height = this.naturalHeight = isSignature ? CERTIFICATE_SIGNATURE_SIZE.height : 240;
      queueMicrotask(() => {
        if (isSignature && failSignature) this.onerror?.(new Error('image unavailable'));
        else this.onload?.();
      });
    }

    get src() {
      return this._src;
    }
  }

  globalThis.Image = FakeImage;
  globalThis.document = { fonts: { ready: Promise.resolve() } };

  return () => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  };
}

function completeCertificate(fullName, organizationName) {
  return {
    code: 'NQ13-4E6FBD0421A64629',
    full_name: fullName,
    organization_name: organizationName,
    issued_at: '2026-10-08T10:30:00.000Z',
    score: 80,
    correct_count: 24,
    total_questions: 30
  };
}

test('certificate palette uses the Youth Union blue tokens and neutral paper', () => {
  assert.equal(CERTIFICATE_PALETTE.navy, '#073B8C');
  assert.equal(CERTIFICATE_PALETTE.blue, '#1257C4');
  assert.equal(CERTIFICATE_PALETTE.paleBlue, '#DCEBFF');
  assert.equal(CERTIFICATE_PALETTE.softBlue, '#F2F7FF');
  assert.equal(CERTIFICATE_PALETTE.charcoal, '#1F2937');
  assert.equal(CERTIFICATE_PALETTE.muted, '#667085');
  assert.equal(CERTIFICATE_PALETTE.paper, '#FFFFFF');
  assert.equal('gold' in CERTIFICATE_PALETTE, false);
});

const OWNER_SOURCE = path.join(root, 'design-source', 'nq13-certificate', 'chu-ky-owner-source.png');
const DERIVATIVE = path.join(root, 'src', 'assets', 'certificate', 'chu-ky-certificate.png');
const OWNER_SOURCE_SHA256 = 'BFB2B8445D7B1FC22372880331ED013D08427212B0DDD1E9C1569F0E91881F28';
const DERIVATIVE_SHA256 = 'BA5978FE0813A01A4912A221DEC05FC3916027C966C83942BB221C6EE6949249';
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();

// Minimal 8-bit RGBA non-interlaced PNG decoder, enough to inspect the alpha channel.
function readPngAlphaBounds(file) {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6, 'derivative must be RGBA');
      assert.equal(data[12], 0, 'derivative must not be interlaced');
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    const prev = y ? rows[y - 1] : Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? line[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 255;
    }
    rows.push(line);
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  rows.forEach((line, y) => {
    for (let x = 0; x < width; x += 1) {
      if (line[x * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });
  return { width, height, minX, minY, maxX, maxY };
}

test('owner source asset is kept outside public/ and is byte-for-byte the owner file', () => {
  assert.equal(fs.existsSync(path.join(root, 'public', 'brand', 'chu-ky.png')), false);
  assert.equal(fs.existsSync(OWNER_SOURCE), true);
  assert.equal(sha256(OWNER_SOURCE), OWNER_SOURCE_SHA256);
});

test('certificate signature derivative exists, is pinned, cropped and keeps the source aspect ratio', () => {
  assert.equal(fs.existsSync(DERIVATIVE), true);
  assert.equal(sha256(DERIVATIVE), DERIVATIVE_SHA256);
  assert.ok(fs.statSync(DERIVATIVE).size < 400 * 1024, 'derivative must stay small');

  const bounds = readPngAlphaBounds(DERIVATIVE);
  assert.equal(bounds.width, CERTIFICATE_SIGNATURE_SIZE.width);
  assert.equal(bounds.height, CERTIFICATE_SIGNATURE_SIZE.height);
  // Tight crop: ink starts within a few pixels of every edge, so no transparent padding is left.
  assert.ok(bounds.minX <= 12 && bounds.minY <= 12);
  assert.ok(bounds.width - 1 - bounds.maxX <= 12 && bounds.height - 1 - bounds.maxY <= 12);

  // Same aspect as the visible ink of the owner source (2565 x 1147) plus the uniform crop padding.
  const sourceInkAspect = 2565 / 1147;
  const derivativeAspect = bounds.width / bounds.height;
  assert.ok(Math.abs(derivativeAspect - sourceInkAspect) / sourceInkAspect < 0.03);
});

test('browser-facing code never references the raw owner asset path', () => {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx?|css|html|webmanifest)$/.test(entry.name) || entry.name === 'sw.js') files.push(full);
  });
  ['src', 'public'].forEach((dir) => walk(path.join(root, dir)));
  files.push(path.join(root, 'index.html'));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(/chu-ky(?!-certificate)/.test(text), false, `${path.relative(root, file)} references the raw signature asset`);
  }
  assert.match(CERTIFICATE_SIGNATURE_SRC, /chu-ky-certificate\.png$/);
  assert.equal(CERTIFICATE_SIGNATURE_SRC.includes('/public/'), false);
});

test('canvas text fitting reduces long names and wrapping keeps organization lines within bounds', () => {
  const context = createContext();
  const name = 'NGUYỄN HOÀNG MINH PHƯƠNG';
  const fontSize = fitCanvasFontSize(context, name, {
    baseSize: 46,
    minSize: 32,
    maxWidth: 300,
    weight: '700'
  });
  context.font = `500 18px "Be Vietnam Pro", sans-serif`;
  const organization = 'CHI ĐOÀN PHÒNG AN NINH ĐỐI NGOẠI - CÔNG AN TỈNH PHÚ THỌ';
  const lines = wrapCanvasText(context, organization, 260);

  assert.ok(fontSize < 46);
  assert.ok(fontSize >= 32);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => context.measureText(line).width <= 260));
});

for (const [name, organization] of [
  ['NGUYỄN THỊ PHƯƠNG THẢO', 'CHI ĐOÀN PHÒNG AN NINH ĐỐI NGOẠI - CÔNG AN TỈNH PHÚ THỌ'],
  ['NGUYỄN HOÀNG MINH PHƯƠNG', 'CHI ĐOÀN PHÒNG AN NINH ĐỐI NGOẠI - CÔNG AN TỈNH PHÚ THỌ']
]) {
  test(`canvas renders long participant data without throwing: ${name}`, async () => {
    const context = createContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context
    };
    const restore = installBrowserImageMocks();
    try {
      await renderCertificateToCanvas(canvas, completeCertificate(name, organization), {
        origin: 'https://preview.example.vercel.app'
      });

      assert.equal(canvas.width, 1754);
      assert.equal(canvas.height, 1240);
      assert.ok(context.draws.some((draw) => draw.text.includes(name)));
      assert.ok(context.draws.some((draw) => draw.text.includes('CHI ĐOÀN PHÒNG')));
      assert.ok(context.draws.some((draw) => draw.text.includes('TM. BAN THANH NIÊN')));
      assert.ok(context.draws.some((draw) => draw.text.includes('TRƯỞNG BAN')));
      assert.ok(context.draws.some((draw) => draw.text.includes('Hoàng Tuấn Việt')));
      assert.ok(context.draws.every((draw) => Number.isFinite(draw.width)));

      const watermark = context.images.find((image) => image.src === '/brand/logo-doan-badge.png');
      const signature = context.images.find((image) => image.src === CERTIFICATE_SIGNATURE_SRC);
      assert.ok(watermark);
      assert.equal(watermark.alpha, 0.045);
      assert.ok(signature);
      // Whole derivative, uniformly scaled: 4 args (dx, dy, dw, dh), never a source-crop rectangle.
      assert.equal(signature.args.length, 4);
      const [, , drawWidth, drawHeight] = signature.args;
      const sourceAspect = CERTIFICATE_SIGNATURE_SIZE.width / CERTIFICATE_SIGNATURE_SIZE.height;
      assert.ok(Math.abs(drawWidth / drawHeight - sourceAspect) < 0.001);
      assert.ok(drawWidth <= 420 && drawHeight <= 184);
    } finally {
      restore();
    }
  });
}

test('canvas export fails closed when the official signature asset cannot load', async () => {
  const restore = installBrowserImageMocks({ failSignature: true });
  const canvas = { getContext: () => createContext() };
  try {
    await assert.rejects(
      renderCertificateToCanvas(canvas, completeCertificate('NGUYỄN VĂN A', 'CÔNG AN TỈNH PHÚ THỌ'), {
        origin: 'https://preview.example.vercel.app'
      }),
      /không thể tải chữ ký và con dấu/i
    );
  } finally {
    restore();
  }
});

test('canvas export rejects when the signature image decodes to zero size', async () => {
  const restore = installBrowserImageMocks();
  const OriginalImage = globalThis.Image;
  globalThis.Image = class extends OriginalImage {
    set src(value) {
      super.src = value;
      if (value.endsWith('chu-ky-certificate.png')) this.width = this.naturalWidth = 0;
    }

    get src() {
      return super.src;
    }
  };
  try {
    await assert.rejects(
      renderCertificateToCanvas({ getContext: () => createContext() }, completeCertificate('NGUYỄN VĂN A', 'CÔNG AN TỈNH PHÚ THỌ'), {
        origin: 'https://preview.example.vercel.app'
      }),
      /không hợp lệ/i
    );
  } finally {
    globalThis.Image = OriginalImage;
    restore();
  }
});

test('canvas refuses incomplete certificate data instead of rendering a fallback credential', async () => {
  const canvas = { getContext: createContext };
  await assert.rejects(
    renderCertificateToCanvas(canvas, { code: '', full_name: '', organization_name: '' }, {
      origin: 'https://preview.example.vercel.app'
    }),
    /complete certificate record/i
  );
});
