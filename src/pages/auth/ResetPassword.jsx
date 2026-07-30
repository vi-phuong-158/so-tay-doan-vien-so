import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

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

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError('Cập nhật mật khẩu thất bại. Phiên có thể đã hết hạn.');
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <div className="page login-page">
      <div className="login-card form-card">
        <h2 style={{ marginBottom: '16px' }}>Đặt lại mật khẩu</h2>
        {success ? (
          <div>
            <p style={{ marginBottom: '24px' }}>Mật khẩu của bạn đã được đặt lại thành công.</p>
            <button className="button button-primary" onClick={() => navigate('/login')} style={{ width: '100%' }}>
              Đăng nhập ngay
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="status status-danger" style={{ marginBottom: '16px' }}>{error}</div>}
            
            <label className="form-field">
              <span>Mật khẩu mới</span>
              <input 
                type="password" 
                required 
                minLength={6}
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="Nhập mật khẩu mới" 
              />
            </label>
            
            <label className="form-field">
              <span>Xác nhận mật khẩu</span>
              <input 
                type="password" 
                required 
                minLength={6}
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Nhập lại mật khẩu" 
              />
            </label>

            <button type="submit" className="button button-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
