import { useState, useId, useLayoutEffect, useRef, useCallback } from 'react';
import { Icon } from './Icon';
import { Button } from './common';
import { generateQrMatrix } from '../lib/qrCode';
import {
  CERTIFICATE_SIGNATURE_SIZE,
  CERTIFICATE_SIGNATURE_SRC,
  CERTIFICATE_VERDICT_TEXT,
  CERTIFICATE_WATERMARK_OPACITY,
  downloadCertificatePng
} from '../lib/certificateCanvas';
import {
  formatCertificateDate,
  isValidNqCertificateRecord,
  mapNqCertificateRecord
} from '../services/nqQuizService';

// Design size of the HTML certificate (A4 landscape ratio). It is scaled as one block to the available
// width, so every viewport shows the same layout as the PNG/PDF instead of scrolling sideways.
const CERTIFICATE_DESIGN_WIDTH = 860;

export function NqCertificate({ certificate, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [assetError, setAssetError] = useState('');
  const [loadedAssets, setLoadedAssets] = useState({ watermark: false, logo: false, signature: false });
  const [scale, setScale] = useState(1);
  const fitRef = useRef(null);
  const qrContainerId = useId();

  useLayoutEffect(() => {
    const node = fitRef.current;
    if (!node) return undefined;
    const update = () => {
      const available = node.clientWidth;
      if (available > 0) setScale(Math.min(1, available / CERTIFICATE_DESIGN_WIDTH));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [certificate]);

  // Cached images can finish before React sees the load event, so check `complete` as well.
  const trackAsset = useCallback((asset) => (node) => {
    if (!node || !node.complete) return;
    if (node.naturalWidth > 0) setLoadedAssets((current) => (current[asset] ? current : { ...current, [asset]: true }));
    else setAssetError('failed');
  }, []);

  if (!isValidNqCertificateRecord(certificate)) return null;

  const { fullName, organizationName, score, correctCount, totalQuestions, certificateCode, issuedAt } =
    mapNqCertificateRecord(certificate);

  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/xac-minh-chung-nhan/${certificateCode}`;
  const qrMatrix = generateQrMatrix(verifyUrl);
  const formattedDate = formatCertificateDate(issuedAt);
  const assetsReady = Object.values(loadedAssets).every(Boolean) && !assetError;
  const assetsLoading = !assetsReady && !assetError;

  const markAssetLoaded = (asset) => {
    setLoadedAssets((current) => ({ ...current, [asset]: true }));
  };

  const markAssetFailed = () => setAssetError('failed');

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
    <div
      className="nq-certificate-wrapper"
      data-assets-ready={assetsReady ? 'true' : 'false'}
      role="group" aria-label="Chứng nhận hoàn thành">
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
        {assetsLoading && (
          <p className="nq-certificate-asset-note" role="status">
            Đang tải logo và chữ ký chính thức… Nút tải ảnh và in sẽ sáng lên khi chứng nhận đầy đủ.
          </p>
        )}
        {(assetError || downloadError) && (
          <div className="form-error" role="alert">
            {assetError
              ? 'Không thể tải logo hoặc chữ ký chính thức. Vui lòng kiểm tra kết nối, tải lại trang rồi mới tải ảnh hoặc in chứng nhận.'
              : downloadError}
          </div>
        )}
      </div>

      <div className="nq-certificate-viewport" ref={fitRef}>
        <div className="nq-certificate-fit" style={{ '--cert-scale': scale }}>
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
                style={{ opacity: CERTIFICATE_WATERMARK_OPACITY }}
                ref={trackAsset('watermark')}
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
                  ref={trackAsset('logo')}
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

                <p className="nq-certificate-verdict-intro">{CERTIFICATE_VERDICT_TEXT}</p>

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
                    src={CERTIFICATE_SIGNATURE_SRC}
                    alt="Con dấu và chữ ký chính thức"
                    className="nq-certificate-signature"
                    width={CERTIFICATE_SIGNATURE_SIZE.width}
                    height={CERTIFICATE_SIGNATURE_SIZE.height}
                    ref={trackAsset('signature')}
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
    </div>
  );
}
