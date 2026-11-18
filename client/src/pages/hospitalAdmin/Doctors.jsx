import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Pencil,
  Plus,
  Stethoscope,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { DoctorFormDialog } from '../../components/hospitalAdmin/DoctorFormDialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hospitalAdminApi } from '../../lib/api';
import { formatScheduleSummary } from '../../lib/dates';
import { getInitials } from '../../lib/roles';

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

export default function HospitalDoctors() {
  const { user } = useAuth();
  const toast = useToast();

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const loadDoctors = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await hospitalAdminApi.doctors();
      setDoctors(data.doctors ?? []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const openCreate = () => {
    setEditingDoctor(null);
    setDialogOpen(true);
  };

  const openEdit = (doctor) => {
    setEditingDoctor(doctor);
    setDialogOpen(true);
  };

  const handleToggleStatus = async () => {
    if (!confirmTarget) return;

    setConfirmLoading(true);
    try {
      if (confirmTarget.isActive) {
        await hospitalAdminApi.deactivateDoctor(confirmTarget.id);
        toast.success(`${confirmTarget.name} is now inactive.`);
      } else {
        await hospitalAdminApi.updateDoctor(confirmTarget.id, { isActive: true });
        toast.success(`${confirmTarget.name} is active again.`);
      }
      setConfirmTarget(null);
      await loadDoctors();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const activeCount = doctors.filter((doctor) => doctor.isActive).length;
  const inactiveCount = doctors.length - activeCount;
  const activeSessions = doctors.reduce(
    (total, doctor) =>
      total + doctor.schedules.filter((schedule) => schedule.isActive).length,
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
            <Stethoscope className="h-4 w-4" />
            Hospital management
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Doctors
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage doctor accounts and profiles for {user?.hospitalName || 'your hospital'}.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add doctor
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={UserCheck}
          label="Active doctors"
          value={activeCount}
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={UserX}
          label="Inactive doctors"
          value={inactiveCount}
          tone="bg-slate-100 text-slate-500"
        />
        <StatCard
          icon={CalendarClock}
          label="Active sessions / week"
          value={activeSessions}
          tone="bg-blue-50 text-blue-600"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={loadDoctors}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
          <Spinner label="Loading doctors" />
        </div>
      ) : doctors.length === 0 && !error ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors yet"
          description="Create the first doctor account for your hospital. You can add weekly schedules right after."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add your first doctor
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Doctor</th>
                  <th className="px-5 py-3 font-medium">Specialisation</th>
                  <th className="px-5 py-3 font-medium">Room</th>
                  <th className="px-5 py-3 font-medium">Avg time</th>
                  <th className="px-5 py-3 font-medium">Weekly schedule</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((doctor) => (
                  <tr key={doctor.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">
                          {getInitials(doctor.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{doctor.name}</p>
                          <p className="truncate text-xs text-slate-500">{doctor.email}</p>
                          {doctor.phone && (
                            <p className="text-xs text-slate-400">{doctor.phone}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="teal">{doctor.specialization}</Badge>
                      {doctor.qualification && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          {doctor.qualification}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {doctor.roomNumber || '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {doctor.avgConsultationMinutes} min
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-slate-600">
                        {formatScheduleSummary(doctor.schedules)}
                      </span>
                      <Link
                        to={`/hospital/schedules?doctorId=${doctor.id}`}
                        className="mt-1 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Manage schedule
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      {doctor.isActive ? (
                        <Badge variant="green">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="default">
                          <XCircle className="h-3 w-3" />
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(doctor)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={
                            doctor.isActive
                              ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                              : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                          }
                          onClick={() => setConfirmTarget(doctor)}
                        >
                          {doctor.isActive ? (
                            <UserX className="h-3.5 w-3.5" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )}
                          {doctor.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DoctorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        doctor={editingDoctor}
        onSaved={loadDoctors}
      />

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleToggleStatus}
        title={confirmTarget?.isActive ? 'Deactivate doctor?' : 'Reactivate doctor?'}
        description={
          confirmTarget?.isActive
            ? `${confirmTarget?.name} will disappear from the public directory. Existing data is kept.`
            : `${confirmTarget?.name} will be visible in the public directory again.`
        }
        confirmLabel={confirmTarget?.isActive ? 'Deactivate' : 'Reactivate'}
        tone={confirmTarget?.isActive ? 'danger' : 'secondary'}
        loading={confirmLoading}
      />
    </div>
  );
}
