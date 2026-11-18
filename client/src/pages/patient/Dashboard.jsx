import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarCheck2,
  CalendarPlus,
  Clock,
  RefreshCw,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button, buttonClasses } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { LiveQueueCard } from '../../components/patient/LiveQueueCard';
import { TodayAppointmentCard } from '../../components/patient/TodayAppointmentCard';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent, useSocketRefresh } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { usePolling } from '../../hooks/usePolling';
import { appointmentApi, notificationApi, queueApi, NOTIFICATIONS_CHANGED_EVENT } from '../../lib/api';
import {
  formatDateLabel,
  formatDateLong,
  getTodayDateString,
  isPastDateString,
} from '../../lib/dates';
import { appointmentStatusBadge, formatRelativeTime, formatToken } from '../../lib/queue';

const ACTIVE_STATUSES = ['BOOKED', 'CHECKED_IN', 'CALLED', 'IN_CONSULTATION'];

function isUpcoming(appointment) {
  if (isPastDateString(appointment.date)) return false;
  return ACTIVE_STATUSES.includes(appointment.status);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [appointments, setAppointments] = useState([]);
  const [queue, setQueue] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [checkingIn, setCheckingIn] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAppointments = async ({ signal } = {}) => {
    const data = await appointmentApi.mine({ signal });
    setAppointments(data.appointments ?? []);
  };

  const loadQueue = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await queueApi.mine({ signal });
      setQueue(data.queue);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (!quiet) throw requestError;
    }
  };

  const loadNotifications = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await notificationApi.list({ signal });
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (requestError) {
      if (!quiet) throw requestError;
    }
  };

  const loadAll = async ({ signal } = {}) => {
    await Promise.all([loadAppointments({ signal }), loadQueue({ signal }), loadNotifications({ signal })]);
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        await loadAll({ signal: controller.signal });
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

  usePolling(
    () => {
      loadQueue({ quiet: true });
      loadNotifications({ quiet: true });
    },
    15000,
    { enabled: !loading },
  );

  usePolling(() => loadAppointments({ signal: undefined }), 60000, { enabled: !loading });

  // Phase 9 realtime updates. Polling above stays as a fallback for dropped
  // websocket connections; these handlers make the common case instant.
  useSocketEvent('queue:position', () => loadQueue({ quiet: true }));
  useSocketEvent('patient:called', () => loadQueue({ quiet: true }));
  useSocketEvent('doctor:delay', (payload) => {
    if (payload?.delay?.minutes > 0) {
      toast.info(
        `${payload.delay.minutes}-minute delay reported by the doctor.`,
        'Queue delay',
      );
    } else {
      toast.success('The delay has been cleared. Your estimate has been updated.', 'Queue updated');
    }
    loadQueue({ quiet: true });
  });
  useSocketEvent('notification:new', () => loadNotifications({ quiet: true }));
  useSocketRefresh(['appointments:updated'], () => {
    loadAppointments().catch(() => {});
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      await loadAll();
      toast.info('Your dashboard is up to date.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCheckIn = async (appointment) => {
    setCheckingIn(appointment.id);
    try {
      const result = await appointmentApi.checkIn(appointment.id);
      toast.success(
        `Your token is ${formatToken(result.queueEntry.tokenNumber)}.`,
        'Checked in',
      );
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      await Promise.all([loadAppointments(), loadQueue()]);
    } catch (requestError) {
      toast.error(requestError.message);
      await Promise.all([
        loadAppointments().catch(() => {}),
        loadQueue({ quiet: true }),
      ]);
    } finally {
      setCheckingIn('');
    }
  };

  const today = getTodayDateString();
  const todaysAppointments = appointments
    .filter(
      (appointment) =>
        appointment.date === today && appointment.status !== 'CANCELLED',
    )
    .sort((a, b) => (a.slotTime || '').localeCompare(b.slotTime || ''));
  const upcoming = appointments
    .filter(isUpcoming)
    .sort((a, b) => `${a.date}${a.slotTime}`.localeCompare(`${b.date}${b.slotTime}`))
    .slice(0, 3);
  const latestNotifications = notifications.slice(0, 3);
  const activeQueue = queue?.active ? queue : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">{formatDateLong(today)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Check in on the day of your appointment, follow your token in the live queue,
            and keep an eye on doctor delays.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link to="/doctors" className={buttonClasses()}>
            <CalendarPlus className="h-4 w-4" />
            Book appointment
          </Link>
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

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
          <Spinner label="Loading your dashboard" />
        </div>
      ) : (
        <>
          {activeQueue ? (
            <LiveQueueCard
              queue={queue}
              onRefresh={() => loadQueue({ quiet: true })}
              refreshing={false}
            />
          ) : (
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle>Live queue</CardTitle>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {lastUpdated
                        ? `Checked ${lastUpdated.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : 'Not checked in yet today'}
                    </p>
                  </div>
                </div>
                <Badge variant="default">Not in queue</Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-sm leading-6 text-slate-600">
                  {todaysAppointments.some((appointment) => appointment.status === 'BOOKED')
                    ? 'Your appointment is today. Check in below to receive a token and join the doctor’s queue.'
                    : 'You are not in a live queue right now. Book an appointment, then check in on the day of your visit.'}
                </p>
                {!todaysAppointments.some(
                  (appointment) =>
                    appointment.status === 'BOOKED' ||
                    ['CHECKED_IN', 'CALLED', 'IN_CONSULTATION'].includes(
                      appointment.status,
                    ),
                ) && (
                  <Link to="/doctors" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
                    <Stethoscope className="h-4 w-4" />
                    Find a doctor
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Today’s appointments</CardTitle>
                  <CardDescription>{formatDateLabel(today)}</CardDescription>
                </div>
                <Badge variant={todaysAppointments.length > 0 ? 'blue' : 'default'}>
                  {todaysAppointments.length} today
                </Badge>
              </CardHeader>
              <CardContent>
                {todaysAppointments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No appointments today
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Book a consultation and come back on the appointment day.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todaysAppointments.map((appointment) => (
                      <TodayAppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        onCheckIn={handleCheckIn}
                        checkingIn={checkingIn}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>
                    {unreadCount > 0
                      ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}`
                      : 'You are all caught up'}
                  </CardDescription>
                </div>
                <Link
                  to="/notifications"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                {latestNotifications.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title="No notifications yet"
                    description="Check-in confirmations, queue updates and delay notices will appear here."
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-2">
                    {latestNotifications.map((notification) => (
                      <li
                        key={notification.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                      >
                        <span
                          className={
                            notification.isRead
                              ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-200'
                              : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500'
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {notification.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Upcoming appointments</CardTitle>
                <CardDescription>Your next booked visits.</CardDescription>
              </div>
              <Link
                to="/patient/appointments"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                All appointments
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck2}
                  title="Nothing booked yet"
                  description="Find a doctor, choose a slot and reserve your consultation."
                  action={
                    <Link to="/doctors" className={buttonClasses({ size: 'sm' })}>
                      <Stethoscope className="h-4 w-4" />
                      Find a doctor
                    </Link>
                  }
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((appointment) => {
                    const status = appointmentStatusBadge(appointment.status);
                    return (
                      <li
                        key={appointment.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatDateLabel(appointment.date)}
                            {appointment.slotTime ? ` · ${appointment.slotTime}` : ''}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-slate-600">
                            {appointment.doctor?.name ?? 'Doctor'}
                            {appointment.hospital?.name
                              ? ` · ${appointment.hospital.name}`
                              : ''}
                          </p>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              to="/patient/appointments"
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <CalendarCheck2 className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-900 group-hover:text-blue-700">
                  My appointments
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  Review, check in or cancel a booking.
                </span>
              </span>
            </Link>
            <Link
              to="/doctors"
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Stethoscope className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-900 group-hover:text-blue-700">
                  Find a doctor
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  Search by hospital, city and specialisation.
                </span>
              </span>
            </Link>
            <Link
              to="/notifications"
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Bell className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-900 group-hover:text-blue-700">
                  Notifications
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  Queue calls, delays and check-in receipts.
                </span>
              </span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
