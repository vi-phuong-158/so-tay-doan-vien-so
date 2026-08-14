import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { createNotificationService } from '../services/notificationService';

const PAGE_SIZE = 20;
const notificationService = createNotificationService(supabase);

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [loadedRefreshKey, setLoadedRefreshKey] = useState(-1);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      return () => { cancelled = true; };
    }

    Promise.all([
      notificationService.getMyNotifications({ limit: PAGE_SIZE, offset: 0 }),
      notificationService.getUnreadCount()
    ]).then(([rows, count]) => {
      if (cancelled) return;
      setNotifications(rows);
      setUnreadCount(count);
      setOffset(0);
      setHasMore(rows.length === PAGE_SIZE);
      setLoadedUserId(user.id);
      setLoadedRefreshKey(refreshKey);
      setError('');
    }).catch(() => {
      if (!cancelled) {
        setError('Không tải được thông báo. Vui lòng thử lại.');
        setLoadedUserId(user.id);
        setLoadedRefreshKey(refreshKey);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user?.id, refreshKey]);

  const activeUserLoaded = loadedUserId === user?.id && loadedRefreshKey === refreshKey;
  const visibleNotifications = loadedUserId === user?.id ? notifications : [];
  const visibleUnreadCount = loadedUserId === user?.id ? unreadCount : 0;
  const visibleHasMore = activeUserLoaded && hasMore;
  const visibleError = activeUserLoaded ? error : '';
  const visibleLoading = Boolean(user?.id) && (!activeUserLoaded || loading);

  const loadMore = async () => {
    if (loadingMore || !visibleHasMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const rows = await notificationService.getMyNotifications({ limit: PAGE_SIZE, offset: offset + PAGE_SIZE });
      setNotifications((current) => [...current, ...rows]);
      setOffset((current) => current + PAGE_SIZE);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      setError('Không tải thêm được thông báo.');
    } finally {
      setLoadingMore(false);
    }
  };

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      try {
        await notificationService.markAsRead(notification.id);
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
        )));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        setError('Không thể cập nhật trạng thái đã đọc. Bạn vẫn có thể mở nội dung.');
      }
    }
    if (notification.actionUrl) navigate(notification.actionUrl);
  };

  const markAllAsRead = async () => {
    if (!visibleUnreadCount) return;
    try {
      await notificationService.markAllAsRead();
      setNotifications((current) => current.map((item) => (
        item.readAt ? item : { ...item, readAt: new Date().toISOString() }
      )));
      setUnreadCount(0);
    } catch {
      setError('Không thể đánh dấu tất cả là đã đọc.');
    }
  };

  const retry = () => {
    setRefreshKey((key) => key + 1);
  };

  return (
    <div className="page notification-page">
      <PageHeader
        title="Thông báo"
        subtitle={visibleUnreadCount ? visibleUnreadCount + ' thông báo chưa đọc' : 'Bạn đã xem hết thông báo'}
        action={visibleUnreadCount > 0 && (
          <button className="button button-secondary" type="button" onClick={markAllAsRead}>
            Đánh dấu đã đọc
          </button>
        )}
      />

      {visibleError && (
        <div className="form-error notification-error" role="alert">
          <span>{visibleError}</span>
          <button type="button" onClick={retry}>Thử lại</button>
        </div>
      )}

      {visibleLoading ? (
        <div className="notification-loading" role="status">Đang tải thông báo...</div>
      ) : visibleNotifications.length === 0 ? (
        <EmptyState icon="bell" title="Chưa có thông báo" description="Các cập nhật về công việc và báo cáo sẽ xuất hiện tại đây." />
      ) : (
        <div className="notification-list" aria-label="Danh sách thông báo">
          {visibleNotifications.map((notification) => (
            <button
              type="button"
              className={'notification-item ' + (notification.readAt ? 'is-read' : 'is-unread')}
              key={notification.id}
              onClick={() => openNotification(notification)}
              aria-label={notification.title}
            >
              <span className="notification-item-icon"><Icon name="bell" size={18} /></span>
              <span className="notification-item-content">
                <strong>{notification.title}</strong>
                {notification.body && <span>{notification.body}</span>}
                <small>{formatDate(notification.createdAt)}</small>
              </span>
              {!notification.readAt && <span className="notification-unread-dot" aria-label="Chưa đọc" />}
              {notification.actionUrl && <Icon name="chevron" size={16} />}
            </button>
          ))}
          {visibleHasMore && (
            <button className="button button-secondary notification-load-more" type="button" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải...' : 'Tải thêm'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
