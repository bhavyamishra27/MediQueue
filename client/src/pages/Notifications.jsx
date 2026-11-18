import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CheckCheck,
  RefreshCw,
  Ticket,
  Timer,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button, buttonClasses } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePolling } from '../hooks/usePolling';
import { useSocketEvent } from '../context/SocketContext';
import { NOTIFICATIONS_CHANGED_EVENT, notificationApi } from '../lib/api';
import { formatRelativeTime } from '../lib/queue';
import { cn } from '../lib/utils';

const TYPE_STYLES = {
  APPOINTMENT: { icon: CalendarCheck2, className: 'bg-blue-50 text-blue-700' },
  QUEUE: { icon: Ticket, className: 'bg-teal-50 text-teal-700' },
  DELAY: { icon: Timer, className: 'bg-amber-50 text-amber-700' },
  EMERGENCY: { icon: AlertTriangle, className: 'bg-red-50 text-red-700' },
  SYSTEM: { icon: Bell, className: 'bg-slate-100 text-slate-600' },
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
];

export default function Notifications() {
  const { user } = useAuth();
  const toast = useToast();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState('');
  const [error, setError] = useState('');

  const load = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await notificationApi.list({ signal });
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (requestError) {
      if (!quiet) throw requestError;
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        await load({ signal: controller.signal });
      } catch (requestError) {
        if (!cancelled && requestError?.name !== 'AbortError') {
          setError(requestError.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  usePolling(() => load({ quiet: true }), 30000, { enabled: !loading });
  useSocketEvent('notification:new', () => load({ quiet: true }));

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (notification) => {
    if (notification.isRead) return;
    setMarkingId(notification.id);
    try {
      const result = await notificationApi.markRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount(result.unreadCount);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setMarkingId('');
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      const result = await notificationApi.markAllRead();
      setNotifications((current) =>
        current.map((item) => ({ ...item, isRead: true })),
      );
      setUnreadCount(0);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      toast.success(
        result.updated > 0
          ? `${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.`
          : 'Everything was already read.',
      );
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setMarkingAll(false);
    }
  };

  const visible =
    filter === 'unread'
      ? notifications.filter((notification) => !notification.isRead)
      : notifications;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <Bell className="h-4 w-4" />
            Notifications
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Your updates
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Check-in receipts, queue calls and doctor delay notices appear here. This page
            refreshes automatically every 30 seconds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={handleMarkAll}
            loading={markingAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition',
              filter === option.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
            )}
          >
            {option.label}
            {option.value === 'unread' && unreadCount > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  filter === 'unread'
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-100 text-blue-700',
                )}
              >
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
          <Spinner label="Loading notifications" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={filter === 'unread' ? CheckCheck : Bell}
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'You have read everything. New queue and appointment updates will appear here.'
              : 'Check in for an appointment to start receiving queue and delay notifications.'
          }
          action={
            <Link
              to={user?.role === 'PATIENT' ? '/patient/appointments' : '/dashboard'}
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              {user?.role === 'PATIENT' ? 'My appointments' : 'Go to dashboard'}
            </Link>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              {filter === 'unread' ? 'Unread' : 'All notifications'}
            </CardTitle>
            <Badge variant="default">
              {visible.length} item{visible.length === 1 ? '' : 's'}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {visible.map((notification) => {
                const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.SYSTEM;
                const Icon = style.icon;

                return (
                  <li
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-3 px-6 py-4',
                      !notification.isRead && 'bg-blue-50/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        style.className,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />
                        )}
                        <span className="text-xs text-slate-400">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {notification.message}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {notification.appointmentId && user?.role === 'PATIENT' && (
                          <Link
                            to="/patient/appointments"
                            className="text-xs font-medium text-blue-700 hover:text-blue-800"
                          >
                            View appointment
                          </Link>
                        )}
                        {!notification.isRead && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(notification)}
                            disabled={markingId === notification.id}
                            className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
                          >
                            {markingId === notification.id ? 'Marking…' : 'Mark as read'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
