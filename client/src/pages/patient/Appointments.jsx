import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Clock,
  MapPin,
  RefreshCw,
  Stethoscope,
  Ticket,
  XCircle,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button, buttonClasses } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useSocketRefresh } from '../../context/SocketContext';
import { appointmentApi, NOTIFICATIONS_CHANGED_EVENT } from '../../lib/api';
import { formatDateLong, getTodayDateString, isPastDateString } from '../../lib/dates';

const STATUS_BADGES = {
  BOOKED: { label: 'Booked', variant: 'blue' },
  CHECKED_IN: { label: 'Checked in', variant: 'teal' },
  CALLED: { label: 'Called', variant: 'amber' },
  IN_CONSULTATION: { label: 'In consultation', variant: 'violet' },
  COMPLETED: { label: 'Completed', variant: 'green' },
  CANCELLED: { label: 'Cancelled', variant: 'default' },
  NO_SHOW: { label: 'No show', variant: 'red' },
};

function isUpcoming(appointment) {
  if (isPastDateString(appointment.date)) return false;
  return !['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status);
}

function AppointmentCard({ appointment, onCancel, cancellingId, onCheckIn, checkingInId }) {
  const status = STATUS_BADGES[appointment.status] ?? {
    label: appointment.status,
    variant: 'default',
  };
  const canCancel = ['BOOKED', 'CHECKED_IN'].includes(appointment.status);
  const canCheckIn =
    appointment.status === 'BOOKED' && appointment.date === getTodayDateString();
  const inQueue = ['CHECKED_IN', 'CALLED', 'IN_CONSULTATION'].includes(appointment.status);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              {formatDateLong(appointment.date)}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />
                {appointment.slotTime || 'Time not set'}
              </span>
              {appointment.doctor && (
                <span className="inline-flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-slate-400" />
                  {appointment.doctor.name} · {appointment.doctor.specialization}
                </span>
              )}
            </p>
          </div>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        {appointment.hospital && (
          <>
            <p className="flex items-start gap-1.5">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {appointment.hospital.name}
            </p>
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {appointment.hospital.address}, {appointment.hospital.city}
            </p>
          </>
        )}
      </div>

      {appointment.reason && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
          <span className="font-medium text-slate-700">Reason:</span> {appointment.reason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canCheckIn && (
          <Button
            size="sm"
            loading={checkingInId === appointment.id}
            onClick={() => onCheckIn(appointment)}
          >
            <Ticket className="h-4 w-4" />
            Check in &amp; get token
          </Button>
        )}
        {inQueue && (
          <Link to="/patient/queue" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
            <Clock className="h-4 w-4" />
            View live queue
          </Link>
        )}
        {appointment.doctor && (
          <Link
            to={`/doctors/${appointment.doctor.id}`}
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
          >
            <Stethoscope className="h-4 w-4" />
            View doctor
          </Link>
        )}
        {canCancel && (
          <Button
            variant="danger"
            size="sm"
            loading={cancellingId === appointment.id}
            onClick={() => onCancel(appointment)}
          >
            <XCircle className="h-4 w-4" />
            Cancel appointment
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Appointments() {
  const toast = useToast();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingId, setCancellingId] = useState('');
  const [checkingInId, setCheckingInId] = useState('');

  const loadAppointments = async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError('');
    }

    try {
      const data = await appointmentApi.mine();
      setAppointments(data.appointments ?? []);
    } catch (requestError) {
      if (!quiet) setError(requestError.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  useSocketRefresh(['appointments:updated'], () => loadAppointments({ quiet: true }));

  const handleCancel = async () => {
    if (!cancelTarget) return;

    setCancellingId(cancelTarget.id);
    try {
      await appointmentApi.cancel(cancelTarget.id);
      toast.success('The slot has been released.', 'Appointment cancelled');
      setCancelTarget(null);
      await loadAppointments();
    } catch (requestError) {
      toast.error(requestError.message);
      setCancelTarget(null);
      await loadAppointments();
    } finally {
      setCancellingId('');
    }
  };

  const handleCheckIn = async (appointment) => {
    setCheckingInId(appointment.id);
    try {
      const result = await appointmentApi.checkIn(appointment.id);
      toast.success(
        `Your token is #${result.queueEntry.tokenNumber}.`,
        'Checked in',
      );
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      navigate('/patient/queue');
    } catch (requestError) {
      toast.error(requestError.message);
      await loadAppointments();
    } finally {
      setCheckingInId('');
    }
  };

  const today = getTodayDateString();
  const upcoming = appointments
    .filter(isUpcoming)
    .sort((a, b) => `${a.date}${a.slotTime}`.localeCompare(`${b.date}${b.slotTime}`));
  const past = appointments
    .filter((appointment) => !isUpcoming(appointment))
    .sort((a, b) => `${b.date}${b.slotTime}`.localeCompare(`${a.date}${a.slotTime}`));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <CalendarCheck2 className="h-4 w-4" />
            Patient appointments
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            My appointments
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Booked slots are reserved immediately. Cancel a booking to release it for other
            patients.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAppointments} loading={loading}>
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
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
          <Spinner label="Loading appointments" />
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No appointments yet"
          description="Find a doctor and choose an available slot to make your first booking."
          action={
            <Link to="/doctors" className={buttonClasses()}>
              <Stethoscope className="h-4 w-4" />
              Find a doctor
            </Link>
          }
        />
      ) : (
        <>
          <section>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Upcoming
              </h2>
              <span className="text-xs text-slate-500">
                {upcoming.length} appointment{upcoming.length === 1 ? '' : 's'}
              </span>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                No upcoming appointments. Today is {formatDateLong(today)}.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {upcoming.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onCancel={setCancelTarget}
                    cancellingId={cancellingId}
                    onCheckIn={handleCheckIn}
                    checkingInId={checkingInId}
                  />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Past and cancelled
              </h2>
              <div className="mt-3 space-y-3">
                {past.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onCancel={setCancelTarget}
                    cancellingId={cancellingId}
                    onCheckIn={handleCheckIn}
                    checkingInId={checkingInId}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-slate-600">
          On the appointment day, check in from this page or your dashboard to receive a
          digital token and join the doctor’s live queue. You can cancel a booking until the
          doctor calls your token.
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="Cancel this appointment?"
        description={
          cancelTarget
            ? `${formatDateLong(cancelTarget.date)}${
                cancelTarget.slotTime ? ` at ${cancelTarget.slotTime}` : ''
              }${cancelTarget.doctor ? ` with ${cancelTarget.doctor.name}` : ''}`
            : ''
        }
        confirmLabel="Cancel appointment"
        loading={Boolean(cancellingId)}
      />
    </div>
  );
}
