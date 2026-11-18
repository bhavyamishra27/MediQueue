import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Select } from '../ui/Input';
import { FieldError, Label } from '../ui/Label';
import { hospitalAdminApi } from '../../lib/api';
import { DAYS_OF_WEEK } from '../../lib/dates';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = {
  dayOfWeek: '1',
  startTime: '09:00',
  endTime: '13:00',
  slotDurationMinutes: '15',
  isActive: true,
};

function scheduleToForm(schedule) {
  if (!schedule) return { ...EMPTY_FORM };

  return {
    dayOfWeek: String(schedule.dayOfWeek),
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    slotDurationMinutes: String(schedule.slotDurationMinutes),
    isActive: schedule.isActive,
  };
}

export function ScheduleFormDialog({ open, onClose, doctorId, schedule, onSaved }) {
  const toast = useToast();
  const isEditing = Boolean(schedule);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(scheduleToForm(schedule));
    setFieldErrors({});
    setFormError('');
  }, [open, schedule]);

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
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      slotDurationMinutes: Number(form.slotDurationMinutes),
      isActive: form.isActive,
    };

    try {
      const result = isEditing
        ? await hospitalAdminApi.updateSchedule(doctorId, schedule.id, payload)
        : await hospitalAdminApi.createSchedule(doctorId, payload);

      toast.success(
        isEditing ? 'Schedule updated.' : 'Weekly session added.',
      );
      onSaved?.(result.schedule);
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
      title={isEditing ? 'Edit session' : 'Add a weekly session'}
      description="Sessions generate bookable appointment slots. Overlapping active sessions are rejected."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-form" loading={saving}>
            {!saving && <CalendarPlus className="h-4 w-4" />}
            {isEditing ? 'Save session' : 'Add session'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {formError}
          </div>
        )}

        <div>
          <Label htmlFor="schedule-day">Day of week</Label>
          <Select
            id="schedule-day"
            className="mt-1.5"
            value={form.dayOfWeek}
            onChange={updateField('dayOfWeek')}
            invalid={Boolean(fieldErrors.dayOfWeek)}
            disabled={saving}
          >
            {DAYS_OF_WEEK.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </Select>
          <FieldError>{fieldErrors.dayOfWeek}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="schedule-start">Start time</Label>
            <Input
              id="schedule-start"
              type="time"
              className="mt-1.5"
              value={form.startTime}
              onChange={updateField('startTime')}
              invalid={Boolean(fieldErrors.startTime)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.startTime}</FieldError>
          </div>

          <div>
            <Label htmlFor="schedule-end">End time</Label>
            <Input
              id="schedule-end"
              type="time"
              className="mt-1.5"
              value={form.endTime}
              onChange={updateField('endTime')}
              invalid={Boolean(fieldErrors.endTime)}
              disabled={saving}
              required
            />
            <FieldError>{fieldErrors.endTime}</FieldError>
          </div>
        </div>

        <div>
          <Label htmlFor="schedule-duration">Slot duration (minutes)</Label>
          <Input
            id="schedule-duration"
            type="number"
            min="5"
            max="240"
            step="5"
            className="mt-1.5"
            value={form.slotDurationMinutes}
            onChange={updateField('slotDurationMinutes')}
            invalid={Boolean(fieldErrors.slotDurationMinutes)}
            disabled={saving}
            required
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Must fit inside the session window. Example: 09:00–13:00 with 15-minute
            slots creates 16 slots.
          </p>
          <FieldError>{fieldErrors.slotDurationMinutes}</FieldError>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={form.isActive}
            onChange={updateField('isActive')}
            disabled={saving}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              Active session
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              Inactive sessions are kept for reference but do not generate slots.
            </span>
          </span>
        </label>
        <FieldError>{fieldErrors.isActive}</FieldError>
      </form>
    </Dialog>
  );
}
