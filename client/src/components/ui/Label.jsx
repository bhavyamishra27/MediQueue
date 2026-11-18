import { cn } from '../../lib/utils';

export function Label({ className, children, ...props }) {
  return (
    <label
      className={cn('block text-sm font-medium text-slate-700', className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function FieldError({ children, className }) {
  if (!children) return null;

  return (
    <p className={cn('mt-1.5 text-xs font-medium text-red-600', className)} role="alert">
      {children}
    </p>
  );
}
