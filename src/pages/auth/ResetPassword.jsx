import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Brand } from '../../components/common';

export const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (password !== confirmPassword) {
      return setError('Mật khẩu nhập lại không khớp.');
    }
    
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Cập nhật mật khẩu thất bại. Phiên có thể đã hết hạn.');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Cập nhật mật khẩu thất bại. Phiên có thể đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page auth-flow-page">
      <section className="login-card form-card" aria-labelledby="reset-password-title">
        <Brand compact />
        <h1 id="reset-password-title">Đặt lại mật khẩu</h1>
        {success ? (
          <div className="auth-success" role="status">
            <p>Mật khẩu của bạn đã được đặt lại thành công.</p>
            <button className="button button-primary" onClick={() => navigate('/login')}>
              Đăng nhập ngay
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="status status-danger" role="alert">{error}</div>}

            <label className="form-field" htmlFor="reset-password-new">
              <span>Mật khẩu mới</span>
              <input id="reset-password-new" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu mới" />
            </label>

            <label className="form-field" htmlFor="reset-password-confirm">
              <span>Xác nhận mật khẩu</span>
              <input id="reset-password-confirm" type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu" />
            </label>

            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
