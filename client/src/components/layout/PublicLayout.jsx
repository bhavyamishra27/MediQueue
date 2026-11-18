import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowRight, HeartPulse } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { buttonClasses } from '../ui/Button';
import { cn } from '../../lib/utils';
import { getRoleHome } from '../../lib/roles';

const NAV_LINKS = [
  { label: 'Home', to: '/', end: true },
  { label: 'Hospitals', to: '/hospitals' },
  { label: 'Doctors', to: '/doctors' },
];

export function PublicLayout() {
  const { status, user } = useAuth();
  const isAuthenticated = status === 'authenticated' && Boolean(user);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-slate-900">
                MediQueue
              </span>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Hospital queues
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link to={getRoleHome(user.role)} className={buttonClasses({ size: 'sm' })}>
                Dashboard
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

        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Outlet />
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
