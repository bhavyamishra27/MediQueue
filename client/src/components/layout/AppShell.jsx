import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Clock,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../ui/Badge';
import { NotificationBell } from './NotificationBell';
import { cn } from '../../lib/utils';
import {
  ROLE_ACCENTS,
  ROLE_BADGE_CLASSES,
  getInitials,
  getRoleLabel,
} from '../../lib/roles';

const NAV_ITEMS = {
  PATIENT: [
    { label: 'Dashboard', to: '/patient', icon: LayoutDashboard, end: true },
    { label: 'Find hospitals', to: '/hospitals', icon: Building2 },
    { label: 'Find doctors', to: '/doctors', icon: Stethoscope },
    { label: 'My appointments', to: '/patient/appointments', icon: CalendarCheck2 },
    { label: 'My queue', to: '/patient/queue', icon: Clock },
    { label: 'Notifications', to: '/notifications', icon: Bell },
  ],
  DOCTOR: [
    { label: 'Live queue', to: '/doctor', icon: LayoutDashboard, end: true },
    { label: "Today's appointments", to: '/doctor/appointments', icon: CalendarCheck2 },
    { label: 'Notifications', to: '/notifications', icon: Bell },
  ],
  HOSPITAL_ADMIN: [
    { label: 'Dashboard', to: '/hospital', icon: LayoutDashboard, end: true },
    { label: 'Doctors', to: '/hospital/doctors', icon: Stethoscope },
    { label: 'Schedules', to: '/hospital/schedules', icon: CalendarClock },
    { label: 'Appointments', to: '/hospital/appointments', icon: CalendarCheck2 },
    { label: 'Queue monitor', to: '/hospital/queues', icon: Activity },
    { label: 'Hospital profile', to: '/hospital/profile', icon: Building2 },
    { label: 'Notifications', to: '/notifications', icon: Bell },
  ],
  PLATFORM_ADMIN: [
    { label: 'Dashboard', to: '/platform', icon: LayoutDashboard, end: true },
    { label: 'Hospitals', to: '/platform/hospitals', icon: Building2 },
    { label: 'Hospital admins', to: '/platform/hospital-admins', icon: ShieldCheck },
  ],
};

function SidebarContent({ user, onLogout }) {
  const items = NAV_ITEMS[user.role] ?? [];

  return (
    <div className="flex h-full flex-col bg-white">
      <Link
        to="/"
        className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-5"
      >
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {getRoleLabel(user.role)}
        </p>

        {items.map((item) => {
          const Icon = item.icon;

          if (item.soon) {
            return (
              <div
                key={item.label}
                aria-disabled="true"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                <Badge className="px-1.5 py-0 text-[10px]">Soon</Badge>
              </div>
            );
          }

          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
              ROLE_ACCENTS[user.role] || 'bg-slate-500',
            )}
          >
            {getInitials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {user.name}
            </span>
            <span className="block truncate text-xs text-slate-500">{user.email}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 lg:block">
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {getRoleLabel(user.role)} dashboard
            </p>
            <p className="truncate text-xs text-slate-500">
              {user.hospitalName || 'MediQueue'}
            </p>
          </div>

          <NotificationBell />

          <Badge
            className={cn(
              'hidden ring-1 sm:inline-flex',
              ROLE_BADGE_CLASSES[user.role],
            )}
            variant="default"
          >
            {getRoleLabel(user.role)}
          </Badge>

          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white',
              ROLE_ACCENTS[user.role] || 'bg-slate-500',
            )}
            title={user.name}
          >
            {getInitials(user.name)}
          </span>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent user={user} onLogout={handleLogout} />
          </div>
        </div>
      )}
    </div>
  );
}
