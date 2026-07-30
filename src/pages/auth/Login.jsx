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

    const { error: loginError } = await login(email, password);

    if (loginError) {
      setError('Thông tin đăng nhập không chính xác hoặc tài khoản bị khóa.');
      setLoading(false);
    } else {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="page login-page">
      <div className="login-card form-card">
        <div className="brand" style={{ marginBottom: '24px' }}>
          <img src="/brand/app-icon.svg" alt="Sổ tay Đoàn viên số" />
          <div><strong>Sổ tay Đoàn viên số</strong></div>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="status status-danger" style={{ marginBottom: '16px' }}>{error}</div>}
          
          <label className="form-field">
            <span>Email</span>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="Nhập email" 
            />
          </label>
          
          <label className="form-field">
            <span>Mật khẩu</span>
            <input 
              type="password" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Nhập mật khẩu" 
            />
          </label>

          <button type="button" className="link-button" onClick={() => navigate('/quen-mat-khau')} style={{ alignSelf: 'flex-start', marginBottom: '24px', background: 'transparent', border: 'none', color: 'var(--brand-600)', cursor: 'pointer' }}>
            Quên mật khẩu?
          </button>

          <button type="submit" className="button button-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
        <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Hệ thống lưu hành nội bộ. Yêu cầu đăng nhập bằng tài khoản được cấp.
        </p>
      </div>
    </div>
  );
};
