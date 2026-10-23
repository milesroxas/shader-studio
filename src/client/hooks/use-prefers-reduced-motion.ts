'use client'

import { useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', onStoreChange)
  return () => mq.removeEventListener('change', onStoreChange)
}

const getSnapshot = (): boolean => window.matchMedia(REDUCED_MOTION_QUERY).matches
const getServerSnapshot = (): boolean => false

/** Reactive `prefers-reduced-motion: reduce` state. SSR-safe (returns `false` on the server). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
