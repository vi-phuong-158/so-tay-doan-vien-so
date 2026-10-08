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
  const [assetError, setAssetError] = useState('');
  const [loadedAssets, setLoadedAssets] = useState({ watermark: false, logo: false, signature: false });
  const qrContainerId = useId();

  if (!isValidNqCertificateRecord(certificate)) return null;

  const { fullName, organizationName, score, correctCount, totalQuestions, certificateCode, issuedAt } =
    mapNqCertificateRecord(certificate);

  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/xac-minh-chung-nhan/${certificateCode}`;
  const qrMatrix = generateQrMatrix(verifyUrl);
  const formattedDate = formatCertificateDate(issuedAt);
  const assetsReady = Object.values(loadedAssets).every(Boolean) && !assetError;

  const markAssetLoaded = (asset) => {
    setLoadedAssets((current) => ({ ...current, [asset]: true }));
  };

  const markAssetFailed = () => {
    setAssetError('Không thể tải logo hoặc chữ ký chính thức. Vui lòng tải lại trang trước khi tải ảnh hoặc in chứng nhận.');
  };

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
            disabled={downloading || !assetsReady}
            aria-label="Tải chứng nhận dạng ảnh PNG"
          >
            <Icon name="download" size={16} />
            {downloading ? 'Đang tạo PNG…' : 'Tải chứng nhận (PNG)'}
          </Button>
          <Button
            variant="secondary"
            onClick={handlePrint}
            disabled={!assetsReady}
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
        {(assetError || downloadError) && (
          <div className="form-error" role="alert">
            {assetError || downloadError}
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

              <img
                src="/brand/logo-doan-badge.png"
                alt=""
                aria-hidden="true"
                className="nq-certificate-watermark"
                onLoad={() => markAssetLoaded('watermark')}
                onError={markAssetFailed}
              />

              <header className="nq-certificate-header">
                <img
                  src="/brand/logo-doan-badge.png"
                  alt="Huy hiệu Đoàn TNCS Hồ Chí Minh"
                  className="nq-certificate-logo"
                  width="120"
                  height="64"
                  onLoad={() => markAssetLoaded('logo')}
                  onError={markAssetFailed}
                />
                <p className="nq-certificate-eyebrow">BAN THANH NIÊN</p>
                <p className="nq-certificate-subtitle">CÔNG AN TỈNH PHÚ THỌ</p>
                <div className="nq-certificate-divider" aria-hidden="true" />
                <h1 className="nq-certificate-title">CHỨNG NHẬN HOÀN THÀNH</h1>
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

                <p className="nq-certificate-result">
                  Kết quả: <strong>{correctCount}/{totalQuestions} câu đúng · {score}% · ĐẠT YÊU CẦU</strong>
                </p>
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
                  <strong className="nq-certificate-code">{certificateCode}</strong>
                  <span className="nq-certificate-date">Hoàn thành ngày {formattedDate}</span>
                </div>

                <div className="nq-certificate-signoff">
                  <strong className="nq-certificate-signer-role">TM. BAN THANH NIÊN</strong>
                  <strong className="nq-certificate-signer-title">TRƯỞNG BAN</strong>
                  <img
                    src="/brand/chu-ky.png"
                    alt="Con dấu và chữ ký chính thức"
                    className="nq-certificate-signature"
                    onLoad={() => markAssetLoaded('signature')}
                    onError={markAssetFailed}
                  />
                  <strong className="nq-certificate-signer-name">Hoàng Tuấn Việt</strong>
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
