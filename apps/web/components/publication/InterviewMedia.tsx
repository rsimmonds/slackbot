'use client';

import { MonoLabel } from '@cmobeat/ui';
import { useRef } from 'react';
import { formatDuration } from '@/lib/publication/labels';

/**
 * First-party <audio>/<video> with preload="none": no third-party script and nothing fetched until
 * the reader presses play. Chapters seek the player when there is one; without a recording
 * they are a plain outline.
 */
export function InterviewMedia({
  media,
  chapters,
  title,
}: {
  media: { kind?: 'audio' | 'video'; src?: string | null; durationSec?: number } | null;
  chapters: { title: string; at: number }[] | null;
  title: string;
}) {
  const ref = useRef<HTMLMediaElement | null>(null);
  const src = media?.src ?? null;
  const seek = (at: number) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = at;
    void el.play().catch(() => {});
  };

  return (
    <section aria-label="Recording and chapters" className="flex flex-col gap-5">
      {src ? (
        media?.kind === 'video' ? (
          <video
            ref={(el) => {
              ref.current = el;
            }}
            src={src}
            controls
            preload="none"
            className="w-full rounded-panel border border-line bg-concrete"
            aria-label={`Video: ${title}`}
          />
        ) : (
          <audio
            ref={(el) => {
              ref.current = el;
            }}
            src={src}
            controls
            preload="none"
            className="w-full"
            aria-label={`Audio: ${title}`}
          />
        )
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-panel border border-line bg-surface p-4">
          <MonoLabel>
            {media?.kind === 'video' ? 'Video' : 'Audio'}
            {media?.durationSec ? ` · ${formatDuration(media.durationSec)}` : ''}
          </MonoLabel>
          <span className="text-small text-text-3">Recording published with the next issue.</span>
        </div>
      )}
      {chapters?.length ? (
        <nav aria-label="Chapters">
          <MonoLabel>Chapters</MonoLabel>
          <ol className="mt-3 flex flex-col divide-y divide-line border-y border-line">
            {chapters.map((c) => (
              <li key={`${c.at}-${c.title}`} className="flex items-baseline gap-4 py-3">
                <span className="numeric w-12 shrink-0 text-micro text-text-3">
                  {formatDuration(c.at)}
                </span>
                {src ? (
                  <button
                    type="button"
                    onClick={() => seek(c.at)}
                    className="text-left text-small text-text underline-offset-4 hover:underline"
                  >
                    {c.title}
                  </button>
                ) : (
                  <span className="text-small text-text-2">{c.title}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </section>
  );
}
