import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <LoaderCircle className={cn('h-4 w-4 animate-spin text-blue-600', className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <LoaderCircle className="h-6 w-6 animate-spin" />
        </span>
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  );
}
