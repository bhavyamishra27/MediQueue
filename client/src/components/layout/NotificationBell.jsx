import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  notificationApi,
} from '../../lib/api';
import { usePolling } from '../../hooks/usePolling';
import { useSocketEvent } from '../../context/SocketContext';

/**
 * Header bell with an unread badge. `notification:new` updates the badge the
 * moment the server commits a notification; a slow poll remains as a fallback
 * for dropped websocket connections.
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    try {
      const data = await notificationApi.list();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // A failed poll must never break navigation; the next tick retries.
    }
  };

  useEffect(() => {
    load();

    // Marking notifications read elsewhere updates the badge immediately.
    const handleChange = () => load();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChange);

    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChange);
  }, []);

  useSocketEvent('notification:new', () => load());
  usePolling(load, 30000);

  return (
    <Link
      to="/notifications"
      className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications'
      }
      title="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
