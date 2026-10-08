import QRCode from 'qrcode';

export const QR_QUIET_ZONE = 4;

function createQr(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('QR payload must be a non-empty string.');
  }
  return QRCode.create(text, { errorCorrectionLevel: 'M' });
}

export function generateQrMatrix(text) {
  const { modules } = createQr(text);
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) => Boolean(modules.data[row * modules.size + column]))
  );
}

export function getQrVersion(text) {
  return createQr(text).version;
}

export function renderQrToCanvas(canvas, text, options = {}) {
  const { size = 240, color = '#000000', bgColor = '#ffffff' } = options;
  const margin = Math.max(QR_QUIET_ZONE, Math.floor(options.margin ?? QR_QUIET_ZONE));
  const matrix = generateQrMatrix(text);
  const totalModules = matrix.length + margin * 2;
  const moduleSize = size / totalModules;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D rendering is unavailable.');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;

  matrix.forEach((row, y) => row.forEach((isDark, x) => {
    if (isDark) {
      const left = Math.round((x + margin) * moduleSize);
      const top = Math.round((y + margin) * moduleSize);
      ctx.fillRect(left, top, Math.ceil(moduleSize), Math.ceil(moduleSize));
    }
  }));
}

export function generateQrSvg(text, options = {}) {
  const { size = 180, color = '#000000', bgColor = '#ffffff' } = options;
  const margin = Math.max(QR_QUIET_ZONE, Math.floor(options.margin ?? QR_QUIET_ZONE));
  const matrix = generateQrMatrix(text);
  const totalModules = matrix.length + margin * 2;
  let rects = '';

  matrix.forEach((row, y) => row.forEach((isDark, x) => {
    if (isDark) {
      rects += `<rect x="${x + margin}" y="${y + margin}" width="1" height="1" fill="${color}" />`;
    }
  }));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${totalModules}" height="${totalModules}" fill="${bgColor}" />${rects}</svg>`;
}
