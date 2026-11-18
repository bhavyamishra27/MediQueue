import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { FieldError, Label } from '../../components/ui/Label';
import { Input, Select } from '../../components/ui/Input';
import { PageLoader } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGreetingName, getRoleHome } from '../../lib/roles';

const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  password: '',
  confirmPassword: '',
};

export default function Register() {
  const { register, status, user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') {
    return <PageLoader label="Checking your session…" />;
  }

  if (status === 'authenticated' && user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
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
    if (form.name.trim().length < 2) {
      nextErrors.name = 'Name must be at least 2 characters.';
    }
    if (!form.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }
    if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }
    if (form.dateOfBirth && new Date(`${form.dateOfBirth}T00:00:00Z`) > new Date()) {
      nextErrors.dateOfBirth = 'Date of birth cannot be in the future.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const newUser = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        bloodGroup: form.bloodGroup,
        password: form.password,
      });

      toast.success(
        `Your patient account is ready, ${getGreetingName(newUser.name)}.`,
        'Welcome to MediQueue',
      );
      // The authenticated branch above redirects to the patient dashboard.
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
      title="Create a patient account"
      subtitle="Book appointments and follow your live queue. Staff accounts are created by administrators."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
            Sign in
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
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Aarav Sharma"
            className="mt-1.5"
            value={form.name}
            onChange={updateField('name')}
            invalid={Boolean(fieldErrors.name)}
            disabled={submitting}
            required
          />
          <FieldError>{fieldErrors.name}</FieldError>
        </div>

        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1.5"
            value={form.email}
            onChange={updateField('email')}
            invalid={Boolean(fieldErrors.email)}
            disabled={submitting}
            required
          />
          <FieldError>{fieldErrors.email}</FieldError>
        </div>

        <div>
          <Label htmlFor="phone">
            Phone number <span className="font-normal text-slate-400">(optional)</span>
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 00000"
            className="mt-1.5"
            value={form.phone}
            onChange={updateField('phone')}
            invalid={Boolean(fieldErrors.phone)}
            disabled={submitting}
          />
          <FieldError>{fieldErrors.phone}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dateOfBirth">
              Date of birth <span className="font-normal text-slate-400">(optional)</span>
            </Label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              className="mt-1.5"
              value={form.dateOfBirth}
              onChange={updateField('dateOfBirth')}
              invalid={Boolean(fieldErrors.dateOfBirth)}
              disabled={submitting}
            />
            <FieldError>{fieldErrors.dateOfBirth}</FieldError>
          </div>

          <div>
            <Label htmlFor="gender">
              Gender <span className="font-normal text-slate-400">(optional)</span>
            </Label>
            <Select
              id="gender"
              name="gender"
              className="mt-1.5"
              value={form.gender}
              onChange={updateField('gender')}
              invalid={Boolean(fieldErrors.gender)}
              disabled={submitting}
            >
              <option value="">Select</option>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </Select>
            <FieldError>{fieldErrors.gender}</FieldError>
          </div>
        </div>

        <div>
          <Label htmlFor="bloodGroup">
            Blood group <span className="font-normal text-slate-400">(optional)</span>
          </Label>
          <Select
            id="bloodGroup"
            name="bloodGroup"
            className="mt-1.5"
            value={form.bloodGroup}
            onChange={updateField('bloodGroup')}
            invalid={Boolean(fieldErrors.bloodGroup)}
            disabled={submitting}
          >
            <option value="">Select</option>
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </Select>
          <FieldError>{fieldErrors.bloodGroup}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-1.5">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="pr-10"
                value={form.password}
                onChange={updateField('password')}
                invalid={Boolean(fieldErrors.password)}
                disabled={submitting}
                maxLength={72}
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

          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat password"
              className="mt-1.5"
              value={form.confirmPassword}
              onChange={updateField('confirmPassword')}
              invalid={Boolean(fieldErrors.confirmPassword)}
              disabled={submitting}
              maxLength={72}
              required
            />
            <FieldError>{fieldErrors.confirmPassword}</FieldError>
          </div>
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Creating account…' : 'Create patient account'}
          {!submitting && <UserPlus className="h-4 w-4" />}
        </Button>

        <p className="text-xs leading-5 text-slate-500">
          By registering you agree that this local demo stores your name, email and
          basic profile details in a SQLite database on this machine. No data leaves
          the device.
        </p>
      </form>
    </AuthLayout>
  );
}
