import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

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
      <main className="login-shell">
        <section className="login-card" aria-labelledby="login-title">
          <header className="login-hero">
            <img src="/brand/logo-doan.jpg" alt="Logo Đoàn Thanh niên Việt Nam" />
            <div>
              <h1 id="login-title">Sổ tay Đoàn viên số</h1>
              <p>Nền tảng công tác Đoàn của tuổi trẻ Công an tỉnh Phú Thọ</p>
            </div>
          </header>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="status status-danger login-error" role="alert">{error}</div>}

          <label className="form-field" htmlFor="login-email">
            <span>Email</span>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Nhập email"
            />
          </label>

          <label className="form-field" htmlFor="login-password">
            <span>Mật khẩu</span>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </label>

          <button type="button" className="login-forgot" onClick={() => navigate('/quen-mat-khau')}>
            Quên mật khẩu?
          </button>

          <button type="submit" className="button button-primary login-submit" disabled={loading}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="login-note">Hệ thống lưu hành nội bộ. Sử dụng tài khoản do đơn vị cấp.</p>
        </section>

        <aside className="organization-card">
          <img src="/brand/logo-doan.jpg" alt="" />
          <div>
            <strong>Ban Thanh niên Công an tỉnh Phú Thọ</strong>
            <span>Sổ tay Đoàn viên số</span>
          </div>
        </aside>
      </main>
    </div>
  );
};
