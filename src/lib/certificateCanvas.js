import { generateQrMatrix } from './qrCode.js';
import { formatCertificateDate, sanitizeCertificateFileName } from '../services/nqQuizService.js';

/**
 * Render the official digital certificate to an HTML5 Canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} certData
 * @param {object} options
 */
export async function renderCertificateToCanvas(canvas, certData, options = {}) {
  const {
    fullName = '',
    organizationName = '',
    score = 80,
    correctCount = 24,
    totalQuestions = 30,
    certificateCode = '',
    issuedAt = new Date(),
    logoSrc = '/brand/logo-doan-badge.png'
  } = certData;

  const width = options.width || 1754; // A4 landscape at 150 DPI
  const height = options.height || 1240;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.5, '#f8fbff');
  bgGrad.addColorStop(1, '#f0f6ff');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  const marginOuter = 36;
  const marginInner = 46;

  // Outer youth blue border
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 5;
  ctx.strokeRect(marginOuter, marginOuter, width - marginOuter * 2, height - marginOuter * 2);

  // Inner gold border
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2;
  ctx.strokeRect(marginInner, marginInner, width - marginInner * 2, height - marginInner * 2);

  // Corner accents
  const cornerSize = 20;
  ctx.fillStyle = '#1d4ed8';
  [
    [marginOuter, marginOuter],
    [width - marginOuter - cornerSize, marginOuter],
    [marginOuter, height - marginOuter - cornerSize],
    [width - marginOuter - cornerSize, height - marginOuter - cornerSize]
  ].forEach(([cx, cy]) => {
    ctx.fillRect(cx, cy, cornerSize, cornerSize);
  });

  // Load and draw Đoàn logo
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoSrc;
    await new Promise((resolve) => {
      logoImg.onload = resolve;
      logoImg.onerror = resolve; // Continue even if image fails to load
    });
    if (logoImg.width > 0) {
      const logoH = 80;
      const logoW = (logoImg.width / logoImg.height) * logoH;
      ctx.drawImage(logoImg, width / 2 - logoW / 2, 68, logoW, logoH);
    }
  } catch {
    // Proceed if logo image fails
  }

  // Typography
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title: CHỨNG NHẬN HOÀN THÀNH
  ctx.font = 'bold 44px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('CHỨNG NHẬN HOÀN THÀNH', width / 2, 195);

  // Gold separator line
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 160, 226);
  ctx.lineTo(width / 2 + 160, 226);
  ctx.stroke();

  // Confirmation note
  ctx.font = '500 22px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Ban Thanh niên Công an tỉnh Phú Thọ xác nhận', width / 2, 265);

  // Participant full name (prominent)
  ctx.font = 'bold 48px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText((fullName || 'ĐỒNG CHÍ DỰ THI').toUpperCase(), width / 2, 335);

  // Organization
  ctx.font = '500 24px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Đơn vị: ${organizationName || 'Công an tỉnh Phú Thọ'}`, width / 2, 395);

  // Text: đã hoàn thành đạt yêu cầu
  ctx.font = 'italic 20px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('đã hoàn thành đạt yêu cầu', width / 2, 445);

  // Assessment Title
  ctx.font = 'bold 30px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e40af';
  ctx.fillText('KIỂM TRA HỌC TẬP', width / 2, 500);

  ctx.font = 'bold 28px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e40af';
  ctx.fillText('NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII', width / 2, 545);

  // Result box
  const resY = 600;
  ctx.fillStyle = '#ecfdf5';
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 2;
  const boxW = 600;
  const boxH = 54;
  ctx.beginPath();
  ctx.roundRect(width / 2 - boxW / 2, resY, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#065f46';
  ctx.fillText(
    `Kết quả: ${correctCount}/${totalQuestions} câu đúng — ${score}% — ĐẠT YÊU CẦU`,
    width / 2,
    resY + boxH / 2
  );

  // Completion Date & Certificate Code
  const formattedDate = formatCertificateDate(issuedAt);
  ctx.font = '500 20px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Ngày hoàn thành: ${formattedDate}`, width / 2, 695);

  ctx.font = '600 21px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(`Mã chứng nhận: ${certificateCode}`, width / 2, 735);

  // Bottom section:
  // Left: QR Code linking to verification
  const qrX = 140;
  const qrY = 820;
  const qrSize = 180;
  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/xac-minh-chung-nhan/${certificateCode}`;

  try {
    const qrMatrix = generateQrMatrix(verifyUrl);
    const modCount = qrMatrix.length;
    const modSize = qrSize / (modCount + 4);

    // QR Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = '#000000';
    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qrMatrix[r][c]) {
          ctx.fillRect(
            Math.round(qrX + (c + 2) * modSize),
            Math.round(qrY + (r + 2) * modSize),
            Math.ceil(modSize),
            Math.ceil(modSize)
          );
        }
      }
    }

    ctx.textAlign = 'center';
    ctx.font = '14px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Quét để xác minh', qrX + qrSize / 2, qrY + qrSize + 24);
  } catch {
    // Proceed if QR generation fails
  }

  // Right: Footer Organization
  const footerX = width - 360;
  const footerY = 870;

  ctx.textAlign = 'center';
  ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('BAN THANH NIÊN', footerX, footerY);

  ctx.font = 'bold 26px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('CÔNG AN TỈNH PHÚ THỌ', footerX, footerY + 38);

  // Very bottom notice
  ctx.textAlign = 'center';
  ctx.font = '15px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    'Chứng nhận điện tử ghi nhận kết quả hoàn thành bài kiểm tra trên hệ thống.',
    width / 2,
    height - 58
  );
}

/**
 * Generate PNG data URL from certificate data.
 * @param {object} certData
 * @returns {Promise<string>}
 */
export async function generateCertificatePngDataUrl(certData) {
  const canvas = document.createElement('canvas');
  await renderCertificateToCanvas(canvas, certData);
  return canvas.toDataURL('image/png');
}

/**
 * Download certificate as a high-quality PNG file.
 * @param {object} certData
 */
export async function downloadCertificatePng(certData) {
  const dataUrl = await generateCertificatePngDataUrl(certData);
  const fileName = sanitizeCertificateFileName(certData.fullName);

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
