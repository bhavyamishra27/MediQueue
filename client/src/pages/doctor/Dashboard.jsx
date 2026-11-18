import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  DoorOpen,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  SkipForward,
  Stethoscope,
  Ticket,
  Timer,
  UserRound,
  UserX,
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
import { ConfirmDialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { DsaPanel } from '../../components/doctor/DsaPanel';
import { DelayDialog } from '../../components/doctor/DelayDialog';
import { EmergencyDialog } from '../../components/doctor/EmergencyDialog';
import { PatientDetailsDialog } from '../../components/doctor/PatientDetailsDialog';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent, useSocketRefresh } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { usePolling } from '../../hooks/usePolling';
import { doctorApi } from '../../lib/api';
import { formatDateLong, getTodayDateString } from '../../lib/dates';
import { formatClock, formatPatientMeta } from '../../lib/doctor';
import {
  appointmentStatusBadge,
  formatToken,
  formatWait,
  priorityBadge,
  queueStatusBadge,
} from '../../lib/queue';
import { cn } from '../../lib/utils';

const QUEUE_POLL_INTERVAL = 10000;
const APPOINTMENT_POLL_INTERVAL = 60000;

function Stat({ label, value, hint, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg',
            tones[tone] ?? tones.slate,
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
        </span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function PatientLine({ patient, fallback = 'Patient' }) {
  const meta = formatPatientMeta(patient);

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-900">
        {patient?.name ?? fallback}
      </p>
      {meta && <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p>}
    </div>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [queue, setQueue] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);
  const [noShowTarget, setNoShowTarget] = useState(null);
  const [detailAppointment, setDetailAppointment] = useState(null);

  const loadQueue = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await doctorApi.queue({ signal });
      setQueue(data.queue);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (!quiet) throw requestError;
    }
  };

  const loadAppointments = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await doctorApi.appointments({ signal });
      setAppointments(data.appointments ?? []);
      setCounts(data.counts ?? null);
    } catch (requestError) {
      if (!quiet) throw requestError;
    }
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

  usePolling(() => loadQueue({ quiet: true }), QUEUE_POLL_INTERVAL, { enabled: !loading });
  usePolling(() => loadAppointments({ quiet: true }), APPOINTMENT_POLL_INTERVAL, {
    enabled: !loading,
  });

  // Realtime queue state pushed by the server after every committed mutation.
  useSocketEvent('queue:updated', (payload) => {
    if (!payload) return;
    setQueue(payload);
    setLastUpdated(new Date());
  });
  useSocketEvent('queue:emergency', (payload) => {
    if (payload?.queue) {
      setQueue(payload.queue);
      setLastUpdated(new Date());
    }
    // The doctor who added the emergency already gets a confirmation toast
    // from the REST response; only announce emergencies added elsewhere.
    if (payload?.entry && action !== 'emergency') {
      toast.info(
        `Token ${formatToken(payload.entry.tokenNumber)} was added with emergency priority.`,
        'Emergency patient added',
      );
    }
  });
  useSocketRefresh(['appointments:updated'], () => {
    loadAppointments({ quiet: true });
  });

  const appointmentById = useMemo(
    () => new Map(appointments.map((appointment) => [appointment.id, appointment])),
    [appointments],
  );

  const current = queue?.current ?? null;
  const waiting = queue?.waiting ?? [];
  const delayMinutes = Number(queue?.delay?.minutes) || 0;
  const currentAppointment = current ? appointmentById.get(current.appointmentId) : null;

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

  const runQueueAction = async (key, request, successMessage) => {
    setAction(key);
    try {
      const result = await request();
      if (result?.queue) setQueue(result.queue);
      await loadAppointments({ quiet: true });
      toast.success(successMessage);
      return result;
    } catch (requestError) {
      toast.error(requestError.message);
      await loadQueue({ quiet: true }).catch(() => {});
      return null;
    } finally {
      setAction('');
    }
  };

  const handleCallNext = () =>
    runQueueAction('call-next', () => doctorApi.callNext(), 'The next patient has been called.');

  const handleStart = () =>
    runQueueAction(
      'start',
      () => doctorApi.start(),
      'The consultation has started.',
    );

  const handleComplete = () =>
    runQueueAction(
      'complete',
      () => doctorApi.complete(),
      'Consultation completed. The queue has been updated.',
    );

  const handleClearDelay = () =>
    runQueueAction(
      'clear-delay',
      () => doctorApi.clearDelay(),
      'Delay cleared. Waiting patients have been notified.',
    );

  const handleNoShow = async () => {
    if (!noShowTarget) return;
    const target = noShowTarget;
    setAction('no-show');
    try {
      const result = await doctorApi.noShow(target.id);
      if (result?.queue) setQueue(result.queue);
      await loadAppointments({ quiet: true });
      toast.success(`Token ${formatToken(target.tokenNumber)} marked as a no-show.`);
      setNoShowTarget(null);
    } catch (requestError) {
      toast.error(requestError.message);
      await loadQueue({ quiet: true }).catch(() => {});
    } finally {
      setAction('');
    }
  };

  const handleEmergency = async (payload) => {
    setAction('emergency');
    try {
      const result = await doctorApi.addEmergency(payload);
      if (result?.queue) setQueue(result.queue);
      await loadAppointments({ quiet: true });
      toast.success(
        `Token ${formatToken(result.entry.tokenNumber)} added with emergency priority.`,
        'Emergency patient added',
      );
      setEmergencyOpen(false);
    } finally {
      setAction('');
    }
  };

  const handleDelay = async (payload) => {
    setAction('delay');
    try {
      const result = await doctorApi.reportDelay(payload);
      if (result?.queue) setQueue(result.queue);
      toast.success('Waiting patients have been notified of the delay.');
      setDelayOpen(false);
    } finally {
      setAction('');
    }
  };

  const canCallNext = !current && waiting.length > 0 && !action;
  const canStart = current?.status === 'CALLED' && !action;
  const canComplete = current?.status === 'IN_CONSULTATION' && !action;
  const canMarkCurrentNoShow = current?.status === 'CALLED' && !action;

  const today = getTodayDateString();
  const upcomingToday = appointments.filter(
    (appointment) => appointment.status === 'BOOKED',
  );
  const dashboardAppointments = appointments.slice(0, 6);

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
        <Spinner label="Loading your queue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">{formatDateLong(today)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Live queue
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4 text-slate-400" />
              {queue?.doctor?.name ?? user?.name ?? 'Doctor'}
            </span>
            {queue?.doctor?.hospitalName && (
              <span className="inline-flex items-center gap-1.5">
                <DoorOpen className="h-4 w-4 text-slate-400" />
                {queue.doctor.hospitalName}
              </span>
            )}
            {queue?.doctor?.roomNumber && (
              <span>Room {queue.doctor.roomNumber}</span>
            )}
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                Updated {formatClock(lastUpdated)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link to="/doctor/appointments" className={buttonClasses()}>
            <CalendarCheck2 className="h-4 w-4" />
            Today&apos;s appointments
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

      {delayMinutes > 0 && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">Running {delayMinutes} min late.</span>{' '}
              {queue?.delay?.reason}
              {queue?.delay?.reportedAt ? ` · reported ${formatClock(queue.delay.reportedAt)}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDelayOpen(true)}>
              Update
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleClearDelay}
              loading={action === 'clear-delay'}
            >
              Clear delay
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Waiting"
          value={waiting.length}
          hint={`${counts?.emergency ?? 0} emergency today`}
          icon={Users}
          tone="blue"
        />
        <Stat
          label="Now serving"
          value={current ? formatToken(current.tokenNumber) : '—'}
          hint={current ? current.patientName : 'Nobody called'}
          icon={UserRound}
          tone={current ? 'violet' : 'slate'}
        />
        <Stat
          label="Checked in"
          value={counts?.inQueue ?? 0}
          hint="In today's queue"
          icon={Ticket}
          tone="teal"
        />
        <Stat
          label="Completed"
          value={queue?.completedToday ?? 0}
          hint={`Avg ${queue?.averageConsultationMinutes ?? 0} min`}
          icon={CheckCircle2}
          tone="teal"
        />
        <Stat
          label="Delay"
          value={delayMinutes > 0 ? `${delayMinutes} min` : 'On time'}
          hint={delayMinutes > 0 ? 'Estimates adjusted' : 'No active delay'}
          icon={Timer}
          tone={delayMinutes > 0 ? 'amber' : 'slate'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Now serving</CardTitle>
              <CardDescription>
                The patient in your room right now.
              </CardDescription>
            </div>
            {current && (
              <Badge variant={queueStatusBadge(current.status).variant}>
                {queueStatusBadge(current.status).label}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {current ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div
                    className={cn(
                      'flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-sm',
                      Number(current.priority) === 0 ? 'bg-red-600' : 'bg-slate-900',
                    )}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider text-white/70">
                      Token
                    </span>
                    <span className="text-2xl font-bold tracking-tight">
                      {formatToken(current.tokenNumber)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PatientLine patient={currentAppointment?.patient} fallback={current.patientName} />
                      <Badge variant={priorityBadge(current.priority).variant}>
                        {priorityBadge(current.priority).label}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {current.slotTime && <span>Slot {current.slotTime}</span>}
                      {current.checkedInAt && (
                        <span>Checked in {formatClock(current.checkedInAt)}</span>
                      )}
                      {currentAppointment?.patient?.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {currentAppointment.patient.phone}
                        </span>
                      )}
                    </div>
                    {currentAppointment?.reason && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Reason:</span>{' '}
                        {currentAppointment.reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {current.status === 'CALLED' && (
                    <Button onClick={handleStart} loading={action === 'start'} disabled={!canStart}>
                      <PlayCircle className="h-4 w-4" />
                      Start consultation
                    </Button>
                  )}
                  {current.status === 'IN_CONSULTATION' && (
                    <Button
                      variant="secondary"
                      onClick={handleComplete}
                      loading={action === 'complete'}
                      disabled={!canComplete}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Complete consultation
                    </Button>
                  )}
                  {current.status === 'CALLED' && (
                    <Button
                      variant="outline"
                      onClick={() => setNoShowTarget(current)}
                      disabled={!canMarkCurrentNoShow}
                    >
                      <UserX className="h-4 w-4" />
                      Mark no-show
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <EmptyState
                  icon={UserRound}
                  title="No patient in the room"
                  description={
                    waiting.length > 0
                      ? `${waiting.length} patient${waiting.length === 1 ? '' : 's'} waiting. Call the next token when you are ready.`
                      : 'Nobody is waiting right now. New check-ins appear here automatically.'
                  }
                  className="py-8"
                />
                <div className="flex justify-center">
                  <Button
                    onClick={handleCallNext}
                    loading={action === 'call-next'}
                    disabled={!canCallNext}
                  >
                    <SkipForward className="h-4 w-4" />
                    Call next patient
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue controls</CardTitle>
            <CardDescription>
              Every action updates SQLite and the in-memory heap.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Button
              className="w-full"
              onClick={handleCallNext}
              loading={action === 'call-next'}
              disabled={!canCallNext}
            >
              <SkipForward className="h-4 w-4" />
              Call next patient
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setEmergencyOpen(true)}
              disabled={Boolean(action)}
            >
              <Plus className="h-4 w-4" />
              Add emergency patient
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDelayOpen(true)}
              disabled={Boolean(action)}
            >
              <Timer className="h-4 w-4" />
              {delayMinutes > 0 ? 'Update delay' : 'Report a delay'}
            </Button>

            {delayMinutes > 0 && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleClearDelay}
                loading={action === 'clear-delay'}
              >
                Clear the delay
              </Button>
            )}

            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
              Tokens are issued at check-in. Emergencies use priority 0 and jump
              ahead of normal patients, while normal patients keep first-come,
              first-served order.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Waiting list</CardTitle>
            <CardDescription>
              Served in heap order: emergencies first, then token number.
            </CardDescription>
          </div>
          <Badge variant="blue">
            <Users className="h-3.5 w-3.5" />
            {waiting.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {waiting.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nobody is waiting"
              description="Patients appear here after they check in on the day of their appointment."
              className="py-8"
            />
          ) : (
            <ul className="space-y-2">
              {waiting.map((entry) => {
                const appointment = appointmentById.get(entry.appointmentId);

                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                        Number(entry.priority) === 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700',
                      )}
                    >
                      {formatToken(entry.tokenNumber)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PatientLine patient={appointment?.patient} fallback={entry.patientName} />
                        <Badge variant={priorityBadge(entry.priority).variant}>
                          {priorityBadge(entry.priority).label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Position #{entry.position} · Est. wait {formatWait(entry.estimatedWaitMinutes)}
                        {entry.estimatedStartTime ? ` · around ${entry.estimatedStartTime}` : ''}
                      </p>
                      {appointment?.reason && (
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {appointment.reason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {appointment && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailAppointment(appointment)}
                        >
                          Details
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setNoShowTarget(entry)}
                        disabled={Boolean(action)}
                      >
                        <UserX className="h-4 w-4" />
                        No-show
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Today&apos;s appointments</CardTitle>
            <CardDescription>
              {counts
                ? `${counts.total} scheduled · ${counts.booked} still to check in · ${counts.inQueue} in the queue`
                : 'Your schedule for today.'}
            </CardDescription>
          </div>
          <Link
            to="/doctor/appointments"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {dashboardAppointments.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title="No appointments today"
              description="Your booked patients will appear here on the day of their visit."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboardAppointments.map((appointment) => {
                const status = appointmentStatusBadge(appointment.status);

                return (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="w-12 shrink-0 text-sm font-semibold text-slate-700">
                      {appointment.slotTime ?? '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PatientLine patient={appointment.patient} />
                        {appointment.isEmergency && <Badge variant="red">Emergency</Badge>}
                        {appointment.queueEntry && (
                          <Badge variant="blue">
                            {formatToken(appointment.queueEntry.tokenNumber)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {appointment.reason || 'No reason provided'}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetailAppointment(appointment)}
                    >
                      Details
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {upcomingToday.length > 0 && (
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {upcomingToday.length} booked patient
              {upcomingToday.length === 1 ? '' : 's'} still need to check in. Tokens are
              issued at the reception desk when they arrive.
            </p>
          )}
        </CardContent>
      </Card>

      <DsaPanel dsa={queue?.dsa} />

      <EmergencyDialog
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        onSubmit={handleEmergency}
        submitting={action === 'emergency'}
      />

      <DelayDialog
        open={delayOpen}
        onClose={() => setDelayOpen(false)}
        onSubmit={handleDelay}
        submitting={action === 'delay'}
        currentDelay={delayMinutes}
      />

      <PatientDetailsDialog
        appointment={detailAppointment}
        open={Boolean(detailAppointment)}
        onClose={() => setDetailAppointment(null)}
      />

      <ConfirmDialog
        open={Boolean(noShowTarget)}
        onClose={() => setNoShowTarget(null)}
        onConfirm={handleNoShow}
        title="Mark this patient as a no-show?"
        description={
          noShowTarget
            ? `Token ${formatToken(noShowTarget.tokenNumber)} will leave the queue and the appointment will be marked as a no-show.`
            : undefined
        }
        confirmLabel="Mark no-show"
        loading={action === 'no-show'}
      />
    </div>
  );
}
