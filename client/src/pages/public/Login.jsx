import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { FieldError, Label } from '../../components/ui/Label';
import { Input } from '../../components/ui/Input';
import { PageLoader } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGreetingName, getRoleHome } from '../../lib/roles';

const DEMO_ACCOUNTS = [
  { role: 'Platform admin', email: 'platform@mediqueue.local' },
  { role: 'Hospital admin', email: 'admin@citycare.local' },
  { role: 'Doctor', email: 'dr.arjun@citycare.local' },
  { role: 'Patient', email: 'patient@example.com' },
];

export default function Login() {
  const { login, status, user } = useAuth();
  const toast = useToast();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') {
    return <PageLoader label="Checking your session…" />;
  }

  if (status === 'authenticated' && user) {
    const roleHome = getRoleHome(user.role);
    const from = location.state?.from?.pathname;
    const canReturnToFrom =
      typeof from === 'string' &&
      (from === roleHome || from.startsWith(`${roleHome}/`));
    return <Navigate to={canReturnToFrom ? from : roleHome} replace />;
  }

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    if (!form.password) nextErrors.password = 'Password is required.';

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const signedInUser = await login(form.email, form.password);
      const firstName = getGreetingName(signedInUser.name);
      toast.success(`Welcome back, ${firstName}.`, 'Signed in');
      // The authenticated branch above redirects to the correct dashboard.
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.details) {
        setFieldErrors(requestError.details);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to MediQueue"
      subtitle="Use your hospital account. Patients can also create a new account."
      footer={
        <>
          New patient?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div>
          <Label htmlFor="email">Email address</Label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="pl-9"
              value={form.email}
              onChange={updateField('email')}
              invalid={Boolean(fieldErrors.email)}
              disabled={submitting}
              required
            />
          </div>
          <FieldError>{fieldErrors.email}</FieldError>
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1.5">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="pl-9 pr-10"
              value={form.password}
              onChange={updateField('password')}
              invalid={Boolean(fieldErrors.password)}
              disabled={submitting}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldError>{fieldErrors.password}</FieldError>
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
          {!submitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Demo accounts
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Click an account to fill the email. Use the{' '}
          <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-700">
            DEMO_PASSWORD
          </code>{' '}
          value from <code className="text-[11px] text-slate-700">server/.env</code>.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setForm((current) => ({ ...current, email: account.email }));
                setFieldErrors((current) => ({ ...current, email: undefined }));
                setError('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="block text-xs font-semibold text-slate-700">
                {account.role}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                {account.email}
              </span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
