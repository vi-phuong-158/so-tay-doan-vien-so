import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { createNqQuizService, NQ_QUIZ_ID, formatCertificateDate } from '../services/nqQuizService';
import { Icon } from '../components/Icon';
import { Button } from '../components/common';

const service = createNqQuizService(supabase);

export function CertificateVerification() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();

  const [inputCode, setInputCode] = useState(() => (routeCode || '').toUpperCase());
  const [loading, setLoading] = useState(Boolean(routeCode));
  const [result, setResult] = useState(null);
  const [hasSearched, setHasSearched] = useState(Boolean(routeCode));

  const [prevRouteCode, setPrevRouteCode] = useState(routeCode);
  if (routeCode !== prevRouteCode) {
    setPrevRouteCode(routeCode);
    setInputCode((routeCode || '').toUpperCase());
    setLoading(Boolean(routeCode));
    setHasSearched(Boolean(routeCode));
    if (!routeCode) {
      setResult(null);
    }
  }

  useEffect(() => {
    let active = true;
    const trimmed = (routeCode || '').trim().toUpperCase();
    if (!trimmed) return undefined;

    service
      .verifyCertificate(trimmed)
      .then((res) => {
        if (active) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setResult({
            valid: false,
            error: err.message || 'Lỗi kết nối khi xác minh chứng nhận.'
          });
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [routeCode]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    const trimmed = inputCode.trim().toUpperCase();
    if (!trimmed) return;
    navigate(`/xac-minh-chung-nhan/${trimmed}`);
  }

  return (
    <div className="page nq-verify-page">
      <div className="nq-verify-container">
        {/* Navigation / Header */}
        <div className="nq-verify-header">
          <Link to="/" className="nq-verify-back-link">
            <Icon name="chevron-left" size={18} />
            <span>Trang chủ</span>
          </Link>
          <h1 className="nq-verify-title">Xác minh Chứng nhận điện tử</h1>
          <p className="nq-verify-subtitle">
            Hệ thống xác thực kết quả học tập Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII — Tuổi trẻ Công an tỉnh Phú Thọ
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearchSubmit} className="nq-verify-search-form">
          <div className="nq-verify-search-input-wrap">
            <Icon name="search" size={20} className="nq-verify-search-icon" />
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="Nhập mã chứng nhận (VD: NQ13-XXXXXXXX)"
              className="nq-verify-search-input"
              aria-label="Mã chứng nhận cần xác minh"
            />
          </div>
          <Button type="submit" variant="primary" disabled={loading || !inputCode.trim()}>
            {loading ? 'Đang kiểm tra...' : 'Tra cứu'}
          </Button>
        </form>

        {/* Content State */}
        {loading && (
          <div className="nq-verify-card nq-verify-loading">
            <div className="nq-verify-spinner" />
            <p>Đang tra cứu dữ liệu chứng nhận từ hệ thống...</p>
          </div>
        )}

        {!loading && hasSearched && result && (
          <>
            {result.valid ? (
              <div className="nq-verify-card nq-verify-success-card" id="nq-verified-result">
                <div className="nq-verify-status-banner nq-verify-status-valid">
                  <div className="nq-verify-status-icon-wrap">
                    <Icon name="shield" size={28} />
                  </div>
                  <div>
                    <h2 className="nq-verify-status-heading">CHỨNG NHẬN HỢP LỆ</h2>
                    <p className="nq-verify-status-sub">Thông tin chứng nhận đã được hệ thống xác thực chính thức</p>
                  </div>
                </div>

                <div className="nq-verify-cert-body">
                  <div className="nq-verify-activity-badge">
                    <Icon name="school" size={16} />
                    <span>KIỂM TRA HỌC TẬP NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII</span>
                  </div>

                  <div className="nq-verify-grid">
                    <div className="nq-verify-field">
                      <span className="nq-verify-label">Họ và tên</span>
                      <span className="nq-verify-value nq-verify-name">{result.full_name}</span>
                    </div>

                    <div className="nq-verify-field">
                      <span className="nq-verify-label">Đơn vị</span>
                      <span className="nq-verify-value">{result.organization_name}</span>
                    </div>

                    <div className="nq-verify-field">
                      <span className="nq-verify-label">Mã chứng nhận</span>
                      <span className="nq-verify-value nq-verify-code-mono">{result.code || result.certificate_code}</span>
                    </div>

                    <div className="nq-verify-field">
                      <span className="nq-verify-label">Kết quả đánh giá</span>
                      <span className="nq-verify-value nq-verify-result-highlight">
                        {result.score}% ({result.correct_count}/{result.total_questions || 30} câu đúng) — <strong>ĐẠT</strong>
                      </span>
                    </div>

                    <div className="nq-verify-field">
                      <span className="nq-verify-label">Thời gian hoàn thành</span>
                      <span className="nq-verify-value">{formatCertificateDate(result.issued_at)}</span>
                    </div>

                    <div className="nq-verify-field">
                      <span className="nq-verify-label">Đơn vị ghi nhận</span>
                      <span className="nq-verify-value">BAN THANH NIÊN CÔNG AN TỈNH PHÚ THỌ</span>
                    </div>
                  </div>
                </div>

                <div className="nq-verify-actions">
                  <Link to={`/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}`}>
                    <Button variant="secondary">
                      <Icon name="school" size={18} />
                      <span>Tham gia bài thi</span>
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setInputCode('');
                      navigate('/xac-minh-chung-nhan');
                    }}
                  >
                    <span>Tra cứu mã khác</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="nq-verify-card nq-verify-invalid-card" id="nq-verified-result">
                <div className="nq-verify-status-banner nq-verify-status-invalid">
                  <div className="nq-verify-status-icon-wrap invalid">
                    <Icon name="alert" size={28} />
                  </div>
                  <div>
                    <h2 className="nq-verify-status-heading">CHỨNG NHẬN KHÔNG HỢP LỆ HOẶC KHÔNG TỒN TẠI</h2>
                    <p className="nq-verify-status-sub">
                      {result.message || result.error || 'Mã chứng nhận không được tìm thấy trong hệ thống.'}
                    </p>
                  </div>
                </div>

                <div className="nq-verify-invalid-body">
                  <p>
                    Mã <strong>{routeCode || inputCode}</strong> không tương ứng với chứng nhận hoàn thành bài kiểm tra học tập Nghị quyết ĐH Đoàn XIII hợp lệ nào.
                  </p>
                  <p className="nq-verify-invalid-hint">
                    Vui lòng kiểm tra lại mã được in trên chứng nhận hoặc mã quét từ QR Code. Nếu bạn đã hoàn thành bài thi đạt từ 80%, chứng nhận được cấp tự động sau khi nộp bài.
                  </p>
                </div>

                <div className="nq-verify-actions">
                  <Link to={`/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}`}>
                    <Button variant="primary">
                      <Icon name="arrow" size={18} />
                      <span>Bắt đầu bài kiểm tra</span>
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !hasSearched && (
          <div className="nq-verify-guide-card">
            <h3 className="nq-verify-guide-title">Hướng dẫn tra cứu chứng nhận</h3>
            <ul className="nq-verify-guide-list">
              <li>Mỗi chứng nhận hoàn thành bài kiểm tra học tập Nghị quyết có một mã định danh duy nhất (ví dụ: <code>NQ13-ABCDEF12</code>).</li>
              <li>Bạn có thể quét mã QR in trên chứng nhận điện tử để mở trang xác thực tự động.</li>
              <li>Hoặc nhập trực tiếp mã chứng nhận vào ô tìm kiếm ở trên để đối soát thông tin người học, đơn vị, điểm số và ngày cấp.</li>
              <li>Chứng nhận chỉ được cấp khi người dự thi đạt kết quả từ 80% (tối thiểu 24/30 câu đúng).</li>
            </ul>
            <div className="nq-verify-actions" style={{ marginTop: '20px' }}>
              <Link to={`/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}`}>
                <Button variant="primary">
                  <span>Tham gia bài thi ngay</span>
                  <Icon name="arrow" size={18} />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
