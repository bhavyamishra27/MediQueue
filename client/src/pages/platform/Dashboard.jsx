import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarCheck2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
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
import { HospitalFormDialog } from '../../components/platform/HospitalFormDialog';
import { usePolling } from '../../hooks/usePolling';
import { platformApi } from '../../lib/api';
import { cn } from '../../lib/utils';

const DASHBOARD_POLL_INTERVAL = 60000;

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
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

export default function PlatformDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  const loadDashboard = async ({ quiet = false, signal } = {}) => {
    try {
      const next = await platformApi.dashboard({ signal });
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard({ quiet: true });
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading platform dashboard" />
      </div>
    );
  }

  const hospitals = data?.hospitals;
  const admins = data?.hospitalAdmins;
  const doctors = data?.doctors;
  const patients = data?.patients;
  const appointments = data?.appointments;
  const missingAdmins = hospitals?.withoutAdmin ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Platform overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Register hospitals, create their administrators and keep an eye on the network.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="h-4 w-4" />
            Register hospital
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

      {missingAdmins > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            {missingAdmins} hospital{missingAdmins === 1 ? '' : 's'} still need
            {missingAdmins === 1 ? 's' : ''} an administrator.
          </p>
          <Link
            to="/platform/hospital-admins"
            className="inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950"
          >
            Assign one now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Building2}
          label="Hospitals"
          value={hospitals?.total ?? 0}
          hint={`${hospitals?.withAdmin ?? 0} with an admin`}
          tone="blue"
        />
        <StatCard
          icon={ShieldCheck}
          label="Hospital admins"
          value={admins?.total ?? 0}
          hint={missingAdmins ? `${missingAdmins} unassigned` : 'All hospitals covered'}
          tone="violet"
        />
        <StatCard
          icon={Stethoscope}
          label="Doctors"
          value={doctors?.total ?? 0}
          hint={`${doctors?.active ?? 0} active`}
          tone="teal"
        />
        <StatCard
          icon={Users}
          label="Patients"
          value={patients?.total ?? 0}
          hint="Registered accounts"
          tone="slate"
        />
        <StatCard
          icon={CalendarCheck2}
          label="Appointments today"
          value={appointments?.today ?? 0}
          hint={`${appointments?.total ?? 0} all time`}
          tone="amber"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Recently registered hospitals</CardTitle>
            <CardDescription>
              The newest hospitals on this MediQueue installation.
            </CardDescription>
          </div>
          <Link
            to="/platform/hospitals"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {!data?.recentHospitals?.length ? (
            <EmptyState
              icon={Building2}
              title="No hospitals registered"
              description="Register the first hospital and create its administrator account."
              className="m-6 py-10"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentHospitals.map((hospital) => (
                <li
                  key={hospital.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{hospital.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {hospital.city} · {hospital.doctorCount} doctor
                      {hospital.doctorCount === 1 ? '' : 's'}
                      {hospital.admin ? ` · Admin ${hospital.admin.name}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hospital.admin ? (
                      <Badge variant="violet">Administrator assigned</Badge>
                    ) : (
                      <Badge variant="amber">Needs an administrator</Badge>
                    )}
                    <Badge variant="blue">{hospital.city}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Administration shortcuts</CardTitle>
          <CardDescription>Everything the platform team needs in one place.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
          >
            <Building2 className="h-5 w-5 text-blue-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Register a hospital</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Create the hospital and its first administrator together.
            </p>
          </button>
          <Link
            to="/platform/hospitals"
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-200 hover:bg-teal-50/40"
          >
            <Building2 className="h-5 w-5 text-teal-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Hospital directory</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Browse every hospital, its admin and doctor count.
            </p>
          </Link>
          <Link
            to="/platform/hospital-admins"
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:bg-violet-50/40"
          >
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Hospital administrators</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Assign admins, update details and reset passwords.
            </p>
          </Link>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        <p>
          Platform administrators do not manage clinical queues. Hospital administrators keep their
          own hospital isolated and scoped.
        </p>
        <Link to="/platform/hospitals" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          Manage hospitals
        </Link>
      </div>

      <HospitalFormDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={() => loadDashboard({ quiet: true })}
      />
    </div>
  );
}
