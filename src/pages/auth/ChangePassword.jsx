import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Button } from '../../components/common';
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
    } catch (err) {
      setError(err.message || 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="auth-container" style={{ padding: '24px 16px', maxWidth: '400px', margin: '0 auto' }}>
        <button className="icon-button" style={{ marginBottom: '16px' }} onClick={() => navigate(-1)}>
          <Icon name="chevron-left" /> Quay lại
        </button>
        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div className="auth-header">
            <h2>Đổi mật khẩu</h2>
            <p>Nhập mật khẩu mới cho tài khoản của bạn</p>
          </div>
          
          {success ? (
            <div className="success-message" style={{ textAlign: 'center', padding: '24px 0' }}>
              <Icon name="check" size={48} style={{ color: 'var(--success)', marginBottom: '16px' }} />
              <p style={{ color: 'var(--success)', fontWeight: 'bold' }}>Đổi mật khẩu thành công!</p>
              <Button style={{ marginTop: '24px', width: '100%' }} onClick={() => navigate('/ca-nhan')}>
                Về trang cá nhân
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              {error && <div className="error-message" style={{ color: 'var(--error)', fontSize: '0.875rem', marginBottom: '12px' }}>{error}</div>}
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới"
                  minLength={6}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Nhập lại mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  minLength={6}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
              
              <Button type="submit" loading={loading} style={{ width: '100%', marginTop: '16px' }}>
                Cập nhật mật khẩu
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
