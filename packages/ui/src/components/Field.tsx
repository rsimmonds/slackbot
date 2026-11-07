import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-control border border-line bg-surface px-3 text-text placeholder:text-text-3 ' +
  'transition-[border-color,box-shadow] duration-[240ms] ease-calm hover:border-line-strong ' +
  'focus:border-synapse focus:outline-none focus:shadow-[0_0_0_4px_var(--synapse-glow)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-10 text-small', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'py-3 text-body', className)} {...props} />;
});

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-micro text-text-3">{hint}</p> : null}
    </div>
  );
}
