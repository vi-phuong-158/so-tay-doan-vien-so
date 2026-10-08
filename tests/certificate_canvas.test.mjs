import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CERTIFICATE_PALETTE,
  fitCanvasFontSize,
  renderCertificateToCanvas,
  wrapCanvasText
} from '../src/lib/certificateCanvas.js';

function createContext() {
  const context = {
    font: '500 16px sans-serif',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    draws: [],
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
    drawImage() {},
    fillText(text, x, y) {
      this.draws.push({ text, x, y, width: this.measureText(text).width, font: this.font });
    }
  };
  return context;
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

test('certificate palette stays within navy, charcoal, muted, gold and paper neutrals', () => {
  assert.equal(CERTIFICATE_PALETTE.navy, '#123B66');
  assert.equal(CERTIFICATE_PALETTE.charcoal, '#1F2937');
  assert.equal(CERTIFICATE_PALETTE.muted, '#667085');
  assert.equal(CERTIFICATE_PALETTE.gold, '#B9974F');
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
    await renderCertificateToCanvas(canvas, completeCertificate(name, organization), {
      origin: 'https://preview.example.vercel.app',
      logoSrc: null
    });

    assert.equal(canvas.width, 1754);
    assert.equal(canvas.height, 1240);
    assert.ok(context.draws.some((draw) => draw.text.includes(name)));
    assert.ok(context.draws.some((draw) => draw.text.includes('CHI ĐOÀN PHÒNG')));
    assert.ok(context.draws.every((draw) => Number.isFinite(draw.width)));
  });
}

test('canvas refuses incomplete certificate data instead of rendering a fallback credential', async () => {
  const canvas = { getContext: createContext };
  await assert.rejects(
    renderCertificateToCanvas(canvas, { code: '', full_name: '', organization_name: '' }, {
      origin: 'https://preview.example.vercel.app'
    }),
    /complete certificate record/i
  );
});
