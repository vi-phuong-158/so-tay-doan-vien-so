import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

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

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/dat-lai-mat-khau`,
    });

    if (resetError) {
      setError('Có lỗi xảy ra. Vui lòng thử lại sau.');
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <div className="page login-page">
      <div className="login-card form-card">
        <h2 style={{ marginBottom: '16px' }}>Quên mật khẩu</h2>
        {success ? (
          <div>
            <p style={{ marginBottom: '24px' }}>Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.</p>
            <button className="button button-primary" onClick={() => navigate('/login')} style={{ width: '100%' }}>
              Quay lại đăng nhập
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ marginBottom: '24px', fontSize: '14px' }}>Nhập email bạn đã đăng ký để nhận liên kết đặt lại mật khẩu.</p>
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

            <button type="submit" className="button button-primary" disabled={loading} style={{ width: '100%', marginBottom: '16px' }}>
              {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => navigate('/login')} style={{ width: '100%' }}>
              Hủy
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
