'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';
import { durations, ease } from '../lib/motion';

export interface ResolveProps {
  /** Lines appear one by one, blur to sharp, as if composed in front of the reader. */
  lines: string[];
  className?: string;
  lineClassName?: string;
  /** Seconds between lines. */
  stagger?: number;
  as?: 'p' | 'div' | 'h1' | 'h2';
}

export function Resolve({
  lines,
  className,
  lineClassName,
  stagger = 0.18,
  as = 'div',
}: ResolveProps) {
  const reduced = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag className={className} aria-live="polite">
      {lines.map((line, i) => (
        <motion.span
          // Lines are append-only while streaming, so index is a stable key.
          key={i}
          className={cn('block', lineClassName)}
          initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(8px)', y: 4 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{
            duration: reduced ? durations.control : durations.panel,
            ease,
            delay: i * stagger,
          }}
        >
          {line}
        </motion.span>
      ))}
    </Tag>
  );
}
