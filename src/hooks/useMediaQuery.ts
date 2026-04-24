'use client';
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const apply = () => setMatches(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean  { return useMediaQuery('(max-width: 639px)'); }
export function useIsTablet(): boolean  { return useMediaQuery('(min-width: 640px) and (max-width: 1023px)'); }
export function useIsTouch(): boolean   { return useMediaQuery('(pointer: coarse)'); }
export function useIsNarrow(): boolean  { return useMediaQuery('(max-width: 1023px)'); }
export function useIsPortrait(): boolean { return useMediaQuery('(orientation: portrait)'); }

export function useLockBodyScroll(lock: boolean = true): void {
  useEffect(() => {
    if (!lock) return;
    document.body.classList.add('prs-lock-scroll');
    return () => { document.body.classList.remove('prs-lock-scroll'); };
  }, [lock]);
}
