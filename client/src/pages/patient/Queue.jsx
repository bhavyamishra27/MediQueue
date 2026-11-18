import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarPlus,
  Clock,
  RefreshCw,
  Stethoscope,
  Ticket,
  Users,
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
import { useToast } from '../../context/ToastContext';
import { useSocketEvent, useSocketRefresh } from '../../context/SocketContext';
import { usePolling } from '../../hooks/usePolling';
import { appointmentApi, queueApi } from '../../lib/api';
import { formatDateLong, getTodayDateString } from '../../lib/dates';
import { formatToken, priorityBadge, queueStatusBadge } from '../../lib/queue';
import { cn } from '../../lib/utils';

const POLL_INTERVAL = 10000;

function WaitingRow({ row }) {
  const priority = priorityBadge(row.priority);

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        row.isYou
          ? 'border-blue-300 bg-blue-50/70 ring-1 ring-inset ring-blue-200'
          : 'border-slate-200 bg-white',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
        {formatToken(row.tokenNumber)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {row.patientName}
          {row.isYou && <span className="ml-2 text-xs font-semibold text-blue-700">You</span>}
        </p>
        <p className="text-xs text-slate-500">
          Position #{row.position} · {row.status === 'WAITING' ? 'Waiting' : row.status}
        </p>
      </div>
      <Badge variant={priority.variant}>{priority.label}</Badge>
    </li>
  );
}

export default function PatientQueue() {
  const toast = useToast();

  const [queue, setQueue] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [checkingIn, setCheckingIn] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const previousStatus = useRef(null);
  const wasActive = useRef(false);

  const loadQueue = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await queueApi.mine({ signal });
      setQueue(data.queue);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (!quiet) throw requestError;
    }
  };

  const loadAppointments = async ({ signal } = {}) => {
    const data = await appointmentApi.mine({ signal });
    setAppointments(data.appointments ?? []);
  };

  const loadAll = async ({ signal } = {}) => {
    await Promise.all([loadQueue({ signal }), loadAppointments({ signal })]);
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

  usePolling(() => loadQueue({ quiet: true }), POLL_INTERVAL, { enabled: !loading });

  // Realtime queue updates. Polling remains as a fallback.
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
  useSocketRefresh(['appointments:updated'], () => {
    loadAppointments().catch(() => {});
  });

  // Announce the two moments that matter: being called and starting.
  useEffect(() => {
    const status = queue?.entry?.status;
    if (!status) {
      previousStatus.current = null;
      return;
    }

    const previous = previousStatus.current;
    if (previous && previous !== status) {
      if (status === 'CALLED') {
        toast.success(
          queue.doctor?.roomNumber
            ? `Please proceed to room ${queue.doctor.roomNumber}.`
            : 'Please proceed to the consultation room.',
          "It's your turn",
        );
      } else if (status === 'IN_CONSULTATION') {
        toast.info('Your consultation has started.', 'In consultation');
      }
    }

    previousStatus.current = status;
  }, [queue?.entry?.status, queue?.doctor?.roomNumber, toast]);

  // When the consultation ends, refresh the appointment list so a completed
  // visit no longer offers the live-queue link.
  useEffect(() => {
    if (wasActive.current && queue && !queue.active) {
      loadAppointments().catch(() => {});
    }
    wasActive.current = Boolean(queue?.active);
  }, [queue?.active]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      await loadAll();
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
      await loadAll();
    } catch (requestError) {
      toast.error(requestError.message);
      await Promise.all([loadQueue({ quiet: true }), loadAppointments().catch(() => {})]);
    } finally {
      setCheckingIn('');
    }
  };

  const today = getTodayDateString();
  const todaysAppointments = appointments
    .filter((appointment) => appointment.date === today && appointment.status !== 'CANCELLED')
    .sort((a, b) => (a.slotTime || '').localeCompare(b.slotTime || ''));
  const activeQueue = queue?.active ? queue : null;
  const current = activeQueue?.current;
  const waiting = activeQueue?.waiting ?? [];
  const currentStatus = current ? queueStatusBadge(current.status) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <Clock className="h-4 w-4" />
            Patient queue
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            My live queue
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {formatDateLong(today)} · updates live while this page is open.
            {lastUpdated
              ? ` Last checked at ${lastUpdated.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}.`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh now
          </Button>
          <Link to="/patient/appointments" className={buttonClasses({ variant: 'outline' })}>
            <CalendarPlus className="h-4 w-4" />
            My appointments
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
          <Spinner label="Loading your queue" />
        </div>
      ) : !activeQueue ? (
        <>
          <EmptyState
            icon={Ticket}
            title="You are not in a live queue"
            description="Check in from an appointment scheduled for today to receive a token. Tokens are issued in arrival order and emergency patients are seen first."
            action={
              todaysAppointments.length === 0 ? (
                <Link to="/doctors" className={buttonClasses()}>
                  <Stethoscope className="h-4 w-4" />
                  Find a doctor
                </Link>
              ) : null
            }
          />

          {todaysAppointments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Today’s appointments</CardTitle>
                <CardDescription>
                  Check in to join the queue. Check-in is only available on the appointment
                  day.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {todaysAppointments.map((appointment) => (
                  <TodayAppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onCheckIn={handleCheckIn}
                    checkingIn={checkingIn}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <LiveQueueCard
            queue={activeQueue}
            onRefresh={() => loadQueue({ quiet: true })}
            refreshing={refreshing}
            showDetailsLink={false}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Now serving</CardTitle>
                  <CardDescription>The consultation room right now.</CardDescription>
                </div>
                {currentStatus && <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>}
              </CardHeader>
              <CardContent>
                {current ? (
                  <div className="flex items-center gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold text-white">
                      {formatToken(current.tokenNumber)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900">
                        {current.patientName}
                        {current.isYou && (
                          <span className="ml-2 text-sm font-semibold text-blue-700">
                            You
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {current.status === 'CALLED'
                          ? 'Called to the room'
                          : 'In consultation'}
                      </p>
                      <Badge variant={priorityBadge(current.priority).variant} className="mt-2">
                        {priorityBadge(current.priority).label}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                    No patient is being seen right now. The doctor will call the next token
                    shortly.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Waiting list</CardTitle>
                  <CardDescription>
                    Priority order: emergencies first, then tokens in arrival order.
                  </CardDescription>
                </div>
                <Badge variant="blue">
                  <Users className="h-3.5 w-3.5" />
                  {waiting.length}
                </Badge>
              </CardHeader>
              <CardContent>
                {waiting.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                    Nobody is waiting. You are all caught up.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {waiting.map((row) => (
                      <WaitingRow key={`${row.tokenNumber}-${row.patientName}`} row={row} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Doctor &amp; delay status</CardTitle>
                <CardDescription>
                  Live information from the hospital queue engine.
                </CardDescription>
              </div>
              <Link
                to="/notifications"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                <Bell className="h-4 w-4" />
                Notifications
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Doctor
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {activeQueue.doctor?.name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Hospital
                  </dt>
                  <dd className="mt-1 text-slate-700">
                    {activeQueue.doctor?.hospitalName ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Room
                  </dt>
                  <dd className="mt-1 text-slate-700">
                    {activeQueue.doctor?.roomNumber ?? 'Not assigned'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Current delay
                  </dt>
                  <dd className="mt-1 text-slate-700">
                    {activeQueue.delay?.minutes > 0
                      ? `${activeQueue.delay.minutes} min${
                          activeQueue.delay.reason ? ` · ${activeQueue.delay.reason}` : ''
                        }`
                      : 'On time'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
