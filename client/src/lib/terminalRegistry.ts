/**
 * Module-level registry for terminal write functions.
 * Lives outside React lifecycle — immune to StrictMode, refs, and stale closures.
 */
const writers = new Map<string, (base64Data: string) => void>();
const buffers = new Map<string, string[]>();

export function registerTerminalWriter(id: string, write: (base64Data: string) => void) {
  console.log('[Registry] Registering writer for:', id);
  writers.set(id, write);
  console.log('[Registry] Total writers:', writers.size, 'IDs:', Array.from(writers.keys()));
  // Flush any data that arrived before the writer was ready
  const buf = buffers.get(id);
  if (buf) {
    console.log('[Registry] Flushing', buf.length, 'buffered items for:', id);
    for (const data of buf) write(data);
    buffers.delete(id);
  }
}

export function unregisterTerminalWriter(id: string) {
  console.log('[Registry] Unregistering writer for:', id);
  writers.delete(id);
  buffers.delete(id);
  console.log('[Registry] Total writers:', writers.size);
}

export function writeTerminalData(id: string, base64Data: string) {
  console.log('[Registry] writeTerminalData called for:', id, 'hasWriter:', writers.has(id), 'dataLen:', base64Data.length);
  const writer = writers.get(id);
  if (writer) {
    console.log('[Registry] Writing data directly');
    writer(base64Data);
  } else {
    console.log('[Registry] Buffering data, current buffer size:', buffers.get(id)?.length ?? 0);
    const buf = buffers.get(id);
    if (buf) {
      buf.push(base64Data);
    } else {
      buffers.set(id, [base64Data]);
    }
  }
}
