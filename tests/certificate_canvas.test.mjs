import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  CERTIFICATE_PALETTE,
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
      const isSignature = value === '/brand/chu-ky.png';
      this.width = this.naturalWidth = isSignature ? 12 : 452;
      this.height = this.naturalHeight = isSignature ? 8 : 240;
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
  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData(_x, _y, width, height) {
          const data = new Uint8ClampedArray(width * height * 4);
          for (let y = 1; y < height - 1; y += 1) {
            for (let x = 2; x < width - 2; x += 1) data[(y * width + x) * 4 + 3] = 255;
          }
          return { data };
        }
      })
    })
  };

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

test('owner-supplied signature asset exists and remains a PNG source file', () => {
  const assetPath = path.join(root, 'public', 'brand', 'chu-ky.png');
  assert.equal(fs.existsSync(assetPath), true);
  assert.equal(fs.readFileSync(assetPath).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
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
      const signature = context.images.find((image) => image.src === '/brand/chu-ky.png');
      assert.ok(watermark);
      assert.equal(watermark.alpha, 0.045);
      assert.ok(signature);
      assert.equal(signature.args.length, 8);
      assert.ok(Math.abs(signature.args[2] / signature.args[3] - signature.args[6] / signature.args[7]) < 0.02);
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

test('canvas refuses incomplete certificate data instead of rendering a fallback credential', async () => {
  const canvas = { getContext: createContext };
  await assert.rejects(
    renderCertificateToCanvas(canvas, { code: '', full_name: '', organization_name: '' }, {
      origin: 'https://preview.example.vercel.app'
    }),
    /complete certificate record/i
  );
});
