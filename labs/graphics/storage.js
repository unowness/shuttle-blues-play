// Shared persistence code runs against this namespace only. A separate URL
// path does not isolate localStorage from the production game on the same host.
export const LAB_STORAGE_PREFIX = 'spaser.graphics-lab.v1:';

// Accepts the same getItem/setItem/removeItem backend as the game Storage.
// Explicit null stays unavailable; callers must pass that null to Storage
// rather than falling back to its production default backend.
export function createLabBackend(store) {
  if (arguments.length === 0) {
    try { store = globalThis.localStorage; }
    catch { return null; }
  }
  if (!store) return null;
  return {
    getItem: key => store.getItem(LAB_STORAGE_PREFIX + key),
    setItem: (key, value) => store.setItem(LAB_STORAGE_PREFIX + key, value),
    removeItem: key => store.removeItem(LAB_STORAGE_PREFIX + key),
  };
}
