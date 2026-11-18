import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  DoorOpen,
  RefreshCw,
  Stethoscope,
  Timer,
  UserCheck,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button, buttonClasses } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { cn } from '../../lib/utils';
import { formatToken, formatWait, priorityBadge, queueStatusBadge } from '../../lib/queue';

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function LiveQueueCard({ queue, onRefresh, refreshing = false, showDetailsLink = true }) {
  const entry = queue?.entry;
  if (!queue?.active || !entry) return null;

  const status = queueStatusBadge(entry.status);
  const priority = priorityBadge(entry.priority);
  const isWaiting = entry.status === 'WAITING';
  const isCalled = entry.status === 'CALLED';
  const isInConsultation = entry.status === 'IN_CONSULTATION';
  const delayMinutes = Number(queue.delay?.minutes) || 0;
  // `waiting` includes the signed-in patient while they are still waiting.
  const patientsAfter = Math.max(
    0,
    (queue.waiting?.length ?? 0) - (isWaiting ? 1 : 0),
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Live queue</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              {queue.doctor?.name ?? 'Your doctor'}
              {queue.doctor?.hospitalName ? ` · ${queue.doctor.hospitalName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              loading={refreshing}
              aria-label="Refresh queue"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <span className="text-[10px] font-medium uppercase tracking-wider text-blue-100">
              Token
            </span>
            <span className="text-2xl font-bold tracking-tight">
              {formatToken(entry.tokenNumber)}
            </span>
          </div>

          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-slate-900">
                {isWaiting && 'You are in the queue'}
                {isCalled && "It's your turn"}
                {isInConsultation && 'Consultation in progress'}
              </p>
              <Badge variant={priority.variant}>{priority.label}</Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {isWaiting &&
                (entry.position === 1
                  ? 'You are next. Please stay close to the consultation room.'
                  : `There ${entry.position === 2 ? 'is' : 'are'} ${
                      entry.position - 1
                    } patient${entry.position === 2 ? '' : 's'} ahead of you.`)}
              {isCalled &&
                `Please proceed to ${
                  queue.doctor?.roomNumber ? `room ${queue.doctor.roomNumber}` : 'the consultation room'
                }.`}
              {isInConsultation && 'Your consultation has started. Take care!'}
            </p>
            {queue.doctor?.roomNumber && !isWaiting && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                <DoorOpen className="h-3.5 w-3.5" />
                Room {queue.doctor.roomNumber}
              </p>
            )}
          </div>
        </div>

        {delayMinutes > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">
                The doctor is running about {delayMinutes} min late.
              </span>
              {queue.delay?.reason ? ` ${queue.delay.reason}` : ''} Estimates have been
              adjusted.
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Position"
            value={isWaiting && entry.position ? `#${entry.position}` : '—'}
            icon={UserCheck}
          />
          <Stat
            label="Est. wait"
            value={isWaiting ? formatWait(entry.estimatedWaitMinutes) : '—'}
            icon={Timer}
          />
          <Stat
            label="Est. start"
            value={isWaiting ? entry.estimatedStartTime || '—' : '—'}
            icon={Clock}
          />
          <Stat
            label="Avg consult"
            value={
              queue.averageConsultationMinutes
                ? `${queue.averageConsultationMinutes} min`
                : '—'
            }
            icon={Stethoscope}
          />
        </dl>

        {showDetailsLink && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              {patientsAfter} patient
              {patientsAfter === 1 ? '' : 's'} waiting after you · updates automatically
            </p>
            <Link to="/patient/queue" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
              Open live queue
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
