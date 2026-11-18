import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, HeartPulse, ShieldCheck } from 'lucide-react';

const HIGHLIGHTS = [
  'Priority-aware live queues with a custom min-heap',
  'Hospital-scoped access for every role',
  'Appointments, tokens and notifications in one place',
];

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.35),transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <HeartPulse className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-tight">MediQueue</span>
              <span className="block text-xs uppercase tracking-wider text-slate-400">
                Hospital queues
              </span>
            </span>
          </Link>

          <h2 className="mt-16 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            The right patient, at the right time, in every hospital.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
            A local multi-hospital prototype that pairs appointment booking with a
            transparent, priority-aware queue engine.
          </p>

          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <Activity className="h-5 w-5 shrink-0 text-blue-400" />
          <p>
            Emergency priority <span className="font-semibold text-white">0</span> · Normal
            priority <span className="font-semibold text-white">1</span> · FCFS tie-breaker
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-3 lg:hidden"
            aria-label="MediQueue home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              MediQueue
            </span>
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
                )}
              </div>
            </div>

            <div className="mt-6">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
