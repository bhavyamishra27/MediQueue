import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock,
  RefreshCw,
  Stethoscope,
  Ticket,
  UserRound,
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
import { PatientDetailsDialog } from '../../components/doctor/PatientDetailsDialog';
import { usePolling } from '../../hooks/usePolling';
import { useSocketRefresh } from '../../context/SocketContext';
import { hospitalAdminApi } from '../../lib/api';
import { formatDateLong, getTodayDateString } from '../../lib/dates';
import { appointmentStatusBadge, formatToken } from '../../lib/queue';
import { cn } from '../../lib/utils';

const DASHBOARD_POLL_INTERVAL = 30000;

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
};

function StatCard({ icon: Icon, label, value, hint, tone = 'slate' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-xl',
            TONES[tone] ?? TONES.slate,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function HospitalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const loadDashboard = async ({ quiet = false, signal } = {}) => {
    try {
      const next = await hospitalAdminApi.dashboard({ signal });
      setData(next);
      setError('');
    } catch (requestError) {
      if (requestError?.name === 'AbortError') return;
      if (!quiet) setError(requestError.message);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        await loadDashboard({ signal: controller.signal });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  usePolling(() => loadDashboard({ quiet: true }), DASHBOARD_POLL_INTERVAL, {
    enabled: !loading,
  });

  useSocketRefresh(
    ['queue:updated', 'queue:emergency', 'appointments:updated'],
    () => loadDashboard({ quiet: true }),
    { enabled: !loading, delay: 400 },
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard({ quiet: true });
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading hospital dashboard" />
      </div>
    );
  }

  const hospital = data?.hospital;
  const appointments = data?.appointments;
  const queue = data?.queue;
  const doctors = data?.doctors;
  const today = data?.date ?? getTodayDateString();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {hospital?.name ?? 'Hospital overview'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-slate-400" />
              {formatDateLong(today)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4 text-slate-400" />
              {doctors?.active ?? 0} active doctor{(doctors?.active ?? 0) === 1 ? '' : 's'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link to="/hospital/appointments" className={buttonClasses({ variant: 'outline' })}>
            <CalendarCheck2 className="h-4 w-4" />
            Appointments
          </Link>
          <Link to="/hospital/queues" className={buttonClasses()}>
            <Activity className="h-4 w-4" />
            Queue monitor
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Stethoscope}
          label="Doctors"
          value={doctors?.total ?? 0}
          hint={`${doctors?.active ?? 0} active`}
          tone="blue"
        />
        <StatCard
          icon={CalendarCheck2}
          label="Appointments today"
          value={appointments?.total ?? 0}
          hint={`${appointments?.booked ?? 0} still booked`}
          tone="slate"
        />
        <StatCard
          icon={Users}
          label="In queue"
          value={queue?.active ?? 0}
          hint={`${queue?.waiting ?? 0} waiting`}
          tone="teal"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={appointments?.completed ?? 0}
          hint={`${appointments?.noShow ?? 0} no show`}
          tone="green"
        />
        <StatCard
          icon={Clock}
          label="Active delays"
          value={data?.delays?.length ?? 0}
          hint={
            data?.delays?.length
              ? data.delays
                  .map((delay) => `${delay.doctorName} +${delay.delayMinutes}m`)
                  .join(', ')
              : 'All doctors on time'
          }
          tone={data?.delays?.length ? 'red' : 'amber'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Queues by doctor</CardTitle>
              <CardDescription>
                Live waiting counts across your hospital. Read-only monitoring.
              </CardDescription>
            </div>
            <Badge variant="teal">{queue?.doctorsWithQueue ?? 0} active</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {!data?.doctorQueues?.length ? (
              <EmptyState
                icon={Stethoscope}
                title="No doctors yet"
                description="Add a doctor and a weekly schedule to start receiving appointments."
                className="m-6 py-10"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.doctorQueues.map((row) => (
                  <li key={row.doctor.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{row.doctor.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {row.doctor.specialization}
                          {row.doctor.roomNumber ? ` · Room ${row.doctor.roomNumber}` : ''}
                          {!row.doctor.isActive ? ' · Inactive' : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.delay.minutes > 0 && (
                          <Badge variant="red">+{row.delay.minutes} min delay</Badge>
                        )}
                        {row.emergency > 0 && <Badge variant="red">Emergency</Badge>}
                        <Badge variant={row.active > 0 ? 'teal' : 'default'}>
                          {row.active} active
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>Waiting: <strong>{row.waiting}</strong></span>
                      <span>Called: <strong>{row.called}</strong></span>
                      <span>In consultation: <strong>{row.inConsultation}</strong></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Today&apos;s appointments</CardTitle>
              <CardDescription>The next few visits for today.</CardDescription>
            </div>
            <Link
              to="/hospital/appointments"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!data?.todayAppointments?.length ? (
              <EmptyState
                icon={CalendarCheck2}
                title="No appointments today"
                description="Bookings for today will appear here as patients reserve slots."
                className="m-6 py-10"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.todayAppointments.map((appointment) => {
                  const status = appointmentStatusBadge(appointment.status);
                  return (
                    <li
                      key={appointment.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                          {appointment.slotTime ?? '—'}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {appointment.patient?.name ?? 'Patient'}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {appointment.doctor?.name ?? 'Doctor'}
                            {appointment.queueEntry
                              ? ` · Token ${formatToken(appointment.queueEntry.tokenNumber)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {appointment.isEmergency && <Badge variant="red">Emergency</Badge>}
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(appointment)}
                        >
                          <UserRound className="h-4 w-4" />
                          Details
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Jump straight to the work that keeps the day moving.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/hospital/doctors"
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
          >
            <Stethoscope className="h-5 w-5 text-blue-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Manage doctors</p>
            <p className="mt-0.5 text-xs text-slate-500">Add staff and update profiles.</p>
          </Link>
          <Link
            to="/hospital/schedules"
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-200 hover:bg-teal-50/40"
          >
            <CalendarClock className="h-5 w-5 text-teal-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Weekly schedules</p>
            <p className="mt-0.5 text-xs text-slate-500">Control when patients can book.</p>
          </Link>
          <Link
            to="/hospital/appointments"
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-200 hover:bg-amber-50/40"
          >
            <Ticket className="h-5 w-5 text-amber-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Appointment list</p>
            <p className="mt-0.5 text-xs text-slate-500">Filter by date, doctor or status.</p>
          </Link>
          <Link
            to="/hospital/queues"
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:bg-violet-50/40"
          >
            <Activity className="h-5 w-5 text-violet-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Queue monitor</p>
            <p className="mt-0.5 text-xs text-slate-500">See every doctor&apos;s live queue.</p>
          </Link>
        </CardContent>
      </Card>

      <PatientDetailsDialog
        appointment={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        showQueueLink={false}
      />
    </div>
  );
}
