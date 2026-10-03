import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Hermetic in-memory Storage. Node's experimental webstorage global
 * (--localstorage-file) can shadow jsdom's `localStorage` in the worker with an
 * object whose methods are missing; force a deterministic Storage everywhere so
 * language persistence etc. behave identically on every machine/CI.
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  } as Storage;
}

const memoryStorage = createMemoryStorage();

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
});

afterEach(() => {
  memoryStorage.clear();
  cleanup();
  vi.restoreAllMocks();
});