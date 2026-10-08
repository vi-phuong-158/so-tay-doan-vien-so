import { generateQrMatrix, QR_QUIET_ZONE } from './qrCode.js';
import {
  formatCertificateDate,
  isValidNqCertificateRecord,
  mapNqCertificateRecord,
  sanitizeCertificateFileName
} from '../services/nqQuizService.js';

export const CERTIFICATE_PALETTE = Object.freeze({
  navy: '#123B66',
  charcoal: '#1F2937',
  muted: '#667085',
  gold: '#B9974F',
  paper: '#FFFEFB',
  white: '#FFFFFF',
  qr: '#111827'
});

const FONT_FAMILY = '"Be Vietnam Pro", sans-serif';

export function fitCanvasFontSize(ctx, text, {
  baseSize,
  minSize,
  maxWidth,
  weight = '600',
  family = FONT_FAMILY
}) {
  let size = baseSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(String(text)).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

export function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    line = '';
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }

    let chunk = '';
    for (const character of word) {
      if (chunk && ctx.measureText(`${chunk}${character}`).width > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines;
}

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
}

function drawCenteredText(ctx, text, y, {
  width,
  maxWidth,
  size,
  minSize = size,
  weight = '500',
  color = CERTIFICATE_PALETTE.charcoal,
  align = 'center',
  centerX
}) {
  const fittedSize = fitCanvasFontSize(ctx, text, { baseSize: size, minSize, maxWidth, weight });
  setFont(ctx, weight, fittedSize);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centerX ?? (align === 'center' ? width / 2 : width), y);
  return fittedSize;
}

function drawWrappedCenterText(ctx, text, y, {
  width,
  maxWidth,
  size,
  minSize = size,
  weight = '500',
  color = CERTIFICATE_PALETTE.charcoal,
  lineHeight,
  maxLines = 2
}) {
  let fittedSize = size;
  let lines;
  do {
    setFont(ctx, weight, fittedSize);
    lines = wrapCanvasText(ctx, text, maxWidth);
    if (lines.length <= maxLines || fittedSize <= minSize) break;
    fittedSize -= 1;
  } while (fittedSize >= minSize);

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const gap = lineHeight ?? fittedSize * 1.35;
  const startY = y - ((lines.length - 1) * gap) / 2;
  lines.forEach((line, index) => ctx.fillText(line, width / 2, startY + index * gap));
  return { size: fittedSize, lines };
}

async function drawLogo(ctx, logoSrc, width) {
  if (!logoSrc || typeof Image === 'undefined') return;
  try {
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    await new Promise((resolve) => {
      logo.onload = resolve;
      logo.onerror = resolve;
      logo.src = logoSrc;
    });
    if (logo.width > 0 && logo.height > 0) {
      const logoHeight = 92;
      const logoWidth = (logo.width / logo.height) * logoHeight;
      ctx.drawImage(logo, (width - logoWidth) / 2, 64, logoWidth, logoHeight);
    }
  } catch {
    // Keep the certificate readable if the official logo asset cannot load.
  }
}

function drawCertificateBorder(ctx, width, height) {
  const { navy, gold, paper } = CERTIFICATE_PALETTE;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = navy;
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 38, width - 76, height - 76);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(52, 52, width - 104, height - 104);

  const corners = [
    [62, 62, 1, 1],
    [width - 62, 62, -1, 1],
    [62, height - 62, 1, -1],
    [width - 62, height - 62, -1, -1]
  ];
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  corners.forEach(([x, y, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * 22);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * 22, y);
    ctx.stroke();
  });
}

function drawQr(ctx, verifyUrl, x, y, size) {
  const matrix = generateQrMatrix(verifyUrl);
  const totalModules = matrix.length + QR_QUIET_ZONE * 2;
  const moduleSize = size / totalModules;
  ctx.fillStyle = CERTIFICATE_PALETTE.white;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = CERTIFICATE_PALETTE.qr;

  matrix.forEach((row, rowIndex) => row.forEach((isDark, columnIndex) => {
    if (!isDark) return;
    const left = Math.floor(x + (columnIndex + QR_QUIET_ZONE) * moduleSize);
    const top = Math.floor(y + (rowIndex + QR_QUIET_ZONE) * moduleSize);
    const right = Math.ceil(x + (columnIndex + QR_QUIET_ZONE + 1) * moduleSize);
    const bottom = Math.ceil(y + (rowIndex + QR_QUIET_ZONE + 1) * moduleSize);
    ctx.fillRect(left, top, right - left, bottom - top);
  }));
}

export async function renderCertificateToCanvas(canvas, certificate, options = {}) {
  if (!isValidNqCertificateRecord(certificate)) {
    throw new TypeError('A complete certificate record is required to render a certificate.');
  }
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;

  const { fullName, organizationName, score, correctCount, totalQuestions, certificateCode, issuedAt } =
    mapNqCertificateRecord(certificate);
  const width = options.width || 1754;
  const height = options.height || 1240;
  const origin = options.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  if (!origin) throw new TypeError('A public origin is required for certificate verification QR.');

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D rendering is unavailable.');
  drawCertificateBorder(ctx, width, height);

  if (options.logoSrc !== null) {
    await drawLogo(ctx, options.logoSrc ?? '/brand/logo-doan-badge.png', width);
  }

  const { navy, charcoal, muted, gold } = CERTIFICATE_PALETTE;
  drawCenteredText(ctx, 'CHỨNG NHẬN', 174, {
    width, maxWidth: 1500, size: 20, minSize: 16, weight: '700', color: muted
  });
  drawCenteredText(ctx, 'HOÀN THÀNH', 210, {
    width, maxWidth: 1500, size: 42, minSize: 34, weight: '700', color: navy
  });
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 80, 243);
  ctx.lineTo(width / 2 + 80, 243);
  ctx.stroke();
  drawCenteredText(ctx, 'BAN THANH NIÊN · CÔNG AN TỈNH PHÚ THỌ', 272, {
    width, maxWidth: 1460, size: 19, minSize: 16, weight: '600', color: muted
  });

  drawCenteredText(ctx, 'Đồng chí', 320, {
    width, maxWidth: 1400, size: 21, minSize: 19, color: muted
  });
  drawWrappedCenterText(ctx, fullName.toLocaleUpperCase('vi-VN'), 372, {
    width, maxWidth: 1500, size: 46, minSize: 32, weight: '700', color: navy, maxLines: 2, lineHeight: 44
  });
  drawWrappedCenterText(ctx, organizationName, 423, {
    width, maxWidth: 1450, size: 24, minSize: 18, weight: '500', color: charcoal, maxLines: 2, lineHeight: 30
  });
  drawCenteredText(ctx, 'đã hoàn thành đạt yêu cầu', 474, {
    width, maxWidth: 1400, size: 22, minSize: 18, color: charcoal
  });
  drawCenteredText(ctx, 'KIỂM TRA HỌC TẬP', 526, {
    width, maxWidth: 1450, size: 31, minSize: 24, weight: '700', color: navy
  });
  drawCenteredText(ctx, 'NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII', 568, {
    width, maxWidth: 1500, size: 27, minSize: 20, weight: '600', color: charcoal
  });

  const resultWidth = 1030;
  const resultX = (width - resultWidth) / 2;
  ctx.fillStyle = '#FBF9F2';
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.5;
  ctx.fillRect(resultX, 606, resultWidth, 64);
  ctx.strokeRect(resultX, 606, resultWidth, 64);
  drawCenteredText(ctx, `Kết quả: ${correctCount}/${totalQuestions} câu đúng · ${score}% · ĐẠT YÊU CẦU`, 638, {
    width, maxWidth: resultWidth - 38, size: 24, minSize: 18, weight: '600', color: navy
  });

  drawCenteredText(ctx, `Ngày hoàn thành: ${formatCertificateDate(issuedAt)}`, 718, {
    width, maxWidth: 1400, size: 20, minSize: 18, color: muted
  });
  drawCenteredText(ctx, `Mã chứng nhận: ${certificateCode}`, 756, {
    width, maxWidth: 1400, size: 19, minSize: 16, weight: '600', color: charcoal
  });

  const verifyUrl = `${origin}/xac-minh-chung-nhan/${certificateCode}`;
  const qrSize = 248;
  drawQr(ctx, verifyUrl, 128, 826, qrSize);
  drawCenteredText(ctx, 'Quét để xác minh', 1094, {
    width, centerX: 128 + qrSize / 2, maxWidth: qrSize + 10, size: 15, minSize: 13, color: muted
  });

  drawCenteredText(ctx, 'BAN THANH NIÊN', height - 270, {
    width: width - 142, maxWidth: 620, size: 27, minSize: 22, weight: '700', color: navy, align: 'right'
  });
  drawCenteredText(ctx, 'CÔNG AN TỈNH PHÚ THỌ', height - 226, {
    width: width - 142, maxWidth: 700, size: 28, minSize: 22, weight: '700', color: navy, align: 'right'
  });
  drawCenteredText(ctx, 'Chứng nhận điện tử ghi nhận kết quả hoàn thành bài kiểm tra trên hệ thống.', height - 70, {
    width, maxWidth: 1470, size: 15, minSize: 12, color: muted
  });
}

export async function generateCertificatePngDataUrl(certificate, options = {}) {
  const canvas = document.createElement('canvas');
  await renderCertificateToCanvas(canvas, certificate, options);
  return canvas.toDataURL('image/png');
}

export async function generateCertificatePngBlob(certificate, options = {}) {
  const canvas = document.createElement('canvas');
  await renderCertificateToCanvas(canvas, certificate, options);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode certificate PNG.');
  return blob;
}

export async function downloadCertificatePng(certificate) {
  if (!isValidNqCertificateRecord(certificate)) {
    throw new TypeError('A complete certificate record is required to download a certificate.');
  }
  const blob = await generateCertificatePngBlob(certificate);
  const { fullName } = mapNqCertificateRecord(certificate);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = sanitizeCertificateFileName(fullName);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
