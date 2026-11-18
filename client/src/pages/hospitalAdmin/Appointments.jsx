import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  RefreshCw,
  Stethoscope,
  Ticket,
  UserRound,
  UserX,
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
import { Select } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { PatientDetailsDialog } from '../../components/doctor/PatientDetailsDialog';
import { usePolling } from '../../hooks/usePolling';
import { hospitalAdminApi } from '../../lib/api';
import { formatDateLong, getTodayDateString } from '../../lib/dates';
import { formatPatientMeta } from '../../lib/doctor';
import { appointmentStatusBadge, formatToken } from '../../lib/queue';
import { cn } from '../../lib/utils';

const APPOINTMENT_POLL_INTERVAL = 60000;

const IN_QUEUE_STATUSES = ['CHECKED_IN', 'CALLED', 'IN_CONSULTATION'];

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'booked', label: 'Booked', test: (appointment) => appointment.status === 'BOOKED' },
  {
    id: 'queue',
    label: 'In queue',
    test: (appointment) => IN_QUEUE_STATUSES.includes(appointment.status),
  },
  {
    id: 'completed',
    label: 'Completed',
    test: (appointment) => appointment.status === 'COMPLETED',
  },
  {
    id: 'no-show',
    label: 'No show / cancelled',
    test: (appointment) =>
      appointment.status === 'NO_SHOW' || appointment.status === 'CANCELLED',
  },
];

function Summary({ label, value, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    teal: 'bg-teal-50 text-teal-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          tones[tone] ?? tones.slate,
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

export default function HospitalAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [counts, setCounts] = useState(null);
  const [date, setDate] = useState(getTodayDateString());
  const [doctorId, setDoctorId] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const loadAppointments = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await hospitalAdminApi.appointments(
        { date, doctorId },
        { signal },
      );
      setAppointments(data.appointments ?? []);
      setDoctors(data.doctors ?? []);
      setCounts(data.counts ?? null);
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
        await loadAppointments({ signal: controller.signal });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Re-fetch whenever the administrator changes the day or doctor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, doctorId]);

  usePolling(() => loadAppointments({ quiet: true }), APPOINTMENT_POLL_INTERVAL, {
    enabled: !loading,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAppointments({ quiet: true });
    setRefreshing(false);
  };

  const visible = useMemo(() => {
    const matcher = FILTERS.find((item) => item.id === filter)?.test ?? (() => true);
    return appointments.filter(matcher);
  }, [appointments, filter]);

  const filterCounts = useMemo(() => {
    const result = {};
    for (const item of FILTERS) {
      result[item.id] = appointments.filter(item.test).length;
    }
    return result;
  }, [appointments]);

  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId);
  const isToday = date === getTodayDateString();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {isToday ? "Today's appointments" : 'Appointments'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-slate-400" />
              {formatDateLong(date)}
            </span>
            {selectedDoctor ? (
              <span className="inline-flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4 text-slate-400" />
                {selectedDoctor.name}
                {selectedDoctor.roomNumber ? ` · Room ${selectedDoctor.roomNumber}` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4 text-slate-400" />
                All doctors
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">View date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Doctor</span>
            <Select
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              className="min-w-[11rem]"
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                  {doctor.roomNumber ? ` (${doctor.roomNumber})` : ''}
                </option>
              ))}
            </Select>
          </label>
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
        <Summary label="Total" value={counts?.total ?? 0} icon={CalendarCheck2} tone="slate" />
        <Summary label="Booked" value={counts?.booked ?? 0} icon={Clock} tone="blue" />
        <Summary label="In queue" value={counts?.inQueue ?? 0} icon={Users} tone="teal" />
        <Summary
          label="Completed"
          value={counts?.completed ?? 0}
          icon={CheckCircle2}
          tone="green"
        />
        <Summary label="No show" value={counts?.noShow ?? 0} icon={UserX} tone="red" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              filter === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
            )}
          >
            {item.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                filter === item.id ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              {filterCounts[item.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Appointment list</CardTitle>
            <CardDescription>
              Tokens are issued when patients check in, so only arrived patients have one.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/hospital/queues" className="text-sm font-medium text-blue-700 hover:text-blue-800">
              Queue monitor
            </Link>
            <Badge variant="blue">{visible.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner label="Loading appointments" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={
                appointments.length === 0
                  ? 'No appointments on this date'
                  : 'Nothing matches this filter'
              }
              description={
                appointments.length === 0
                  ? 'Booked patients will appear here on the day of their visit.'
                  : 'Choose another filter to see the rest of the day.'
              }
              className="m-6 py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Time</th>
                    <th className="px-4 py-2.5 font-semibold">Patient</th>
                    <th className="px-4 py-2.5 font-semibold">Doctor</th>
                    <th className="px-4 py-2.5 font-semibold">Contact</th>
                    <th className="px-4 py-2.5 font-semibold">Reason</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Token</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((appointment) => {
                    const status = appointmentStatusBadge(appointment.status);
                    const meta = formatPatientMeta(appointment.patient);

                    return (
                      <tr key={appointment.id} className="align-top hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                          {appointment.slotTime ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-900">
                              {appointment.patient?.name ?? 'Patient'}
                            </span>
                            {appointment.isEmergency && <Badge variant="red">Emergency</Badge>}
                          </div>
                          {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p className="font-medium text-slate-800">
                            {appointment.doctor?.name ?? 'Doctor'}
                          </p>
                          <p className="mt-0.5">
                            {appointment.doctor?.specialization}
                            {appointment.doctor?.roomNumber
                              ? ` · Room ${appointment.doctor.roomNumber}`
                              : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {appointment.patient?.phone && (
                            <p className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {appointment.patient.phone}
                            </p>
                          )}
                          {appointment.patient?.email && (
                            <p className="mt-0.5 inline-flex items-center gap-1">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {appointment.patient.email}
                            </p>
                          )}
                          {!appointment.patient?.phone && !appointment.patient?.email && '—'}
                        </td>
                        <td className="max-w-[14rem] px-4 py-3 text-xs text-slate-600">
                          <span className="line-clamp-2">
                            {appointment.reason || 'No reason provided'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {appointment.queueEntry ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                              <Ticket className="h-3 w-3" />
                              {formatToken(appointment.queueEntry.tokenNumber)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelected(appointment)}
                          >
                            <UserRound className="h-4 w-4" />
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
