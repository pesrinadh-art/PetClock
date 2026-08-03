import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local, client-only pet photo URIs, keyed by petId. A photo is pure presentation, so it
 * deliberately lives OUTSIDE the frozen `Pet` contract (lib/db/models.ts) rather than adding a
 * column to it — the emoji avatar remains the source of truth and the photo is an optional
 * device-local overlay. Backed by AsyncStorage with a tiny subscribe seam so the pet list, pet
 * detail and the add/edit form all stay in sync when a photo changes.
 *
 * URIs from expo-image-picker are on-device file paths; they are meaningless on another device,
 * which is another reason this stays local and out of the synced contract.
 */
const KEY = 'pawclock:petPhotos';

type PhotoMap = Record<string, string>;
type Listener = () => void;

let cache: PhotoMap | null = null;
const listeners = new Set<Listener>();

async function load(): Promise<PhotoMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as PhotoMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function persistAndNotify(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cache ?? {}));
  for (const l of listeners) l();
}

export async function setPetPhoto(petId: string, uri: string): Promise<void> {
  const map = await load();
  cache = { ...map, [petId]: uri };
  await persistAndNotify();
}

export async function removePetPhoto(petId: string): Promise<void> {
  const map = await load();
  if (!(petId in map)) return;
  const next = { ...map };
  delete next[petId];
  cache = next;
  await persistAndNotify();
}

/** Reactive read of a single pet's photo uri (null when none set). */
export function usePetPhoto(petId: string): string | null {
  const [uri, setUri] = useState<string | null>(() => (cache ? cache[petId] ?? null : null));

  useEffect(() => {
    let live = true;
    const pull = () => {
      void load().then((map) => {
        if (live) setUri(map[petId] ?? null);
      });
    };
    pull();
    const unsub = () => listeners.delete(pull);
    listeners.add(pull);
    return () => {
      live = false;
      unsub();
    };
  }, [petId]);

  return uri;
}
