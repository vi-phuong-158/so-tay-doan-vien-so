import { generateQrMatrix, QR_QUIET_ZONE } from './qrCode.js';
import {
  formatCertificateDate,
  isValidNqCertificateRecord,
  mapNqCertificateRecord,
  sanitizeCertificateFileName
} from '../services/nqQuizService.js';

export const CERTIFICATE_PALETTE = Object.freeze({
  navy: '#073B8C',
  blue: '#1257C4',
  paleBlue: '#DCEBFF',
  softBlue: '#F2F7FF',
  charcoal: '#1F2937',
  muted: '#667085',
  paper: '#FFFFFF',
  white: '#FFFFFF',
  qr: '#111827'
});

const FONT_FAMILY = '"Be Vietnam Pro", sans-serif';
const BRAND_BADGE_SRC = '/brand/logo-doan-badge.png';
// Browser-facing seal + signature derivative (cropped, downscaled, aspect preserved). The raw
// owner source lives in design-source/ and is never published; see docs/quiz-300/NQ13_CERTIFICATE_ACCEPTANCE.md.
export const CERTIFICATE_SIGNATURE_SRC = new URL('../assets/certificate/chu-ky-certificate.png', import.meta.url).href;
export const CERTIFICATE_SIGNATURE_SIZE = Object.freeze({ width: 1000, height: 452 });

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

function loadImage(src, label) {
  if (typeof Image === 'undefined') {
    return Promise.reject(new Error(`Không thể tải ${label} để tạo chứng nhận.`));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if ((image.naturalWidth || image.width) > 0 && (image.naturalHeight || image.height) > 0) {
        resolve(image);
      } else {
        reject(new Error(`Ảnh ${label} không hợp lệ.`));
      }
    };
    image.onerror = () => reject(new Error(`Không thể tải ${label}. Vui lòng thử lại.`));
    image.src = src;
  });
}

function drawLogo(ctx, logo, width) {
  const logoHeight = 76;
  const logoWidth = (logo.naturalWidth / logo.naturalHeight) * logoHeight;
  ctx.drawImage(logo, (width - logoWidth) / 2, 64, logoWidth, logoHeight);
}

function drawWatermark(ctx, logo, width, height) {
  const watermarkHeight = height * 0.46;
  const watermarkWidth = (logo.naturalWidth / logo.naturalHeight) * watermarkHeight;
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.045;
  ctx.drawImage(logo, (width - watermarkWidth) / 2, (height - watermarkHeight) / 2, watermarkWidth, watermarkHeight);
  ctx.globalAlpha = previousAlpha;
}

// The derivative is already tight-cropped, so it is only scaled uniformly ("contain"): the seal and
// signature are never cropped, stretched or separated, matching the HTML viewer's object-fit: contain.
function drawSignature(ctx, signature, centerX, centerY, maxWidth, maxHeight) {
  const sourceWidth = signature.naturalWidth || signature.width;
  const sourceHeight = signature.naturalHeight || signature.height;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(signature, centerX - width / 2, centerY - height / 2, width, height);
}

function drawCertificateBorder(ctx, width, height) {
  const { navy, blue, paleBlue, paper } = CERTIFICATE_PALETTE;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = navy;
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 38, width - 76, height - 76);
  ctx.strokeStyle = paleBlue;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(52, 52, width - 104, height - 104);

  const corners = [
    [62, 62, 1, 1],
    [width - 62, 62, -1, 1],
    [62, height - 62, 1, -1],
    [width - 62, height - 62, -1, -1]
  ];
  ctx.strokeStyle = blue;
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

  const logo = await loadImage(options.logoSrc ?? BRAND_BADGE_SRC, 'huy hiệu Đoàn');
  const signature = await loadImage(options.signatureSrc ?? CERTIFICATE_SIGNATURE_SRC, 'chữ ký và con dấu');
  drawWatermark(ctx, logo, width, height);
  drawLogo(ctx, logo, width);

  const { navy, blue, charcoal, muted, paleBlue } = CERTIFICATE_PALETTE;
  drawCenteredText(ctx, 'BAN THANH NIÊN', 168, {
    width, maxWidth: 1500, size: 20, minSize: 17, weight: '700', color: navy
  });
  drawCenteredText(ctx, 'CÔNG AN TỈNH PHÚ THỌ', 198, {
    width, maxWidth: 1500, size: 17, minSize: 15, weight: '600', color: muted
  });
  ctx.strokeStyle = paleBlue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 110, 222);
  ctx.lineTo(width / 2 + 110, 222);
  ctx.stroke();
  drawCenteredText(ctx, 'CHỨNG NHẬN HOÀN THÀNH', 267, {
    width, maxWidth: 1500, size: 39, minSize: 31, weight: '700', color: navy
  });

  drawCenteredText(ctx, 'Đồng chí', 324, {
    width, maxWidth: 1400, size: 21, minSize: 19, color: muted
  });
  drawWrappedCenterText(ctx, fullName.toLocaleUpperCase('vi-VN'), 380, {
    width, maxWidth: 1500, size: 44, minSize: 30, weight: '700', color: navy, maxLines: 2, lineHeight: 46
  });
  drawWrappedCenterText(ctx, organizationName, 434, {
    width, maxWidth: 1450, size: 23, minSize: 17, weight: '500', color: charcoal, maxLines: 2, lineHeight: 29
  });
  drawCenteredText(ctx, 'đã hoàn thành và đạt yêu cầu', 485, {
    width, maxWidth: 1400, size: 22, minSize: 18, color: charcoal
  });
  drawCenteredText(ctx, 'KIỂM TRA HỌC TẬP', 533, {
    width, maxWidth: 1450, size: 30, minSize: 24, weight: '700', color: blue
  });
  drawCenteredText(ctx, 'NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII', 571, {
    width, maxWidth: 1500, size: 27, minSize: 20, weight: '600', color: charcoal
  });
  drawCenteredText(ctx, `Kết quả: ${correctCount}/${totalQuestions} câu đúng · ${score}% · ĐẠT YÊU CẦU`, 624, {
    width, maxWidth: 1500, size: 23, minSize: 18, weight: '600', color: navy
  });
  drawCenteredText(ctx, `Ngày hoàn thành: ${formatCertificateDate(issuedAt)}`, 684, {
    width, maxWidth: 1400, size: 19, minSize: 17, color: muted
  });

  const verifyUrl = `${origin}/xac-minh-chung-nhan/${certificateCode}`;
  const qrSize = 226;
  drawQr(ctx, verifyUrl, 118, 850, qrSize);
  drawCenteredText(ctx, 'Quét để xác minh', 1098, {
    width, centerX: 118 + qrSize / 2, maxWidth: qrSize + 10, size: 15, minSize: 13, color: muted
  });
  drawCenteredText(ctx, certificateCode, 1124, {
    width, centerX: 118 + qrSize / 2, maxWidth: qrSize + 24, size: 17, minSize: 14, weight: '700', color: navy
  });
  drawCenteredText(ctx, formatCertificateDate(issuedAt), 1150, {
    width, centerX: 118 + qrSize / 2, maxWidth: qrSize + 24, size: 16, minSize: 14, color: muted
  });

  const signoffCenter = width - 402;
  drawCenteredText(ctx, 'TM. BAN THANH NIÊN', 850, {
    width, centerX: signoffCenter, maxWidth: 640, size: 24, minSize: 20, weight: '700', color: navy
  });
  drawCenteredText(ctx, 'TRƯỞNG BAN', 885, {
    width, centerX: signoffCenter, maxWidth: 640, size: 22, minSize: 19, weight: '700', color: navy
  });
  drawSignature(ctx, signature, signoffCenter, 990, 420, 184);
  drawCenteredText(ctx, 'Hoàng Tuấn Việt', 1101, {
    width, centerX: signoffCenter, maxWidth: 520, size: 26, minSize: 22, weight: '700', color: navy
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
