import { Link } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';
import { buttonClasses } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { getRoleHome } from '../lib/roles';

export default function NotFound() {
  const { status, user } = useAuth();
  const isAuthenticated = status === 'authenticated' && Boolean(user);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The page you are looking for does not exist or has moved.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/" className={buttonClasses({ variant: 'outline' })}>
            <Home className="h-4 w-4" />
            Public home
          </Link>
          {isAuthenticated && (
            <Link to={getRoleHome(user.role)} className={buttonClasses()}>
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          )}
          {!isAuthenticated && (
            <Link to="/login" className={buttonClasses()}>
              <ArrowLeft className="h-4 w-4" />
              Sign in
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
