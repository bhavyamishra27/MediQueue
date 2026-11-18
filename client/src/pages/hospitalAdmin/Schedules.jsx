import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  CalendarPlus,
  Clock,
  Pencil,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Spinner } from '../../components/ui/Spinner';
import { ScheduleFormDialog } from '../../components/hospitalAdmin/ScheduleFormDialog';
import { useToast } from '../../context/ToastContext';
import { hospitalAdminApi } from '../../lib/api';
import {
  DAYS_OF_WEEK,
  WEEK_ORDER,
  formatDuration,
  formatTimeRange,
  getDayLabel,
  timeToMinutes,
} from '../../lib/dates';

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function HospitalSchedules() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(
    searchParams.get('doctorId') ?? '',
  );
  const [schedules, setSchedules] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    hospitalAdminApi
      .doctors()
      .then((data) => {
        if (cancelled) return;
        const list = data.doctors ?? [];
        setDoctors(list);
        setSelectedDoctorId((current) => {
          if (current && list.some((doctor) => doctor.id === current)) return current;
          return list[0]?.id ?? '';
        });
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDoctors(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDoctorId) {
      setSchedules([]);
      return undefined;
    }

    const controller = new AbortController();
    setLoadingSchedules(true);
    setError('');

    hospitalAdminApi
      .schedules(selectedDoctorId)
      .then((data) => {
        if (!controller.signal.aborted) setSchedules(data.schedules ?? []);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSchedules(false);
      });

    return () => controller.abort();
  }, [selectedDoctorId]);

  const handleDoctorChange = (event) => {
    const value = event.target.value;
    setSelectedDoctorId(value);

    const next = new URLSearchParams(searchParams);
    if (value) next.set('doctorId', value);
    else next.delete('doctorId');
    setSearchParams(next, { replace: true });
  };

  const loadSchedules = async () => {
    if (!selectedDoctorId) return;
    setLoadingSchedules(true);
    try {
      const data = await hospitalAdminApi.schedules(selectedDoctorId);
      setSchedules(data.schedules ?? []);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const openCreate = () => {
    setEditingSchedule(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule) => {
    setEditingSchedule(schedule);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selectedDoctorId) return;

    setDeleting(true);
    try {
      await hospitalAdminApi.deleteSchedule(selectedDoctorId, deleteTarget.id);
      toast.success('Schedule session deleted.');
      setDeleteTarget(null);
      await loadSchedules();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setDeleting(false);
    }
  };

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);
  const totalMinutes = activeSchedules.reduce(
    (total, schedule) =>
      total + (timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime)),
    0,
  );
  const daysCovered = new Set(activeSchedules.map((schedule) => schedule.dayOfWeek)).size;

  const schedulesByDay = new Map();
  for (const schedule of schedules) {
    const list = schedulesByDay.get(schedule.dayOfWeek) ?? [];
    list.push(schedule);
    schedulesByDay.set(schedule.dayOfWeek, list);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
            <CalendarClock className="h-4 w-4" />
            Hospital management
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Weekly schedules
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure the weekly sessions that generate bookable slots for each doctor.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!selectedDoctorId}>
          <CalendarPlus className="h-4 w-4" />
          Add session
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loadingDoctors ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
          <Spinner label="Loading doctors" />
        </div>
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Add a doctor first"
          description="Schedules belong to doctors. Create a doctor profile before configuring weekly sessions."
          action={
            <Link
              to="/hospital/doctors"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Stethoscope className="h-4 w-4" />
              Go to doctors
            </Link>
          }
        />
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-end">
              <div>
                <Label htmlFor="schedule-doctor">Doctor</Label>
                <Select
                  id="schedule-doctor"
                  className="mt-1.5"
                  value={selectedDoctorId}
                  onChange={handleDoctorChange}
                >
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} · {doctor.specialization}
                      {doctor.isActive ? '' : ' (inactive)'}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedDoctor && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
                  <Badge variant="teal">{selectedDoctor.specialization}</Badge>
                  <Badge variant={selectedDoctor.isActive ? 'green' : 'default'}>
                    {selectedDoctor.isActive ? 'Active doctor' : 'Inactive doctor'}
                  </Badge>
                  <span className="text-sm text-slate-500">
                    {selectedDoctor.avgConsultationMinutes} min average consultation
                  </span>
                  <Link
                    to={`/hospital/doctors`}
                    className="ml-auto text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Edit doctor
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={CalendarClock}
              label="Active sessions"
              value={activeSchedules.length}
              tone="bg-blue-50 text-blue-600"
            />
            <StatCard
              icon={Clock}
              label="Weekly hours"
              value={formatDuration(totalMinutes)}
              tone="bg-teal-50 text-teal-600"
            />
            <StatCard
              icon={CalendarPlus}
              label="Days covered"
              value={`${daysCovered} / 7`}
              tone="bg-amber-50 text-amber-600"
            />
          </div>

          {loadingSchedules ? (
            <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
              <Spinner label="Loading schedules" />
            </div>
          ) : schedules.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No weekly sessions yet"
              description={`Add the first session for ${selectedDoctor?.name || 'this doctor'}. Sessions can be edited or deactivated later.`}
              action={
                <Button onClick={openCreate}>
                  <CalendarPlus className="h-4 w-4" />
                  Add session
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {WEEK_ORDER.map((dayValue) => {
                const sessions = schedulesByDay.get(dayValue) ?? [];

                return (
                  <div
                    key={dayValue}
                    className="rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900">
                          {getDayLabel(dayValue)}
                        </h2>
                        <p className="text-xs text-slate-400">
                          {DAYS_OF_WEEK.find((day) => day.value === dayValue)?.short}
                        </p>
                      </div>
                      <Badge variant={sessions.length ? 'blue' : 'default'}>
                        {sessions.length} session{sessions.length === 1 ? '' : 's'}
                      </Badge>
                    </div>

                    <div className="space-y-2 p-3">
                      {sessions.length === 0 ? (
                        <p className="px-1 py-4 text-center text-xs text-slate-400">
                          No sessions
                        </p>
                      ) : (
                        sessions.map((schedule) => (
                          <div
                            key={schedule.id}
                            className={
                              schedule.isActive
                                ? 'rounded-xl border border-slate-200 bg-white p-3'
                                : 'rounded-xl border border-slate-200 bg-slate-50 p-3 opacity-70'
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {formatTimeRange(schedule.startTime, schedule.endTime)}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {schedule.slotDurationMinutes} min slots
                                </p>
                              </div>
                              <Badge variant={schedule.isActive ? 'green' : 'default'}>
                                {schedule.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>

                            <div className="mt-2 flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(schedule)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setDeleteTarget(schedule)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ScheduleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        doctorId={selectedDoctorId}
        schedule={editingSchedule}
        onSaved={loadSchedules}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete schedule session?"
        description={
          deleteTarget
            ? `${getDayLabel(deleteTarget.dayOfWeek)} ${formatTimeRange(
                deleteTarget.startTime,
                deleteTarget.endTime,
              )} will be removed. Slots generated from it will no longer be available in later phases.`
            : ''
        }
        confirmLabel="Delete session"
        loading={deleting}
      />
    </div>
  );
}
