import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/Button';
import { getRoleHome } from '../../lib/roles';

const FEATURES = [
  {
    icon: CalendarCheck2,
    title: 'Book, check in, get a token',
    description:
      'Patients reserve a fixed slot first. A digital token is issued only when they check in, so the live queue reflects real arrival order.',
  },
  {
    icon: Activity,
    title: 'Priority min-heap queue',
    description:
      'A custom binary min-heap serves emergencies first, then normal patients by token number. Equal priority keeps first-come-first-served order.',
  },
  {
    icon: ShieldCheck,
    title: 'Four scoped roles',
    description:
      'Patients, doctors, hospital administrators and the platform administrator each see only what their role and hospital allow.',
  },
];

const ROLES = [
  {
    icon: UserRound,
    name: 'Patient',
    description: 'Book slots, check in, track your token and estimated wait.',
    accent: 'bg-blue-50 text-blue-700',
  },
  {
    icon: Stethoscope,
    name: 'Doctor',
    description: 'Run one live queue, call patients and report delays.',
    accent: 'bg-teal-50 text-teal-700',
  },
  {
    icon: Building2,
    name: 'Hospital admin',
    description: 'Manage doctors, schedules, appointments and queues.',
    accent: 'bg-amber-50 text-amber-700',
  },
  {
    icon: ShieldCheck,
    name: 'Platform admin',
    description: 'Register hospitals and create their administrator accounts.',
    accent: 'bg-violet-50 text-violet-700',
  },
];

const DEMO_ACCOUNTS = [
  { role: 'Platform admin', email: 'platform@mediqueue.local' },
  { role: 'Hospital admin', email: 'admin@citycare.local' },
  { role: 'Doctor', email: 'dr.arjun@citycare.local' },
  { role: 'Patient', email: 'patient@example.com' },
];

const QUEUE_PREVIEW = [
  {
    token: '12',
    name: 'Emergency patient',
    priority: 'Emergency',
    tone: 'border-red-200 bg-red-50',
    badge: 'red',
  },
  {
    token: '09',
    name: 'Aarav S.',
    priority: 'Normal',
    tone: 'border-slate-200 bg-white',
    badge: 'blue',
  },
  {
    token: '10',
    name: 'Meera K.',
    priority: 'Normal',
    tone: 'border-slate-200 bg-white',
    badge: 'blue',
  },
  {
    token: '11',
    name: 'Rohan P.',
    priority: 'Normal',
    tone: 'border-slate-200 bg-white',
    badge: 'blue',
  },
];

export default function Landing() {
  const { status, user } = useAuth();
  const isAuthenticated = status === 'authenticated' && Boolean(user);
  const primaryTarget = isAuthenticated ? getRoleHome(user.role) : '/login';

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">MediQueue</span>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Hospital queues
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              to="/hospitals"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Hospitals
            </Link>
            <Link
              to="/doctors"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Doctors
            </Link>
          </nav>

          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link to={primaryTarget} className={buttonClasses({ size: 'sm' })}>
                Open dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                >
                  Sign in
                </Link>
                <Link to="/register" className={buttonClasses({ size: 'sm' })}>
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                ADSA project · local multi-hospital demo
              </span>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Skip the waiting room.
                <span className="block text-blue-600">Not the care.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                MediQueue combines appointment booking with a live, priority-aware
                hospital queue. Emergencies jump ahead, everyone else keeps their
                first-come-first-served place, and every role sees a scoped view of
                the same source of truth.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={primaryTarget} className={buttonClasses({ size: 'lg' })}>
                  {isAuthenticated ? 'Open your dashboard' : 'Sign in to MediQueue'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {!isAuthenticated && (
                  <Link
                    to="/hospitals"
                    className={buttonClasses({ variant: 'outline', size: 'lg' })}
                  >
                    Browse hospitals
                  </Link>
                )}
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Roles</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-900">4</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Queue engine</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-900">Min-heap</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Database</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-900">SQLite</dd>
                </div>
              </dl>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-blue-100/50 blur-2xl" aria-hidden="true" />
              <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Live queue</p>
                    <p className="text-xs text-slate-500">Dr. Arjun Mehta · Cardiology</p>
                  </div>
                  <Badge variant="green">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  {QUEUE_PREVIEW.map((entry, index) => (
                    <div
                      key={entry.token}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${entry.tone}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
                        {entry.token}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {entry.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          Position {index + 1}
                        </span>
                      </span>
                      <Badge variant={entry.badge}>{entry.priority}</Badge>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  Priority 0 = emergency · ties broken by smaller token
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-slate-900">
                  {feature.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                One system, four focused experiences
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Authentication is role-aware and hospital-scoped. The API reloads
                identity from the database on every request, so access cannot be
                escalated from the browser.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((role) => (
                <div
                  key={role.name}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${role.accent}`}
                  >
                    <role.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">
                    {role.name}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    {role.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Demo accounts
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Every seeded account uses the same demo password. The value is stored
                in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">server/.env</code>{' '}
                as <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">DEMO_PASSWORD</code>.
              </p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {DEMO_ACCOUNTS.map((account) => (
                      <tr key={account.email}>
                        <td className="px-4 py-3 text-slate-600">{account.role}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {account.email}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
              <h3 className="text-base font-semibold text-blue-900">
                What works right now
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-blue-900">
                {[
                  'Patient self-registration with bcrypt password hashing',
                  'JWT login for all four roles',
                  'Role-guarded routes and hospital-scoped identity',
                  'Public hospital and doctor directories with search and filters',
                  'Hospital admins manage doctors, weekly schedules and their profile',
                  'Patients book and cancel real appointment slots with live availability',
                  'Patients check in, receive a digital token and track their live queue position',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs leading-5 text-blue-700">
                Doctor queue controls, admin dashboards and real-time updates arrive in the
                later phases.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>MediQueue · local hospital appointment and queue management</p>
          <p>React · Express · Prisma · SQLite · custom DSA engine</p>
        </div>
      </footer>
    </div>
  );
}
