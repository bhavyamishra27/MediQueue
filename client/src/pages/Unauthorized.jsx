import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, ShieldX } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button, buttonClasses } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ROLE_BADGE_CLASSES,
  getRoleHome,
  getRoleLabel,
} from '../lib/roles';

export default function Unauthorized() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const home = user ? getRoleHome(user.role) : '/login';

  const handleSignOut = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldX className="h-7 w-7" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
          Access denied
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your account does not have permission to open that page.
        </p>

        {user && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
            <span>Signed in as</span>
            <span className="font-medium text-slate-900">{user.name}</span>
            <Badge className={ROLE_BADGE_CLASSES[user.role]}>
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to={home} className={buttonClasses()}>
            <ArrowLeft className="h-4 w-4" />
            {user ? 'Go to my dashboard' : 'Go to sign in'}
          </Link>
          {user && (
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          )}
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-400">
          Role checks are enforced by the API as well as the interface. If you believe
          this is a mistake, contact your hospital administrator.
        </p>
      </section>
    </main>
  );
}
