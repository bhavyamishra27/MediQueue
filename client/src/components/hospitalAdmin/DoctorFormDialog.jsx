import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Textarea } from '../ui/Input';
import { FieldError, Label } from '../ui/Label';
import { hospitalAdminApi } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  specialization: '',
  qualification: '',
  experienceYears: '',
  avgConsultationMinutes: '15',
  roomNumber: '',
  bio: '',
  isActive: true,
};

function doctorToForm(doctor) {
  if (!doctor) return { ...EMPTY_FORM };

  return {
    name: doctor.name ?? '',
    email: doctor.email ?? '',
    phone: doctor.phone ?? '',
    password: '',
    specialization: doctor.specialization ?? '',
    qualification: doctor.qualification ?? '',
    experienceYears: doctor.experienceYears ?? '',
    avgConsultationMinutes: String(doctor.avgConsultationMinutes ?? 15),
    roomNumber: doctor.roomNumber ?? '',
    bio: doctor.bio ?? '',
    isActive: doctor.isActive ?? true,
  };
}

export function DoctorFormDialog({ open, onClose, doctor, onSaved }) {
  const toast = useToast();
  const isEditing = Boolean(doctor);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(doctorToForm(doctor));
    setFieldErrors({});
    setFormError('');
  }, [open, doctor]);

  const updateField = (field) => (event) => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;

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
      email: form.email.trim(),
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      qualification: form.qualification.trim(),
      experienceYears: form.experienceYears === '' ? null : Number(form.experienceYears),
      avgConsultationMinutes: Number(form.avgConsultationMinutes),
      roomNumber: form.roomNumber.trim(),
      bio: form.bio.trim(),
    };

    if (isEditing) {
      payload.isActive = form.isActive;
    } else {
      payload.password = form.password;
    }

    try {
      const result = isEditing
        ? await hospitalAdminApi.updateDoctor(doctor.id, payload)
        : await hospitalAdminApi.createDoctor(payload);

      toast.success(
        isEditing
          ? `${result.doctor.name} was updated.`
          : `${result.doctor.name} was added. Share the password with the doctor.`,
      );
      onSaved?.(result.doctor);
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
      title={isEditing ? 'Edit doctor' : 'Add a doctor'}
      description={
        isEditing
          ? 'Update the doctor profile. The hospital assignment cannot be changed.'
          : 'Creates a doctor login account and a profile in your hospital.'
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="doctor-form" loading={saving}>
            {!saving && <UserPlus className="h-4 w-4" />}
            {isEditing ? 'Save changes' : 'Create doctor'}
          </Button>
        </>
      }
    >
      <form id="doctor-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
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
            <Label htmlFor="doctor-name">Full name</Label>
            <Input
              id="doctor-name"
              className="mt-1.5"
              placeholder="Dr. Priya Nair"
              value={form.name}
              onChange={updateField('name')}
              invalid={Boolean(fieldErrors.name)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.name}</FieldError>
          </div>

          <div>
            <Label htmlFor="doctor-email">Email address</Label>
            <Input
              id="doctor-email"
              type="email"
              autoComplete="off"
              className="mt-1.5"
              placeholder="doctor@hospital.local"
              value={form.email}
              onChange={updateField('email')}
              invalid={Boolean(fieldErrors.email)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.email}</FieldError>
          </div>

          <div>
            <Label htmlFor="doctor-phone">Phone</Label>
            <Input
              id="doctor-phone"
              className="mt-1.5"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={updateField('phone')}
              invalid={Boolean(fieldErrors.phone)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.phone}</FieldError>
          </div>

          {!isEditing && (
            <div className="sm:col-span-2">
              <Label htmlFor="doctor-password">Temporary password</Label>
              <Input
                id="doctor-password"
                type="password"
                autoComplete="new-password"
                className="mt-1.5"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={updateField('password')}
                invalid={Boolean(fieldErrors.password)}
                disabled={saving}
                required
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Share this password with the doctor. They can sign in immediately.
              </p>
              <FieldError>{fieldErrors.password}</FieldError>
            </div>
          )}

          <div>
            <Label htmlFor="doctor-specialization">Specialisation</Label>
            <Input
              id="doctor-specialization"
              className="mt-1.5"
              placeholder="Cardiology"
              value={form.specialization}
              onChange={updateField('specialization')}
              invalid={Boolean(fieldErrors.specialization)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.specialization}</FieldError>
          </div>

          <div>
            <Label htmlFor="doctor-qualification">Qualification</Label>
            <Input
              id="doctor-qualification"
              className="mt-1.5"
              placeholder="MBBS, MD"
              value={form.qualification}
              onChange={updateField('qualification')}
              invalid={Boolean(fieldErrors.qualification)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.qualification}</FieldError>
          </div>

          <div>
            <Label htmlFor="doctor-experience">Experience (years)</Label>
            <Input
              id="doctor-experience"
              type="number"
              min="0"
              max="70"
              step="1"
              className="mt-1.5"
              value={form.experienceYears}
              onChange={updateField('experienceYears')}
              invalid={Boolean(fieldErrors.experienceYears)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.experienceYears}</FieldError>
          </div>

          <div>
            <Label htmlFor="doctor-average">Average consultation (minutes)</Label>
            <Input
              id="doctor-average"
              type="number"
              min="5"
              max="120"
              step="1"
              className="mt-1.5"
              value={form.avgConsultationMinutes}
              onChange={updateField('avgConsultationMinutes')}
              invalid={Boolean(fieldErrors.avgConsultationMinutes)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.avgConsultationMinutes}</FieldError>
          </div>

          <div>
            <Label htmlFor="doctor-room">Room number</Label>
            <Input
              id="doctor-room"
              className="mt-1.5"
              placeholder="C-204"
              value={form.roomNumber}
              onChange={updateField('roomNumber')}
              invalid={Boolean(fieldErrors.roomNumber)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.roomNumber}</FieldError>
          </div>

          {isEditing && (
            <div>
              <Label htmlFor="doctor-status">Status</Label>
              <select
                id="doctor-status"
                className="mt-1.5 flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.value === 'active',
                  }))
                }
                disabled={saving}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <FieldError>{fieldErrors.isActive}</FieldError>
            </div>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="doctor-bio">Short bio</Label>
            <Textarea
              id="doctor-bio"
              rows={3}
              className="mt-1.5"
              placeholder="Clinical interests, experience and anything patients should know."
              value={form.bio}
              onChange={updateField('bio')}
              invalid={Boolean(fieldErrors.bio)}
              disabled={saving}
            />
            <FieldError>{fieldErrors.bio}</FieldError>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
