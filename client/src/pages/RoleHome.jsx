import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import {
  ROLE_ACCENTS,
  ROLE_BADGE_CLASSES,
  ROLE_DESCRIPTIONS,
  getGreetingName,
  getInitials,
  getRoleHome,
  getRoleLabel,
} from '../lib/roles';
import { cn } from '../lib/utils';

const QUICK_ACTIONS = {
  PATIENT: [
    {
      label: 'My appointments',
      description: 'Review upcoming bookings and cancel a slot you no longer need.',
      to: '/patient/appointments',
      icon: CalendarCheck2,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Book an appointment',
      description: 'Find a doctor and reserve an available consultation slot.',
      to: '/doctors',
      icon: CalendarPlus,
      tone: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'Find a hospital',
      description: 'Browse hospitals, cities and specialisations.',
      to: '/hospitals',
      icon: Building2,
      tone: 'bg-amber-50 text-amber-700',
    },
  ],
  HOSPITAL_ADMIN: [
    {
      label: 'Manage doctors',
      description: 'Add, edit, deactivate and reactivate doctors.',
      to: '/hospital/doctors',
      icon: Stethoscope,
      tone: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'Weekly schedules',
      description: 'Configure consultation sessions for each doctor.',
      to: '/hospital/schedules',
      icon: CalendarClock,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Hospital profile',
      description: 'Update the details shown in the public directory.',
      to: '/hospital/profile',
      icon: Building2,
      tone: 'bg-amber-50 text-amber-700',
    },
  ],
};

const COMING_NEXT = {
  PATIENT: [
    'Check in on the appointment day',
    'Receive a digital token at check-in',
    'Track your live position and estimated wait',
    'Receive queue and delay notifications',
  ],
  DOCTOR: [
    "See today's appointments and patient details",
    'Call the next patient in priority order',
    'Start and complete consultations',
    'Add emergency patients and report delays',
  ],
  HOSPITAL_ADMIN: [
    'Review and manage appointments for your hospital',
    'Monitor every live queue in real time',
    'Handle emergency priority cases',
    'See hospital-level queue analytics',
  ],
  PLATFORM_ADMIN: [
    'Register new hospitals',
    'Create hospital administrator accounts',
    'Update administrator details and passwords',
    'View platform-wide hospital statistics',
  ],
};

const ACCESS_SCOPE = {
  PATIENT: 'Your own patient profile, appointments, tokens and notifications.',
  DOCTOR:
    'Your own live queue and only the patients who have a relationship with you.',
  HOSPITAL_ADMIN:
    'Only your hospital: its doctors, schedules, appointments and queues.',
  PLATFORM_ADMIN: 'All hospitals and all hospital administrator accounts.',
};

function identityRows(user) {
  const rows = [
    { label: 'Email', value: user.email },
    { label: 'Role', value: getRoleLabel(user.role) },
  ];

  if (user.phone) rows.push({ label: 'Phone', value: user.phone });
  if (user.patientId) rows.push({ label: 'Patient ID', value: user.patientId, mono: true });
  if (user.doctorId) rows.push({ label: 'Doctor ID', value: user.doctorId, mono: true });
  if (user.hospitalName) rows.push({ label: 'Hospital', value: user.hospitalName });
  if (user.hospitalId) rows.push({ label: 'Hospital ID', value: user.hospitalId, mono: true });
  if (user.role === 'PLATFORM_ADMIN') {
    rows.push({ label: 'Scope', value: 'All hospitals (platform-wide)' });
  }

  return rows;
}

export default function RoleHome() {
  const { user } = useAuth();

  if (!user) return null;

  const firstName = getGreetingName(user.name);
  const nextSteps = COMING_NEXT[user.role] ?? [];
  const actions = QUICK_ACTIONS[user.role] ?? [];
  const rows = identityRows(user);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <span
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-sm',
              ROLE_ACCENTS[user.role] || 'bg-slate-500',
            )}
          >
            {getInitials(user.name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Welcome, {firstName}
              </h1>
              <Badge className={ROLE_BADGE_CLASSES[user.role]}>
                {getRoleLabel(user.role)}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {ROLE_DESCRIPTIONS[user.role]}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Authenticated session
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Role-scoped route
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            <Activity className="h-3.5 w-3.5" />
            Identity loaded from SQLite
          </span>
        </div>
      </section>

      {actions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Available now
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      action.tone,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 group-hover:text-blue-700">
                        {action.label}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {action.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signed-in identity</CardTitle>
            <CardDescription>
              These values come from <code className="text-xs">GET /api/auth/me</code>{' '}
              on every page load.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {row.label}
                  </dt>
                  <dd
                    className={cn(
                      'text-sm text-slate-900 sm:text-right',
                      row.mono && 'break-all font-mono text-xs text-slate-600',
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access scope</CardTitle>
            <CardDescription>
              Enforced by the API, not just hidden in the interface.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                {getRoleLabel(user.role)}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {ACCESS_SCOPE[user.role]}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <Clock className="h-4 w-4 text-blue-600" />
                Session lifecycle
              </div>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
                <li>JWT stored in browser storage and sent as a Bearer token.</li>
                <li>Expired or invalid tokens return 401 and end the session.</li>
                <li>Signing out clears the stored token immediately.</li>
              </ul>
            </div>

            <p className="text-xs text-slate-400">
              Your dashboard route: <code>{getRoleHome(user.role)}</code>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <CardTitle>Coming in later phases</CardTitle>
          </div>
          <CardDescription>
            Your role dashboard grows as the remaining phases add role-specific tools.
            Patients already have their live queue and notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2">
            {nextSteps.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700"
              >
                <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
