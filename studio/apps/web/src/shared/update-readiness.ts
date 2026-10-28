import { useEffect, useRef } from 'react';
import { hasPendingWrites } from '../api';

const guards = new Set<() => boolean | Promise<boolean>>();
export function useUpdateGuard(prepare: () => boolean | Promise<boolean>) {
  const current = useRef(prepare); current.current = prepare;
  useEffect(() => { const guard = () => current.current(); guards.add(guard); return () => { guards.delete(guard); }; }, []);
}
export async function prepareUpdate() {
  try { for (const guard of guards) if (!await guard()) return false; return !hasPendingWrites(); }
  catch { return false; }
}
export function useUpdatePreparation() {
  useEffect(() => {
    let frozen = false;
    let generation = 0;
    const restore = () => { generation++; if (frozen) { document.body.inert = false; frozen = false; } };
    const off = window.desktop?.onPrepareUpdate?.(async () => {
      const token = generation;
      if (!await prepareUpdate() || token !== generation) return false;
      document.body.inert = true; frozen = true; return true;
    });
    const resume = window.desktop?.onResumeAfterUpdate?.(restore);
    return () => { off?.(); resume?.(); restore(); };
  }, []);
}
