import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { FieldError, Label } from '../../components/ui/Label';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hospitalAdminApi } from '../../lib/api';

const EMPTY_FORM = {
  name: '',
  address: '',
  city: '',
  phone: '',
  email: '',
  description: '',
};

function hospitalToForm(hospital) {
  return {
    name: hospital?.name ?? '',
    address: hospital?.address ?? '',
    city: hospital?.city ?? '',
    phone: hospital?.phone ?? '',
    email: hospital?.email ?? '',
    description: hospital?.description ?? '',
  };
}

export default function HospitalProfile() {
  const { refreshUser } = useAuth();
  const toast = useToast();

  const [hospitalId, setHospitalId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const loadProfile = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const data = await hospitalAdminApi.profile();
      const nextForm = hospitalToForm(data.hospital);
      setHospitalId(data.hospital.id);
      setForm(nextForm);
      setInitialForm(nextForm);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const updateField = (field) => (event) => {
    const { value } = event.target;

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
    setSaving(true);
    setFieldErrors({});

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      description: form.description.trim(),
    };

    try {
      const data = await hospitalAdminApi.updateProfile(payload);
      const nextForm = hospitalToForm(data.hospital);
      setForm(nextForm);
      setInitialForm(nextForm);
      setSavedAt(new Date());
      toast.success('Hospital profile saved.');
      // Keep the shell header and greeting in sync with the new name.
      await refreshUser();
    } catch (error) {
      if (error.details) setFieldErrors(error.details);
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm);
    setFieldErrors({});
  };

  const isDirty = Object.keys(EMPTY_FORM).some(
    (field) => form[field].trim() !== initialForm[field].trim(),
  );

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
        <Spinner label="Loading hospital profile" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        <span>{loadError}</span>
        <Button size="sm" variant="outline" onClick={loadProfile}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
            <Building2 className="h-4 w-4" />
            Hospital management
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Hospital profile
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            This information appears in the public hospital directory. Changes take
            effect immediately.
          </p>
        </div>

        {hospitalId && (
          <Link
            to={`/hospitals/${hospitalId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            View public page
          </Link>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="hospital-name">Hospital name</Label>
              <Input
                id="hospital-name"
                className="mt-1.5"
                value={form.name}
                onChange={updateField('name')}
                invalid={Boolean(fieldErrors.name)}
                disabled={saving}
                required
              />
              <FieldError>{fieldErrors.name}</FieldError>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="hospital-address">Address</Label>
              <Input
                id="hospital-address"
                className="mt-1.5"
                placeholder="Street address"
                value={form.address}
                onChange={updateField('address')}
                invalid={Boolean(fieldErrors.address)}
                disabled={saving}
                required
              />
              <FieldError>{fieldErrors.address}</FieldError>
            </div>

            <div>
              <Label htmlFor="hospital-city">City</Label>
              <Input
                id="hospital-city"
                className="mt-1.5"
                value={form.city}
                onChange={updateField('city')}
                invalid={Boolean(fieldErrors.city)}
                disabled={saving}
                required
              />
              <FieldError>{fieldErrors.city}</FieldError>
            </div>

            <div>
              <Label htmlFor="hospital-phone">Phone</Label>
              <Input
                id="hospital-phone"
                className="mt-1.5"
                placeholder="+91 20 4000 1000"
                value={form.phone}
                onChange={updateField('phone')}
                invalid={Boolean(fieldErrors.phone)}
                disabled={saving}
                required
              />
              <FieldError>{fieldErrors.phone}</FieldError>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="hospital-email">Contact email</Label>
              <Input
                id="hospital-email"
                type="email"
                autoComplete="off"
                className="mt-1.5"
                placeholder="contact@hospital.local"
                value={form.email}
                onChange={updateField('email')}
                invalid={Boolean(fieldErrors.email)}
                disabled={saving}
              />
              <FieldError>{fieldErrors.email}</FieldError>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="hospital-description">Description</Label>
              <Textarea
                id="hospital-description"
                rows={4}
                className="mt-1.5"
                placeholder="Specialities, facilities and anything patients should know."
                value={form.description}
                onChange={updateField('description')}
                invalid={Boolean(fieldErrors.description)}
                disabled={saving}
              />
              <FieldError>{fieldErrors.description}</FieldError>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-400">
              {savedAt
                ? `Last saved at ${savedAt.toLocaleTimeString()}`
                : isDirty
                  ? 'You have unsaved changes.'
                  : 'No changes to save.'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={saving || !isDirty}
              >
                Reset
              </Button>
              <Button type="submit" loading={saving} disabled={!isDirty}>
                {!saving && <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </div>
        </form>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Public preview</h2>
            <p className="mt-1 text-xs text-slate-500">
              How patients see your hospital in the directory.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">{form.name || 'Hospital name'}</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {form.address || 'Address'}, {form.city || 'City'}
                </span>
              </p>
              {form.description && (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                  {form.description}
                </p>
              )}
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {form.phone || 'Phone not set'}
                </p>
                <p className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {form.email || 'Email not set'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              Scoped updates
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You can only edit the hospital linked to your administrator account.
              The hospital identifier is taken from your database identity, never from
              this form.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
