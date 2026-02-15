import { useState, useEffect } from 'react';

/** Matches Tailwind's `lg` breakpoint (1024px) */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    window.matchMedia('(min-width: 1024px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}
