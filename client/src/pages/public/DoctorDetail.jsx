import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseMedical,
  Building2,
  CalendarClock,
  Clock,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { catalogApi } from '../../lib/api';
import { DAYS_OF_WEEK, WEEK_ORDER, formatTimeRange } from '../../lib/dates';
import { getInitials, getRoleHome } from '../../lib/roles';

export default function DoctorDetail() {
  const { id } = useParams();
  const { status, user } = useAuth();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNotFound(false);

    catalogApi
      .doctor(id, { signal: controller.signal })
      .then((data) => setDoctor(data.doctor))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        if (requestError.status === 404) setNotFound(true);
        else setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
        <Spinner label="Loading doctor" />
      </div>
    );
  }

  if (notFound) {
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

  if (error || !doctor) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {error || 'The doctor profile could not be loaded.'}
      </div>
    );
  }

  const schedulesByDay = new Map();
  for (const schedule of doctor.schedules) {
    const list = schedulesByDay.get(schedule.dayOfWeek) ?? [];
    list.push(schedule);
    schedulesByDay.set(schedule.dayOfWeek, list);
  }

  const dayByValue = new Map(DAYS_OF_WEEK.map((day) => [day.value, day]));
  const isAuthenticated = status === 'authenticated' && Boolean(user);
  const isPatient = isAuthenticated && user.role === 'PATIENT';
  const bookingPath = `/patient/book/${doctor.id}`;

  return (
    <div className="space-y-8">
      <Link
        to="/doctors"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        All doctors
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-br from-teal-50 via-white to-white px-6 py-8 sm:px-8">
            <div className="flex flex-wrap items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-lg font-semibold text-white shadow-sm">
                {getInitials(doctor.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                    {doctor.name}
                  </h1>
                  <Badge variant="teal">{doctor.specialization}</Badge>
                </div>
                {doctor.qualification && (
                  <p className="mt-1 text-sm text-slate-600">{doctor.qualification}</p>
                )}
                {doctor.hospital && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {doctor.hospital.name}, {doctor.hospital.city}
                  </p>
                )}
              </div>
            </div>

            {doctor.bio && (
              <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-600">
                {doctor.bio}
              </p>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Experience
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <BriefcaseMedical className="h-4 w-4 text-teal-600" />
                  {doctor.experienceYears != null
                    ? `${doctor.experienceYears} years`
                    : 'Not listed'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Average consultation
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Clock className="h-4 w-4 text-teal-600" />~
                  {doctor.avgConsultationMinutes} minutes
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Room
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {doctor.roomNumber || 'Assigned at check-in'}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-600" />
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Weekly consultation schedule
              </h2>
            </div>

            {doctor.schedules.length === 0 ? (
              <EmptyState
                className="mt-5"
                icon={CalendarClock}
                title="No published schedule"
                description="This doctor has no active weekly sessions yet. Please check back later."
              />
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {WEEK_ORDER.map((dayValue) => {
                  const day = dayByValue.get(dayValue);
                  const sessions = schedulesByDay.get(dayValue) ?? [];

                  return (
                    <div
                      key={dayValue}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {day?.label}
                        </p>
                        <Badge variant={sessions.length ? 'green' : 'default'}>
                          {sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'Closed'}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {sessions.length === 0 ? (
                          <p className="text-xs text-slate-400">No sessions</p>
                        ) : (
                          sessions.map((session) => (
                            <div
                              key={session.id}
                              className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs text-teal-800 ring-1 ring-inset ring-teal-100"
                            >
                              <span className="font-medium">
                                {formatTimeRange(session.startTime, session.endTime)}
                              </span>
                              <span className="ml-1 text-teal-600">
                                · {session.slotDurationMinutes} min slots
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-semibold text-slate-900">Hospital</h2>
            </div>

            {doctor.hospital ? (
              <>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {doctor.hospital.name}
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {doctor.hospital.address}, {doctor.hospital.city}
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {doctor.hospital.phone}
                  </p>
                  {doctor.hospital.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {doctor.hospital.email}
                    </p>
                  )}
                </div>
                <Link
                  to={`/hospitals/${doctor.hospital.id}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View hospital
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Hospital information is not available.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-base font-semibold text-blue-900">Book an appointment</h2>
            {isPatient ? (
              <>
                <p className="mt-2 text-sm leading-6 text-blue-900/80">
                  Choose an available slot for the next two weeks. Your booking is confirmed
                  immediately and appears under “My appointments”.
                </p>
                <Link
                  to={bookingPath}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                >
                  Choose a slot
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : isAuthenticated ? (
              <>
                <p className="mt-2 text-sm leading-6 text-blue-900/80">
                  Only patient accounts can book appointments. Sign in with a patient
                  account to reserve a slot with {doctor.name}.
                </p>
                <Link
                  to={getRoleHome(user.role)}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Go to your dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-blue-900/80">
                  Sign in with a patient account to choose an available slot in the next
                  two weeks. Your booking is confirmed immediately.
                </p>
                <Link
                  to="/login"
                  state={{ from: { pathname: bookingPath } }}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                >
                  Sign in to book
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-3 text-xs text-blue-900/70">
                  New patient?{' '}
                  <Link to="/register" className="font-medium underline hover:no-underline">
                    Create an account
                  </Link>
                  .
                </p>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
