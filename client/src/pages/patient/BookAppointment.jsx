import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  MapPin,
  Stethoscope,
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
import { FieldError, Label } from '../../components/ui/Label';
import { Textarea } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { appointmentApi, catalogApi } from '../../lib/api';
import {
  addDaysToDateString,
  formatDateLabel,
  formatDateLong,
  formatTimeRange,
  getDayLabel,
  getDayOfWeekFromDateString,
  getTodayDateString,
} from '../../lib/dates';
import { getInitials } from '../../lib/roles';

const BOOKING_DAYS = 14;

function buildDateOptions() {
  const today = getTodayDateString();
  return Array.from({ length: BOOKING_DAYS }, (_, index) => {
    const value = addDaysToDateString(today, index);
    return {
      value,
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatDateLabel(value),
    };
  });
}

export default function BookAppointment() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const dateOptions = useMemo(buildDateOptions, []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);

  const [doctor, setDoctor] = useState(null);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [doctorError, setDoctorError] = useState('');
  const [doctorNotFound, setDoctorNotFound] = useState(false);

  const [availability, setAvailability] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  const [selectedTime, setSelectedTime] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setDoctorLoading(true);
    setDoctorError('');
    setDoctorNotFound(false);

    catalogApi
      .doctor(doctorId, { signal: controller.signal })
      .then((data) => setDoctor(data.doctor))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        if (requestError.status === 404) setDoctorNotFound(true);
        else setDoctorError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDoctorLoading(false);
      });

    return () => controller.abort();
  }, [doctorId]);

  useEffect(() => {
    if (!doctor) return undefined;

    const controller = new AbortController();
    setSlotsLoading(true);
    setSlotsError('');
    setSelectedTime('');

    catalogApi
      .slots(doctorId, selectedDate, { signal: controller.signal })
      .then((data) => setAvailability(data))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setAvailability(null);
        setSlotsError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });

    return () => controller.abort();
  }, [doctor, doctorId, selectedDate]);

  const reloadSlots = async () => {
    setSlotsLoading(true);
    setSlotsError('');
    try {
      const data = await catalogApi.slots(doctorId, selectedDate);
      setAvailability(data);
      setSelectedTime('');
    } catch (requestError) {
      setSlotsError(requestError.message);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleBook = async (event) => {
    event.preventDefault();

    if (!selectedTime) {
      setFieldErrors({ slotTime: 'Choose an available slot first.' });
      return;
    }

    setBooking(true);
    setFieldErrors({});

    try {
      const data = await appointmentApi.book({
        doctorId,
        date: selectedDate,
        slotTime: selectedTime,
        reason: reason.trim() || undefined,
      });

      toast.success(
        `Booked ${formatDateLabel(data.appointment.date)} at ${data.appointment.slotTime}.`,
        'Appointment confirmed',
      );
      navigate('/patient/appointments');
    } catch (requestError) {
      if (requestError.status === 409) {
        toast.error(requestError.message, 'Slot unavailable');
        await reloadSlots();
      } else if (requestError.status === 400) {
        setFieldErrors(requestError.details ?? {});
        toast.error(requestError.message);
        await reloadSlots();
      } else {
        toast.error(requestError.message);
      }
    } finally {
      setBooking(false);
    }
  };

  if (doctorLoading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
        <Spinner label="Loading doctor" />
      </div>
    );
  }

  if (doctorNotFound) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Doctor not found"
        description="This doctor may be inactive or the link is incorrect."
        action={
          <Link
            to="/doctors"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to doctors
          </Link>
        }
      />
    );
  }

  if (doctorError || !doctor) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {doctorError || 'The doctor profile could not be loaded.'}
      </div>
    );
  }

  const slots = availability?.slots ?? [];
  const availableSlots = slots.filter((slot) => slot.available);

  return (
    <div className="space-y-6">
      <Link
        to={`/doctors/${doctor.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to doctor profile
      </Link>

      <header>
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
          <CalendarPlus className="h-4 w-4" />
          New appointment
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Book with {doctor.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose an available slot. Slots are confirmed immediately and can be cancelled
          from “My appointments”.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Pick a date</CardTitle>
                <CardDescription>
                  Booking is open for the next {BOOKING_DAYS} days.
                </CardDescription>
              </div>
              <Badge variant="blue">{formatDateLong(selectedDate)}</Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {dateOptions.map((option) => {
                const isActive = option.value === selectedDate;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedDate(option.value)}
                    className={`flex min-w-[86px] shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition ${
                      isActive
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className="text-xs font-medium uppercase tracking-wide opacity-80">
                      {getDayLabel(getDayOfWeekFromDateString(option.value), {
                        short: true,
                      })}
                    </span>
                    <span className="mt-0.5 text-sm font-semibold">{option.label}</span>
                  </button>
                );
              })}
            </div>

            {availability?.sessions?.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Session windows
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availability.sessions.map((session) => (
                    <span
                      key={session.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
                    >
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {formatTimeRange(session.startTime, session.endTime)} ·{' '}
                      {session.slotDurationMinutes} min
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="mb-0">Available slots</Label>
                {availability && (
                  <span className="text-xs text-slate-500">
                    {availableSlots.length} of {slots.length} open
                  </span>
                )}
              </div>

              {slotsLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner label="Loading slots" />
                </div>
              ) : slotsError ? (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {slotsError}
                </div>
              ) : slots.length === 0 ? (
                <EmptyState
                  className="mt-3"
                  icon={CalendarClock}
                  title="No sessions on this day"
                  description="This doctor is not consulting on the selected date. Try another day."
                />
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {slots.map((slot) => {
                    const isSelected = slot.time === selectedTime;

                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => {
                          setSelectedTime(slot.time);
                          setFieldErrors((current) => {
                            if (!current.slotTime) return current;
                            const next = { ...current };
                            delete next.slotTime;
                            return next;
                          });
                        }}
                        className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                          !slot.available
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 line-through'
                            : isSelected
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                        aria-pressed={isSelected}
                        aria-label={
                          slot.available
                            ? `${slot.time} to ${slot.endTime}`
                            : `${slot.time} is not available`
                        }
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}

              <FieldError>{fieldErrors.slotTime}</FieldError>
            </div>

            <form className="space-y-4" onSubmit={handleBook}>
              <div>
                <Label htmlFor="reason">Reason for visit (optional)</Label>
                <Textarea
                  id="reason"
                  className="mt-1.5"
                  rows={3}
                  maxLength={500}
                  placeholder="Briefly describe your symptoms or the purpose of the visit."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">{reason.length}/500</p>
                <FieldError>{fieldErrors.reason}</FieldError>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {selectedTime ? (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    <span>
                      <span className="font-medium text-slate-900">
                        {formatDateLabel(selectedDate)} at {selectedTime}
                      </span>{' '}
                      with {doctor.name}
                    </span>
                  </p>
                ) : (
                  <p>Select a time slot above to continue.</p>
                )}
              </div>

              <Button type="submit" loading={booking} disabled={!selectedTime || booking}>
                <CalendarPlus className="h-4 w-4" />
                Confirm appointment
              </Button>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-sm font-semibold text-white">
                {getInitials(doctor.name)}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{doctor.name}</p>
                <Badge variant="teal" className="mt-1">
                  {doctor.specialization}
                </Badge>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {doctor.hospital && (
                <>
                  <p className="flex items-start gap-1.5">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    {doctor.hospital.name}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    {doctor.hospital.address}, {doctor.hospital.city}
                  </p>
                </>
              )}
              <p className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />~
                {doctor.avgConsultationMinutes} minutes per consultation
              </p>
            </div>

            <Link
              to={`/doctors/${doctor.id}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View full profile
            </Link>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-sm leading-6 text-blue-900/80">
            <p className="font-semibold text-blue-900">How booking works</p>
            <p className="mt-2">
              Booking reserves a fixed slot. On the appointment day you check in, receive a
              digital token, and join the doctor’s live priority queue.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
