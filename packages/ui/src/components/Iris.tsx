import { cn } from '../lib/cn';

export type IrisState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface IrisProps {
  state?: IrisState;
  /** 0–1. While speaking, drives the core's brightness in rhythm with streamed text. */
  level?: number;
  size?: number;
  className?: string;
  /** Accessible description. Defaults to a plain sentence for the state. */
  label?: string;
}

const describe: Record<IrisState, string> = {
  idle: 'Assistant idle',
  listening: 'Assistant listening',
  thinking: 'Assistant thinking',
  speaking: 'Assistant responding',
};

// Ring radii and per-state scale. Listening tightens the rings toward the core.
const rings = [
  { r: 56, dash: '2 6', spin: 'animate-spin-slower', tighten: 0.82 },
  { r: 44, dash: '1 3', spin: 'animate-spin-slow', tighten: 0.8 },
  { r: 32, dash: '18 6', spin: 'animate-spin-mid', tighten: 0.78 },
  { r: 22, dash: undefined, spin: 'animate-spin-slow', tighten: 0.8 },
] as const;

/**
 * The Iris: the visible presence of the AI. Concentric rings around a soft synapse core.
 * idle breathes, listening tightens, thinking rotates at different speeds, speaking brightens the core.
 */
export function Iris({ state = 'idle', level = 0.5, size = 96, className, label }: IrisProps) {
  const lvl = Math.min(1, Math.max(0, level));
  const coreOpacity = state === 'speaking' ? 0.55 + lvl * 0.45 : state === 'idle' ? 0.7 : 0.85;
  const coreR = state === 'speaking' ? 9 + lvl * 4 : 9;

  return (
    <div
      role="img"
      aria-label={label ?? describe[state]}
      data-state={state}
      className={cn('relative inline-block', state === 'idle' && 'animate-breathe', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id="iris-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--synapse)" stopOpacity="1" />
            <stop offset="55%" stopColor="var(--synapse)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--synapse)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r="58"
          fill="var(--synapse-glow)"
          opacity={state === 'idle' ? 0.35 : 0.6}
        />
        {rings.map((ring, i) => (
          <g
            key={ring.r}
            className={cn(state === 'thinking' && ring.spin)}
            style={{
              transformOrigin: '60px 60px',
              transform: state === 'listening' ? `scale(${ring.tighten})` : 'scale(1)',
              transition: 'transform 480ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <circle
              cx="60"
              cy="60"
              r={ring.r}
              fill="none"
              stroke="var(--synapse)"
              strokeOpacity={0.18 + i * 0.12}
              strokeWidth={1}
              strokeDasharray={ring.dash}
            />
          </g>
        ))}
        <circle
          cx="60"
          cy="60"
          r={coreR * 2}
          fill="url(#iris-core)"
          style={{ opacity: coreOpacity, transition: 'opacity 240ms, r 240ms' }}
        />
        <circle cx="60" cy="60" r={3} fill="var(--synapse)" />
      </svg>
    </div>
  );
}
