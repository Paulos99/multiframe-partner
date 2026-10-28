import { useSyncExternalStore } from 'react';

/** Состояние «Профиля», который прикладывается к комнате уже после открытия её страницы. */
export type ProfileAttachState = 'pending' | 'failed';

const states = new Map<string, ProfileAttachState>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function setProfileAttach(objectId: string, state: ProfileAttachState | null) {
  if (state) states.set(objectId, state);
  else if (!states.delete(objectId)) return;
  emit();
}

export function getProfileAttach(objectId: string): ProfileAttachState | null {
  return states.get(objectId) ?? null;
}

export function useProfileAttach(objectId: string | null | undefined): ProfileAttachState | null {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return objectId ? getProfileAttach(objectId) : null;
}
