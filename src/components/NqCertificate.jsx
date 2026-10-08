import { useState, useId } from 'react';
import { Icon } from './Icon';
import { Button } from './common';
import { generateQrMatrix } from '../lib/qrCode';
import { downloadCertificatePng } from '../lib/certificateCanvas';
import {
  formatCertificateDate,
  isValidNqCertificateRecord,
  mapNqCertificateRecord
} from '../services/nqQuizService';

export function NqCertificate({ certificate, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const qrContainerId = useId();

  if (!isValidNqCertificateRecord(certificate)) return null;

  const { fullName, organizationName, score, correctCount, totalQuestions, certificateCode, issuedAt } =
    mapNqCertificateRecord(certificate);

  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/xac-minh-chung-nhan/${certificateCode}`;
  const qrMatrix = generateQrMatrix(verifyUrl);
  const formattedDate = formatCertificateDate(issuedAt);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setDownloadError('');
      await downloadCertificatePng(certificate);
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
                <p className="nq-certificate-eyebrow">CHỨNG NHẬN</p>
                <h1 className="nq-certificate-title">HOÀN THÀNH</h1>
                <div className="nq-certificate-divider" aria-hidden="true" />
                <p className="nq-certificate-subtitle">BAN THANH NIÊN · CÔNG AN TỈNH PHÚ THỌ</p>
              </header>

              <main className="nq-certificate-body">
                <div className="nq-certificate-recipient">
                  <p className="nq-certificate-recipient-label">Đồng chí</p>
                  <strong className="nq-certificate-name">{fullName}</strong>
                  <p className="nq-certificate-org">{organizationName}</p>
                </div>

                <p className="nq-certificate-verdict-intro">đã hoàn thành đạt yêu cầu</p>

                <div className="nq-certificate-activity">
                  <h2 className="nq-certificate-activity-title">KIỂM TRA HỌC TẬP</h2>
                  <h3 className="nq-certificate-activity-subtitle">
                    NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII
                  </h3>
                </div>

                <div className="nq-certificate-badge">
                  <span>Kết quả: <strong>{correctCount}/{totalQuestions} câu đúng · {score}% · ĐẠT YÊU CẦU</strong></span>
                </div>

                <div className="nq-certificate-meta">
                  <p><span>Ngày hoàn thành</span><strong>{formattedDate}</strong></p>
                  <p><span>Mã chứng nhận</span><strong>{certificateCode}</strong></p>
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
                      viewBox={`0 0 ${qrMatrix.length + 8} ${qrMatrix.length + 8}`}
                      width="124"
                      height="124"
                      shapeRendering="crispEdges"
                    >
                      <rect width={qrMatrix.length + 8} height={qrMatrix.length + 8} fill="#ffffff" />
                      {qrMatrix.map((row, r) =>
                        row.map((cell, c) =>
                          cell ? (
                            <rect
                              key={`${r}-${c}`}
                              x={c + 4}
                              y={r + 4}
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
