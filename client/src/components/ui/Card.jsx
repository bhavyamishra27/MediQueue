import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('border-b border-slate-100 px-6 py-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h2
      className={cn('text-base font-semibold tracking-tight text-slate-900', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn('mt-1 text-sm leading-6 text-slate-500', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('px-6 py-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('border-t border-slate-100 px-6 py-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
