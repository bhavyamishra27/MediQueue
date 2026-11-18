import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Clock, Ticket } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button, buttonClasses } from '../ui/Button';
import { appointmentStatusBadge } from '../../lib/queue';

/**
 * One of today's appointments with the check-in action. Shared by the patient
 * dashboard and the live queue page so both show the same rules.
 */
export function TodayAppointmentCard({ appointment, onCheckIn, checkingIn }) {
  const status = appointmentStatusBadge(appointment.status);
  const canCheckIn = appointment.status === 'BOOKED';
  const inQueue = ['CHECKED_IN', 'CALLED', 'IN_CONSULTATION'].includes(appointment.status);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-slate-400" />
            {appointment.slotTime || 'Time not set'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {appointment.doctor?.name ?? 'Doctor'}
            {appointment.doctor?.specialization
              ? ` · ${appointment.doctor.specialization}`
              : ''}
          </p>
          {appointment.hospital && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Building2 className="h-3.5 w-3.5" />
              {appointment.hospital.name}
              {appointment.doctor?.roomNumber
                ? ` · Room ${appointment.doctor.roomNumber}`
                : ''}
            </p>
          )}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canCheckIn && (
          <Button
            size="sm"
            onClick={() => onCheckIn(appointment)}
            loading={checkingIn === appointment.id}
          >
            <Ticket className="h-4 w-4" />
            Check in & get token
          </Button>
        )}
        {inQueue && (
          <Link
            to="/patient/queue"
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
          >
            <Clock className="h-4 w-4" />
            View live queue
          </Link>
        )}
        {appointment.status === 'COMPLETED' && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Consultation completed
          </span>
        )}
      </div>
    </div>
  );
}
