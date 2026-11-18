import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
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
import { HospitalAdminFormDialog } from '../../components/platform/HospitalAdminFormDialog';
import { platformApi } from '../../lib/api';

export default function PlatformHospitalAdmins() {
  const [admins, setAdmins] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState({ open: false, admin: null });

  const loadData = async ({ quiet = false, signal } = {}) => {
    try {
      const [adminData, hospitalData] = await Promise.all([
        platformApi.hospitalAdmins({ signal }),
        platformApi.hospitals({}, { signal }),
      ]);
      setAdmins(adminData.admins ?? []);
      setHospitals(hospitalData.hospitals ?? []);
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
        await loadData({ signal: controller.signal });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData({ quiet: true });
    setRefreshing(false);
  };

  const availableHospitals = useMemo(
    () => hospitals.filter((hospital) => !hospital.admin),
    [hospitals],
  );

  const openCreate = () => setDialog({ open: true, admin: null });
  const openEdit = (admin) => setDialog({ open: true, admin });
  const closeDialog = () => setDialog({ open: false, admin: null });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Hospital administrators
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Each hospital has exactly one administrator who manages its staff and queues.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={openCreate}
            disabled={availableHospitals.length === 0}
            title={
              availableHospitals.length === 0
                ? 'Every hospital already has an administrator.'
                : undefined
            }
          >
            <Plus className="h-4 w-4" />
            Add administrator
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

      {availableHospitals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            {availableHospitals.length} hospital
            {availableHospitals.length === 1 ? '' : 's'} without an administrator:{' '}
            <span className="font-semibold">
              {availableHospitals.map((hospital) => hospital.name).join(', ')}
            </span>
          </p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Assign administrator
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Administrators
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{admins.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Hospitals
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{hospitals.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Unassigned hospitals
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {availableHospitals.length}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Administrator accounts</CardTitle>
            <CardDescription>
              Update contact details or reset a password. Email addresses are fixed after creation.
            </CardDescription>
          </div>
          <Badge variant="violet">{admins.length} total</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner label="Loading administrators" />
            </div>
          ) : admins.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No hospital administrators yet"
              description="Register a hospital to create its first administrator, or assign one to an unassigned hospital."
              className="m-6 py-12"
              action={
                availableHospitals.length > 0 ? (
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Add administrator
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Administrator</th>
                    <th className="px-4 py-2.5 font-semibold">Hospital</th>
                    <th className="px-4 py-2.5 font-semibold">Created</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admins.map((admin) => (
                    <tr key={admin.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                          <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />
                          {admin.name}
                        </p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-600">
                          <Mail className="h-3 w-3 text-slate-400" />
                          {admin.email}
                        </p>
                        {admin.phone && (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-600">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {admin.phone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {admin.hospital ? (
                          <>
                            <p className="inline-flex items-center gap-1 font-medium text-slate-800">
                              <Building2 className="h-3 w-3 text-slate-400" />
                              {admin.hospital.name}
                            </p>
                            <p className="mt-0.5">{admin.hospital.city}</p>
                          </>
                        ) : (
                          <Badge variant="amber">Not assigned</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(admin)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <HospitalAdminFormDialog
        open={dialog.open}
        admin={dialog.admin}
        hospitals={availableHospitals}
        onClose={closeDialog}
        onSaved={() => loadData({ quiet: true })}
      />
    </div>
  );
}
