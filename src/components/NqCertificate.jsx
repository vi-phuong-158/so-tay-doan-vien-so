import { useState, useId } from 'react';
import { Icon } from './Icon';
import { Button } from './common';
import { generateQrMatrix } from '../lib/qrCode';
import { downloadCertificatePng } from '../lib/certificateCanvas';
import { formatCertificateDate } from '../services/nqQuizService';

export function NqCertificate({ certData, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const qrContainerId = useId();

  if (!certData) return null;

  const {
    fullName = '',
    organizationName = '',
    score = 80,
    correctCount = 24,
    totalQuestions = 30,
    certificateCode = '',
    issuedAt = new Date()
  } = certData;

  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/xac-minh-chung-nhan/${certificateCode}`;
  const qrMatrix = generateQrMatrix(verifyUrl);
  const formattedDate = formatCertificateDate(issuedAt);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setDownloadError('');
      await downloadCertificatePng(certData);
    } catch {
      setDownloadError('Không thể tạo file ảnh. Vui lòng thử chức năng In / Lưu PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="nq-certificate-wrapper" role="dialog" aria-modal="true" aria-label="Chứng nhận hoàn thành">
      <div className="nq-certificate-toolbar no-print">
        <div className="nq-certificate-toolbar-actions">
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Tải chứng nhận dạng ảnh PNG"
          >
            <Icon name="download" size={16} />
            {downloading ? 'Đang tạo PNG…' : 'Tải chứng nhận (PNG)'}
          </Button>
          <Button
            variant="secondary"
            onClick={handlePrint}
            aria-label="In hoặc lưu chứng nhận dạng PDF"
          >
            <Icon name="printer" size={16} />
            In / Lưu PDF
          </Button>
          {onClose && (
            <Button
              variant="secondary"
              onClick={onClose}
              aria-label="Đóng cửa sổ chứng nhận"
            >
              <Icon name="x" size={16} />
              Đóng
            </Button>
          )}
        </div>
        {downloadError && (
          <div className="form-error" role="alert">
            {downloadError}
          </div>
        )}
      </div>

      <div className="nq-certificate-scrollable">
        <article className="nq-certificate" id="nq-certificate-document">
          <div className="nq-certificate-border-outer">
            <div className="nq-certificate-border-inner">
              {/* Corner decorative anchors */}
              <div className="nq-corner nq-corner-tl" aria-hidden="true" />
              <div className="nq-corner nq-corner-tr" aria-hidden="true" />
              <div className="nq-corner nq-corner-bl" aria-hidden="true" />
              <div className="nq-corner nq-corner-br" aria-hidden="true" />

              <header className="nq-certificate-header">
                <img
                  src="/brand/logo-doan-badge.png"
                  alt="Huy hiệu Đoàn TNCS Hồ Chí Minh"
                  className="nq-certificate-logo"
                  width="120"
                  height="64"
                />
                <h1 className="nq-certificate-title">CHỨNG NHẬN HOÀN THÀNH</h1>
                <div className="nq-certificate-divider" aria-hidden="true" />
                <p className="nq-certificate-subtitle">Ban Thanh niên Công an tỉnh Phú Thọ xác nhận</p>
              </header>

              <main className="nq-certificate-body">
                <div className="nq-certificate-recipient">
                  <strong className="nq-certificate-name">{fullName || 'ĐỒNG CHÍ DỰ THI'}</strong>
                  <p className="nq-certificate-org">Đơn vị: {organizationName || 'Công an tỉnh Phú Thọ'}</p>
                </div>

                <p className="nq-certificate-verdict-intro">đã hoàn thành đạt yêu cầu</p>

                <div className="nq-certificate-activity">
                  <h2 className="nq-certificate-activity-title">KIỂM TRA HỌC TẬP</h2>
                  <h3 className="nq-certificate-activity-subtitle">
                    NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII
                  </h3>
                </div>

                <div className="nq-certificate-badge">
                  <span>
                    Kết quả: <strong>{correctCount}/{totalQuestions} câu đúng</strong> —{' '}
                    <strong>{score}%</strong> — <strong>ĐẠT YÊU CẦU</strong>
                  </span>
                </div>

                <div className="nq-certificate-meta">
                  <p>Ngày hoàn thành: <strong>{formattedDate}</strong></p>
                  <p>Mã chứng nhận: <strong>{certificateCode}</strong></p>
                </div>
              </main>

              <footer className="nq-certificate-footer">
                <div className="nq-certificate-qr-section">
                  <div
                    id={qrContainerId}
                    className="nq-certificate-qr"
                    role="img"
                    aria-label={`Mã QR xác minh chứng nhận ${certificateCode}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox={`0 0 ${qrMatrix.length + 2} ${qrMatrix.length + 2}`}
                      width="100"
                      height="100"
                      shapeRendering="crispEdges"
                    >
                      <rect width={qrMatrix.length + 2} height={qrMatrix.length + 2} fill="#ffffff" />
                      {qrMatrix.map((row, r) =>
                        row.map((cell, c) =>
                          cell ? (
                            <rect
                              key={`${r}-${c}`}
                              x={c + 1}
                              y={r + 1}
                              width="1"
                              height="1"
                              fill="#000000"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  </div>
                  <small>Quét để xác minh</small>
                </div>

                <div className="nq-certificate-signoff">
                  <strong>BAN THANH NIÊN</strong>
                  <strong>CÔNG AN TỈNH PHÚ THỌ</strong>
                </div>
              </footer>

              <div className="nq-certificate-disclaimer">
                Chứng nhận điện tử ghi nhận kết quả hoàn thành bài kiểm tra trên hệ thống.
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
