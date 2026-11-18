import {
  Activity,
  Binary,
  Clock3,
  GitCompareArrows,
  ListOrdered,
  Table2,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { cn } from '../../lib/utils';
import { formatClockWithSeconds, priorityChipClasses } from '../../lib/doctor';
import { formatToken } from '../../lib/queue';

const OPERATION_TONES = {
  insert: 'teal',
  remove: 'red',
  'call-next': 'blue',
  'set-current': 'violet',
  'clear-current': 'default',
};

function TokenChip({ entry, index, compact = false }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
        priorityChipClasses(entry.priority),
      )}
    >
      {index !== undefined && (
        <span className="font-mono text-[10px] text-slate-400">[{index}]</span>
      )}
      <span className="text-sm font-semibold">{formatToken(entry.tokenNumber)}</span>
      {!compact && (
        <span className="max-w-[9rem] truncate text-xs text-slate-500">
          {entry.patientName}
        </span>
      )}
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
          Number(entry.priority) === 0
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-100 text-slate-500',
        )}
      >
        {entry.priorityLabel}
      </span>
    </div>
  );
}

function OrderedList({ entries, emptyLabel, highlightMismatch = false, compareWith = [] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {entries.map((entry, index) => {
        const differs =
          highlightMismatch &&
          compareWith[index] &&
          compareWith[index].tokenNumber !== entry.tokenNumber;

        return (
          <li
            key={`${entry.tokenNumber}-${index}`}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm',
              differs
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-slate-200 bg-white',
            )}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[10px] font-semibold text-slate-500">
              {index + 1}
            </span>
            <span className="font-semibold text-slate-900">
              {formatToken(entry.tokenNumber)}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-600">
              {entry.patientName}
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                Number(entry.priority) === 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-500',
              )}
            >
              {entry.priorityLabel}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * DSA demonstration panel for the college ADSA project. It shows the raw heap
 * array, the FIFO arrival-order view, the extraction order, the live operation
 * log and the complexity reference straight from the server snapshot.
 */
export function DsaPanel({ dsa, className }) {
  if (!dsa) return null;

  const heapArray = dsa.heapArray ?? [];
  const fifoOrder = dsa.fifoOrder ?? [];
  const orderedWaiting = dsa.orderedWaiting ?? [];
  const operations = [...(dsa.operations ?? [])].reverse();
  const complexities = dsa.complexities ?? [];

  return (
    <Card className={className} id="dsa-panel">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <Binary className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>DSA demonstration panel</CardTitle>
            <CardDescription>
              Live view of the custom min-heap and FIFO structures behind this queue.
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="violet">Min-heap size {dsa.size}</Badge>
          <Badge variant={dsa.isEmpty ? 'default' : 'green'}>
            {dsa.isEmpty ? 'Heap empty' : 'Heap active'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-600">
          comparator: {dsa.comparator}
        </p>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Binary className="h-4 w-4 text-slate-400" />
            Heap array (level-order storage)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Index 0 is the root, so <code className="font-mono">peek()</code> is
            O(1). Children of index <code className="font-mono">i</code> live at{' '}
            <code className="font-mono">2i + 1</code> and{' '}
            <code className="font-mono">2i + 2</code>.
          </p>

          {heapArray.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
              The waiting heap is empty. Check in a patient to populate it.
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {heapArray.map((entry, index) => (
                <TokenChip key={`${entry.tokenNumber}-${index}`} entry={entry} index={index} />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ListOrdered className="h-4 w-4 text-slate-400" />
              Extraction order (min-heap)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              The order tokens are served: emergencies first, then token number.
            </p>
            <div className="mt-3">
              <OrderedList
                entries={orderedWaiting}
                emptyLabel="No patients waiting."
                highlightMismatch
                compareWith={fifoOrder}
              />
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <GitCompareArrows className="h-4 w-4 text-slate-400" />
              FIFO arrival order
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Normal patients only, in check-in order. Highlighted rows differ from
              the heap because an emergency jumped ahead.
            </p>
            <div className="mt-3">
              <OrderedList
                entries={fifoOrder}
                emptyLabel="No normal patients waiting."
                highlightMismatch
                compareWith={orderedWaiting}
              />
            </div>
          </section>
        </div>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Activity className="h-4 w-4 text-slate-400" />
            Operation log
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            The last {operations.length || 0} queue operations, newest first.
          </p>

          {operations.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
              No operations yet. Check in a patient or call the next token.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {operations.map((operation) => (
                <li
                  key={operation.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                >
                  <Badge variant={OPERATION_TONES[operation.type] ?? 'default'}>
                    {operation.type}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {operation.message}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {operation.complexity}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock3 className="h-3 w-3" />
                    {formatClockWithSeconds(operation.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Table2 className="h-4 w-4 text-slate-400" />
            Complexity reference
          </h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Operation</th>
                  <th className="px-3 py-2 font-semibold">Structure</th>
                  <th className="px-3 py-2 font-semibold">Complexity</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {complexities.map((row) => (
                  <tr key={`${row.operation}-${row.structure}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.operation}</td>
                    <td className="px-3 py-2 text-slate-600">{row.structure}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {row.complexity}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
