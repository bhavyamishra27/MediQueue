import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Select } from '../ui/Input';
import { FieldError, Label } from '../ui/Label';
import { platformApi } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = {
  hospitalId: '',
  name: '',
  email: '',
  phone: '',
  password: '',
};

function adminToForm(admin) {
  return {
    hospitalId: admin?.hospital?.id ?? '',
    name: admin?.name ?? '',
    email: admin?.email ?? '',
    phone: admin?.phone ?? '',
    password: '',
  };
}

export function HospitalAdminFormDialog({
  open,
  onClose,
  onSaved,
  admin = null,
  hospitals = [],
}) {
  const toast = useToast();
  const isEditing = Boolean(admin);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(adminToForm(admin));
    setFieldErrors({});
    setFormError('');
  }, [open, admin]);

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

    try {
      const result = isEditing
        ? await platformApi.updateHospitalAdmin(admin.id, {
            name: form.name.trim(),
            phone: form.phone.trim(),
            ...(form.password ? { password: form.password } : {}),
          })
        : await platformApi.createHospitalAdmin({
            hospitalId: form.hospitalId,
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            password: form.password,
          });

      toast.success(
        isEditing
          ? `${result.admin.name} was updated.`
          : `${result.admin.name} can now sign in as ${result.admin.hospital?.name ?? 'the hospital'} administrator.`,
      );
      onSaved?.(result.admin);
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
      title={isEditing ? 'Edit administrator' : 'Add a hospital administrator'}
      description={
        isEditing
          ? 'Update the account details or reset the password.'
          : 'Assign an administrator to a hospital that does not have one yet.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="hospital-admin-form" loading={saving}>
            {!saving && <ShieldCheck className="h-4 w-4" />}
            {isEditing ? 'Save changes' : 'Create administrator'}
          </Button>
        </>
      }
    >
      <form id="hospital-admin-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {formError}
          </div>
        )}

        {isEditing ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Hospital
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {admin?.hospital?.name ?? 'Not assigned'}
            </p>
            {admin?.hospital?.city && (
              <p className="text-xs text-slate-500">{admin.hospital.city}</p>
            )}
          </div>
        ) : (
          <div>
            <Label htmlFor="admin-hospital">Hospital</Label>
            <Select
              id="admin-hospital"
              className="mt-1.5"
              value={form.hospitalId}
              onChange={updateField('hospitalId')}
              invalid={Boolean(fieldErrors.hospitalId)}
              disabled={saving}
              required
            >
              <option value="">Choose a hospital</option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} · {hospital.city}
                </option>
              ))}
            </Select>
            <FieldError>{fieldErrors.hospitalId}</FieldError>
            {hospitals.length === 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                Every hospital already has an administrator. Register a new hospital first.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="admin-form-name">Full name</Label>
            <Input
              id="admin-form-name"
              className="mt-1.5"
              placeholder="Neha Verma"
              value={form.name}
              onChange={updateField('name')}
              invalid={Boolean(fieldErrors.name)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.name}</FieldError>
          </div>

          {!isEditing && (
            <div className="sm:col-span-2">
              <Label htmlFor="admin-form-email">Email address</Label>
              <Input
                id="admin-form-email"
                type="email"
                autoComplete="off"
                className="mt-1.5"
                placeholder="admin@hospital.local"
                value={form.email}
                onChange={updateField('email')}
                invalid={Boolean(fieldErrors.email)}
                disabled={saving}
                required
              />
              <FieldError>{fieldErrors.email}</FieldError>
            </div>
          )}

          <div className={isEditing ? '' : 'sm:col-span-2'}>
            <Label htmlFor="admin-form-phone">Phone (optional)</Label>
            <Input
              id="admin-form-phone"
              className="mt-1.5"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={updateField('phone')}
              invalid={Boolean(fieldErrors.phone)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.phone}</FieldError>
          </div>

          <div className={isEditing ? '' : 'sm:col-span-2'}>
            <Label htmlFor="admin-form-password">
              {isEditing ? 'New password (optional)' : 'Temporary password'}
            </Label>
            <Input
              id="admin-form-password"
              type="password"
              autoComplete="new-password"
              className="mt-1.5"
              placeholder={isEditing ? 'Leave blank to keep the current password' : 'At least 8 characters'}
              value={form.password}
              onChange={updateField('password')}
              invalid={Boolean(fieldErrors.password)}
              disabled={saving}
              required={!isEditing}
            />
            <FieldError>{fieldErrors.password}</FieldError>
          </div>
        </div>

        {!isEditing && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Share the temporary password with the administrator. They can sign in immediately.
          </p>
        )}
      </form>
    </Dialog>
  );
}
