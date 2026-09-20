import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Brand } from '../../components/common';

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/dat-lai-mat-khau`,
      });
      if (resetError) {
        setError('Có lỗi xảy ra. Vui lòng thử lại sau.');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page auth-flow-page">
      <section className="login-card form-card" aria-labelledby="forgot-password-title">
        <Brand compact />
        <h1 id="forgot-password-title">Quên mật khẩu</h1>
        {success ? (
          <div className="auth-success" role="status">
            <p>Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.</p>
            <button className="button button-primary" onClick={() => navigate('/login')}>
              Quay lại đăng nhập
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <p className="auth-form-intro">Nhập email bạn đã đăng ký để nhận liên kết đặt lại mật khẩu.</p>
            {error && <div className="status status-danger" role="alert">{error}</div>}

            <label className="form-field" htmlFor="forgot-password-email">
              <span>Email</span>
              <input id="forgot-password-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Nhập email" />
            </label>

            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Đang gửi…' : 'Gửi yêu cầu'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => navigate('/login')}>
              Hủy
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
