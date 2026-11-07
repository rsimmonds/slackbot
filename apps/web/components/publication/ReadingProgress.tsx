'use client';

import { SignalLine } from '@cmobeat/ui';
import { useEffect, useState } from 'react';

/**
 * Reading progress as a hairline signal line pinned under the header. It tracks scroll through
 * the element with the given id. It is a position indicator, not an animation, so it stays on
 * under reduced motion (SignalLine's transition is already reduced to a fade there).
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const read = total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total));
      setValue(read);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId]);
  return (
    <div className="sticky top-16 z-30 -mx-4 md:-mx-8">
      <SignalLine value={value} label="Reading progress" />
    </div>
  );
}
