/** Eindeutige ID — funktioniert auch per HTTP (Handy im LAN ohne secure context). */
export function createId() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      /* Fallback ohne secure context (HTTP / LAN) */
    }
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
