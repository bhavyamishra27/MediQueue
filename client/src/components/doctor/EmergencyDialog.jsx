import { useEffect, useState } from 'react';
import { AlertTriangle, Search, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Textarea } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { doctorApi } from '../../lib/api';
import { formatPatientMeta } from '../../lib/doctor';
import { cn } from '../../lib/utils';

/**
 * Emergency add flow. Emergency patients must already have a MediQueue account,
 * so the doctor searches registered patients and picks one.
 */
export function EmergencyDialog({ open, onClose, onSubmit, submitting }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setSelected(null);
    setReason('');
    setError('');
  }, [open]);

  // Debounced patient search so typing does not spam the API.
  useEffect(() => {
    if (!open) return undefined;

    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const data = await doctorApi.searchPatients(term);
        if (!cancelled) setResults(data.patients ?? []);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const handleSubmit = async () => {
    if (!selected) {
      setError('Choose the patient to add.');
      return;
    }

    setError('');
    try {
      await onSubmit({ patientId: selected.id, reason: reason.trim() || undefined });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add an emergency patient"
      description="Emergency tokens use priority 0 and are served before normal patients."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!selected}
          >
            <AlertTriangle className="h-4 w-4" />
            Add to queue
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="emergency-patient-search"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Find the registered patient
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="emergency-patient-search"
              className="pl-9"
              placeholder="Search by name or email"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
              }}
              autoComplete="off"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Type at least two characters. Emergency patients must already be registered.
          </p>
        </div>

        <div className="min-h-[3rem]">
          {searching && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-500">
              <Spinner className="h-4 w-4" />
              Searching patients…
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-4 text-center text-sm text-slate-500">
              No registered patients match “{query.trim()}”.
            </p>
          )}

          {!searching && results.length > 0 && (
            <ul className="space-y-1.5">
              {results.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(patient)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                      selected?.id === patient.id
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-inset ring-blue-200'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {patient.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {[patient.email, formatPatientMeta(patient)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <p className="font-semibold">{selected.name}</p>
            <p className="mt-0.5 text-xs">
              This patient will receive the next token with emergency priority.
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="emergency-reason"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Reason <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <Textarea
            id="emergency-reason"
            rows={3}
            maxLength={500}
            placeholder="For example: chest pain, heavy bleeding, breathing difficulty"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
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
