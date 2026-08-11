import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { createNotificationService } from '../services/notificationService';
import { Icon } from './Icon';

const notificationService = createNotificationService(supabase);

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [countUserId, setCountUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return () => { cancelled = true; };

    notificationService.getUnreadCount()
      .then((count) => {
        if (!cancelled) {
          setUnreadCount(count);
          setCountUserId(user.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnreadCount(0);
          setCountUserId(user.id);
        }
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  const visibleCount = countUserId === user?.id ? unreadCount : 0;

  return (
    <button
      className="icon-button notification-bell"
      aria-label={visibleCount ? visibleCount + ' thông báo chưa đọc' : 'Thông báo'}
      onClick={() => navigate('/ca-nhan/thong-bao')}
    >
      <Icon name="bell" />
      {visibleCount > 0 && (
        <span className="notification-badge">
          {visibleCount > 99 ? '99+' : visibleCount}
        </span>
      )}
    </button>
  );
}
