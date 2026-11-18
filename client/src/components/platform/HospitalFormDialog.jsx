import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Textarea } from '../ui/Input';
import { FieldError, Label } from '../ui/Label';
import { platformApi } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = {
  name: '',
  address: '',
  city: '',
  phone: '',
  email: '',
  description: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  adminPassword: '',
};

export function HospitalFormDialog({ open, onClose, onSaved }) {
  const toast = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  }, [open]);

  const updateField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setFieldErrors({});

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      description: form.description.trim(),
      adminName: form.adminName.trim(),
      adminEmail: form.adminEmail.trim(),
      adminPhone: form.adminPhone.trim(),
      adminPassword: form.adminPassword,
    };

    try {
      const result = await platformApi.createHospital(payload);
      toast.success(
        `${result.hospital.name} was registered. Share the administrator password with ${result.hospital.admin?.name ?? 'the administrator'}.`,
      );
      onSaved?.(result.hospital);
      onClose?.();
    } catch (error) {
      if (error.details) setFieldErrors(error.details);
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      title="Register a hospital"
      description="Creates the hospital and its first administrator account in one step."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="hospital-register-form" loading={saving}>
            {!saving && <Building2 className="h-4 w-4" />}
            Register hospital
          </Button>
        </>
      }
    >
      <form
        id="hospital-register-form"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {formError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="hospital-name">Hospital name</Label>
            <Input
              id="hospital-name"
              className="mt-1.5"
              placeholder="Sunrise Multispeciality Hospital"
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
              placeholder="24 Park Street"
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
              placeholder="Bengaluru"
              value={form.city}
              onChange={updateField('city')}
              invalid={Boolean(fieldErrors.city)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.city}</FieldError>
          </div>

          <div>
            <Label htmlFor="hospital-phone">Hospital phone</Label>
            <Input
              id="hospital-phone"
              className="mt-1.5"
              placeholder="+91 80 4000 2000"
              value={form.phone}
              onChange={updateField('phone')}
              invalid={Boolean(fieldErrors.phone)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.phone}</FieldError>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="hospital-email">Hospital email (optional)</Label>
            <Input
              id="hospital-email"
              type="email"
              className="mt-1.5"
              placeholder="contact@sunrise.local"
              value={form.email}
              onChange={updateField('email')}
              invalid={Boolean(fieldErrors.email)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.email}</FieldError>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="hospital-description">Description (optional)</Label>
            <Textarea
              id="hospital-description"
              rows={3}
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

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Administrator account</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            This person will manage the hospital profile, doctors, schedules and queues.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="admin-name">Full name</Label>
            <Input
              id="admin-name"
              className="mt-1.5"
              placeholder="Neha Verma"
              value={form.adminName}
              onChange={updateField('adminName')}
              invalid={Boolean(fieldErrors.adminName)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.adminName}</FieldError>
          </div>

          <div>
            <Label htmlFor="admin-email">Email address</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="off"
              className="mt-1.5"
              placeholder="admin@sunrise.local"
              value={form.adminEmail}
              onChange={updateField('adminEmail')}
              invalid={Boolean(fieldErrors.adminEmail)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.adminEmail}</FieldError>
          </div>

          <div>
            <Label htmlFor="admin-phone">Phone (optional)</Label>
            <Input
              id="admin-phone"
              className="mt-1.5"
              placeholder="+91 98765 43210"
              value={form.adminPhone}
              onChange={updateField('adminPhone')}
              invalid={Boolean(fieldErrors.adminPhone)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.adminPhone}</FieldError>
          </div>

          <div>
            <Label htmlFor="admin-password">Temporary password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="new-password"
              className="mt-1.5"
              placeholder="At least 8 characters"
              value={form.adminPassword}
              onChange={updateField('adminPassword')}
              invalid={Boolean(fieldErrors.adminPassword)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.adminPassword}</FieldError>
          </div>
        </div>

        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Share the temporary password with the administrator. They can sign in immediately and
          update their hospital profile.
        </p>
      </form>
    </Dialog>
  );
}
