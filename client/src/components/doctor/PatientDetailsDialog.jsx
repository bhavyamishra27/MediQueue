import { Link } from 'react-router-dom';
import { CalendarClock, Mail, Phone, Stethoscope, Ticket, UserRound } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { formatPatientMeta } from '../../lib/doctor';
import { appointmentStatusBadge, formatToken } from '../../lib/queue';

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </dt>
        <dd className="mt-0.5 break-words text-sm text-slate-800">{value || '—'}</dd>
      </div>
    </div>
  );
}

export function PatientDetailsDialog({ appointment, open, onClose, showQueueLink = true }) {
  const patient = appointment?.patient;
  const status = appointment ? appointmentStatusBadge(appointment.status) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={patient?.name ?? 'Patient details'}
      description={
        appointment
          ? `${appointment.slotTime ? `${appointment.slotTime} · ` : ''}${
              appointment.isEmergency ? 'Emergency visit' : 'Scheduled visit'
            }`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {showQueueLink && appointment?.queueEntry && (
            <Link
              to="/doctor"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              <Ticket className="h-4 w-4" />
              Open live queue
            </Link>
          )}
        </>
      }
    >
      {!appointment ? (
        <p className="text-sm text-slate-600">No appointment selected.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
            {appointment.isEmergency && <Badge variant="red">Emergency</Badge>}
            {appointment.queueEntry && (
              <Badge variant="blue">
                <Ticket className="h-3.5 w-3.5" />
                Token {formatToken(appointment.queueEntry.tokenNumber)}
              </Badge>
            )}
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail icon={UserRound} label="Patient" value={patient?.name} />
            <Detail icon={CalendarClock} label="Age / sex / blood" value={formatPatientMeta(patient)} />
            <Detail icon={Phone} label="Phone" value={patient?.phone} />
            <Detail icon={Mail} label="Email" value={patient?.email} />
            <Detail
              icon={Stethoscope}
              label="Reason"
              value={appointment.reason || 'No reason provided'}
            />
            <Detail
              icon={CalendarClock}
              label="Booked"
              value={new Date(appointment.bookedAt).toLocaleString()}
            />
          </dl>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Visit timeline
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {[
                ['Booked', appointment.bookedAt],
                ['Checked in', appointment.checkedInAt],
                ['Called', appointment.calledAt],
                ['Consultation started', appointment.startedAt],
                ['Completed', appointment.completedAt],
                ['No show', appointment.noShowAt],
                ['Cancelled', appointment.cancelledAt],
              ]
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-medium">{new Date(value).toLocaleTimeString()}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}
