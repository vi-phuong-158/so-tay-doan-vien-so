import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Icon } from '../../components/Icon';
import { Brand } from '../../components/common';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: loginError } = await login(email, password);
      if (loginError) {
        setError('Thông tin đăng nhập không chính xác hoặc tài khoản bị khóa.');
        return;
      }
      navigate(from, { replace: true });
    } catch {
      setError('Thông tin đăng nhập không chính xác hoặc tài khoản bị khóa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <section className="login-brand" aria-label="Giới thiệu Sổ tay Đoàn viên số">
        <p className="login-kicker">TUỔI TRẺ CÔNG AN TỈNH PHÚ THỌ</p>
        <h2>Tri thức và công việc Đoàn, trong một điểm đến.</h2>
        <p>Tra cứu nội dung đã công bố và mở các chức năng dành cho tài khoản được cấp quyền.</p>
        <div className="login-values" aria-label="Các khu vực chính">
          <span><Icon name="book" size={17} /> Tri thức công khai</span>
          <span><Icon name="work" size={17} /> Công việc Đoàn</span>
          <span><Icon name="bulb" size={17} /> Đổi mới sáng tạo</span>
        </div>
      </section>

      <section className="login-card form-card" aria-labelledby="login-title">
        <Brand compact />
        <div className="login-card-heading">
          <h1 id="login-title">Đăng nhập</h1>
          <p>Dùng tài khoản đã được cấp để tiếp tục.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="status status-danger" role="alert">{error}</div>}

          <label className="form-field" htmlFor="login-email">
            <span>Email</span>
            <input id="login-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Nhập email" />
          </label>

          <label className="form-field" htmlFor="login-password">
            <span>Mật khẩu</span>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu" />
          </label>

          <button type="button" className="link-button" onClick={() => navigate('/quen-mat-khau')}>
            Quên mật khẩu?
          </button>

          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="auth-note">Hệ thống lưu hành nội bộ. Yêu cầu đăng nhập bằng tài khoản được cấp.</p>
      </section>
    </div>
  );
};
