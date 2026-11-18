import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional Tailwind class names without duplicate conflicts. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
