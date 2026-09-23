import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Button, PageHeader } from '../../components/common';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';

export function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Mật khẩu không khớp');
      return;
    }
    
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
    } catch {
      setError('Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Đổi mật khẩu" back="/ca-nhan" navigate={navigate} />
      <section className="form-card auth-change-password" aria-labelledby="change-password-description">
        <p id="change-password-description">Đặt mật khẩu mới cho tài khoản đăng nhập của bạn.</p>

        {success ? (
          <div className="auth-success" role="status">
            <Icon name="check" size={28} />
            <p>Đổi mật khẩu thành công.</p>
            <Button onClick={() => navigate('/ca-nhan')}>Về trang cá nhân</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            {error && <p className="form-error" role="alert">{error}</p>}

            <label className="form-field" htmlFor="change-password-new">
              <span>Mật khẩu mới</span>
              <input id="change-password-new" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu mới" minLength={6} />
            </label>

            <label className="form-field" htmlFor="change-password-confirm">
              <span>Nhập lại mật khẩu mới</span>
              <input id="change-password-confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu mới" minLength={6} />
            </label>

            <Button type="submit" disabled={loading}>
              {loading ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
