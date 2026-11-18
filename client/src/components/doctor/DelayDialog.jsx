import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Textarea } from '../ui/Input';
import { DELAY_PRESETS } from '../../lib/doctor';
import { cn } from '../../lib/utils';

/**
 * The doctor reports the total current delay (not an increment), so the latest
 * report always wins and estimates stay easy to explain.
 */
export function DelayDialog({ open, onClose, onSubmit, submitting, currentDelay = 0 }) {
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState({});

  useEffect(() => {
    if (!open) return;
    setMinutes(currentDelay > 0 ? String(currentDelay) : '');
    setReason('');
    setError('');
    setDetails({});
  }, [open, currentDelay]);

  const handleSubmit = async () => {
    setError('');
    setDetails({});

    try {
      await onSubmit({
        delayMinutes: minutes === '' ? null : Number(minutes),
        reason: reason.trim(),
      });
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.details) setDetails(requestError.details);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={currentDelay > 0 ? 'Update the delay' : 'Report a delay'}
      description="Waiting patients see the new estimate immediately and receive a notification."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleSubmit} loading={submitting}>
            <Timer className="h-4 w-4" />
            {currentDelay > 0 ? 'Update delay' : 'Report delay'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="delay-minutes"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Total delay in minutes
          </label>
          <Input
            id="delay-minutes"
            type="number"
            min={0}
            max={720}
            step={5}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            invalid={Boolean(details.delayMinutes)}
          />
          {details.delayMinutes && (
            <p className="mt-1 text-xs text-red-600">{details.delayMinutes}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DELAY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMinutes(String(preset))}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition',
                  Number(minutes) === preset
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {preset} min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="delay-reason"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Reason
          </label>
          <Textarea
            id="delay-reason"
            rows={3}
            maxLength={300}
            placeholder="For example: emergency case, procedure running long"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            invalid={Boolean(details.reason)}
          />
          {details.reason && <p className="mt-1 text-xs text-red-600">{details.reason}</p>}
          <p className="mt-1 text-xs text-slate-500">
            At least 3 characters. Patients in the queue receive this reason.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
