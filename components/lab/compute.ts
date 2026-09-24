'use client';
import type {
  AnalysisMode,
  ComputeRequest,
  ComputeResponse,
} from '@/src/science/dispatch';
import type { Configuration } from '@/src/science/types';
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
let worker: Worker | null = null,
  workerUnavailable = false,
  sequence = 0;
const pending = new Map<number, Pending>();
const WORKER_UNAVAILABLE = 'worker-unavailable';
function failAll(message: string) {
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
}
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../../src/science/worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
    const p = pending.get(event.data.id);
    if (!p) return;
    pending.delete(event.data.id);
    if ('error' in event.data) p.reject(new Error(event.data.error));
    else p.resolve(event.data.result);
  };
  worker.onerror = () => {
    // A worker that cannot load or crashes is abandoned; callers fall back
    // to the HTTP API so the laboratory keeps working.
    workerUnavailable = true;
    worker?.terminate();
    worker = null;
    failAll(WORKER_UNAVAILABLE);
  };
  return worker;
}
async function viaApi<T>(
  mode: AnalysisMode,
  config: Configuration,
  options?: unknown,
): Promise<T> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, config, options }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok || data.error)
    throw new Error(data.error ?? 'The simulation request failed.');
  return data;
}
/**
 * Runs an analysis in a browser worker (no server round trip, no request
 * timeout); falls back to /api/simulate when workers are unavailable.
 */
export async function compute<T>(
  mode: AnalysisMode,
  config: Configuration,
  options?: unknown,
): Promise<T> {
  if (typeof Worker === 'undefined' || workerUnavailable)
    return viaApi<T>(mode, config, options);
  try {
    return await new Promise<T>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve: (v) => resolve(v as T), reject });
      const request: ComputeRequest = { id, mode, config, options };
      getWorker().postMessage(request);
    });
  } catch (e) {
    if ((e as Error).message === WORKER_UNAVAILABLE)
      return viaApi<T>(mode, config, options);
    throw e;
  }
}
