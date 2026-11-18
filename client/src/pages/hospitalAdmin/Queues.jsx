import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Clock,
  RefreshCw,
  Stethoscope,
  Timer,
  Ticket,
  Users,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { usePolling } from '../../hooks/usePolling';
import { useSocketRefresh } from '../../context/SocketContext';
import { hospitalAdminApi } from '../../lib/api';
import { formatDateLong } from '../../lib/dates';
import { formatClock } from '../../lib/doctor';
import { formatToken, priorityBadge, queueStatusBadge } from '../../lib/queue';
import { cn } from '../../lib/utils';

const QUEUE_POLL_INTERVAL = 15000;

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
};

function Summary({ label, value, icon: Icon, tone = 'slate' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          TONES[tone] ?? TONES.slate,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="text-lg font-semibold leading-tight text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function WaitChip({ minutes }) {
  if (minutes === null || minutes === undefined) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  if (minutes <= 0) {
    return <span className="text-xs text-slate-500">Just now</span>;
  }
  return (
    <span
      className={cn(
        'text-xs font-medium',
        minutes >= 30 ? 'text-amber-700' : 'text-slate-600',
      )}
    >
      {minutes} min
    </span>
  );
}

export default function HospitalQueues() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const loadQueues = async ({ quiet = false, signal } = {}) => {
    try {
      const next = await hospitalAdminApi.queues({ signal });
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
        await loadQueues({ signal: controller.signal });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  usePolling(() => loadQueues({ quiet: true }), QUEUE_POLL_INTERVAL, {
    enabled: !loading,
  });

  useSocketRefresh(
    ['queue:updated', 'queue:emergency', 'appointments:updated'],
    () => loadQueues({ quiet: true }),
    { enabled: !loading, delay: 400 },
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadQueues({ quiet: true });
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading queue monitor" />
      </div>
    );
  }

  const totals = data?.totals;
  const queues = (data?.queues ?? []).filter(
    (queue) => !activeOnly || queue.counts.active > 0 || queue.delay.minutes > 0,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/hospital"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Queue monitor
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" />
              {formatDateLong(data?.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-slate-400" />
              Read-only · live updates, 15-second polling fallback
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeOnly ? 'secondary' : 'outline'}
            onClick={() => setActiveOnly((current) => !current)}
          >
            <Users className="h-4 w-4" />
            {activeOnly ? 'Showing active only' : 'Show active only'}
          </Button>
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Summary label="Doctors" value={totals?.doctors ?? 0} icon={Stethoscope} tone="blue" />
        <Summary label="Waiting" value={totals?.waiting ?? 0} icon={Users} tone="teal" />
        <Summary
          label="In consultation"
          value={totals?.inConsultation ?? 0}
          icon={Activity}
          tone="violet"
        />
        <Summary label="Delays" value={totals?.delays ?? 0} icon={Timer} tone="red" />
        <Summary label="Emergencies" value={totals?.emergency ?? 0} icon={Ticket} tone="amber" />
      </div>

      {queues.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={activeOnly ? 'No active queues right now' : 'No doctors to monitor'}
          description={
            activeOnly
              ? 'Every doctor is currently idle. Switch off the active-only filter to see all doctors.'
              : 'Add doctors and schedules so patients can book and check in.'
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {queues.map((queue) => {
            const currentStatus = queue.current
              ? queueStatusBadge(queue.current.status)
              : null;

            return (
              <Card key={queue.doctor.id}>
                <CardHeader className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {queue.doctor.name}
                      {!queue.doctor.isActive && <Badge>Inactive</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {queue.doctor.specialization}
                      {queue.doctor.roomNumber ? ` · Room ${queue.doctor.roomNumber}` : ''}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {queue.delay.minutes > 0 && (
                      <Badge variant="red">+{queue.delay.minutes} min delay</Badge>
                    )}
                    {queue.counts.emergency > 0 && <Badge variant="red">Emergency</Badge>}
                    <Badge variant={queue.counts.active > 0 ? 'teal' : 'default'}>
                      {queue.counts.active} active
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-5">
                  {queue.delay.minutes > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <p className="font-semibold">Delay reported</p>
                      <p className="mt-0.5">
                        +{queue.delay.minutes} minutes · {queue.delay.reason}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Now serving
                    </p>
                    {queue.current ? (
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-violet-600 px-2 text-xs font-bold text-white">
                            {formatToken(queue.current.tokenNumber)}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {queue.current.patientName}
                            </p>
                            <p className="text-xs text-slate-500">
                              Called {formatClock(queue.current.calledAt)}
                              {queue.current.isEmergency ? ' · Emergency' : ''}
                            </p>
                          </div>
                        </div>
                        {currentStatus && (
                          <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-500">
                        No patient is currently with the doctor.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Waiting ({queue.counts.waiting})
                      </p>
                      {queue.counts.waiting > 0 && (
                        <span className="text-[11px] text-slate-400">
                          Min-heap order: emergency first, then token
                        </span>
                      )}
                    </div>

                    {queue.waiting.length === 0 ? (
                      <p className="mt-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-500">
                        No patients waiting.
                      </p>
                    ) : (
                      <div className="mt-1.5 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                            <tr>
                              <th className="py-1 pr-2 font-semibold">#</th>
                              <th className="py-1 pr-2 font-semibold">Token</th>
                              <th className="py-1 pr-2 font-semibold">Patient</th>
                              <th className="py-1 pr-2 font-semibold">Priority</th>
                              <th className="py-1 pr-2 font-semibold">Slot</th>
                              <th className="py-1 pr-2 font-semibold">Checked in</th>
                              <th className="py-1 text-right font-semibold">Wait</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {queue.waiting.map((entry) => {
                              const priority = priorityBadge(entry.priority);
                              return (
                                <tr key={entry.id}>
                                  <td className="py-2 pr-2 text-xs text-slate-400">
                                    {entry.position}
                                  </td>
                                  <td className="whitespace-nowrap py-2 pr-2 font-semibold text-slate-800">
                                    {formatToken(entry.tokenNumber)}
                                  </td>
                                  <td className="max-w-[10rem] truncate py-2 pr-2 text-slate-800">
                                    {entry.patientName}
                                  </td>
                                  <td className="whitespace-nowrap py-2 pr-2">
                                    <Badge variant={priority.variant}>{priority.label}</Badge>
                                  </td>
                                  <td className="whitespace-nowrap py-2 pr-2 text-xs text-slate-600">
                                    {entry.slotTime ?? '—'}
                                  </td>
                                  <td className="whitespace-nowrap py-2 pr-2 text-xs text-slate-600">
                                    {formatClock(entry.checkedInAt)}
                                  </td>
                                  <td className="whitespace-nowrap py-2 text-right">
                                    <WaitChip minutes={entry.waitMinutes} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>About this view</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-slate-600">
          <p>
            This monitor is read-only. Doctors control their own queue by calling the next patient,
            starting and completing consultations, adding emergencies and reporting delays.
          </p>
          <p>
            Waiting patients are shown in the same order as the min-heap: emergency priority first,
            then the lowest token number. Emergency patients always jump ahead of normal arrivals.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
