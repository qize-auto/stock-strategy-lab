/* ═══════════════════════════════════════════════
   useEvolutionWorker — React hook wrapper
   Manages Web Worker lifecycle for GA evolution.
   ═══════════════════════════════════════════════ */

import { useRef, useCallback, useEffect } from 'react';
import type { EvolutionConfig, EvolutionResult } from '@/services/strategyEvolution';
import type { KLineData } from '@/services/stockApi';

/* ─── Worker Message Types (mirror of worker types) ─── */

interface WorkerProgressMessage {
  type: 'progress';
  gen: number;
  bestFitness: number;
  avgFitness: number;
  id: string;
}

interface WorkerCompleteMessage {
  type: 'complete';
  result: EvolutionResult;
  id: string;
}

interface WorkerErrorMessage {
  type: 'error';
  error: string;
  id: string;
}

type WorkerOutputMessage = WorkerProgressMessage | WorkerCompleteMessage | WorkerErrorMessage;

export interface UseEvolutionWorkerReturn {
  /** Start a new evolution job (terminates any running one) */
  startEvolution: (
    klines: KLineData[],
    config: Partial<EvolutionConfig>,
    onProgress: (gen: number, best: number, avg: number) => void,
    onComplete: (result: EvolutionResult) => void,
    onError: (err: string) => void,
  ) => (() => void);

  /** Terminate the current worker immediately */
  stopEvolution: () => void;

  /** Whether a worker is currently running */
  isRunning: () => boolean;
}

/**
 * React hook that wraps the evolution Web Worker.
 *
 * Usage:
 *   const { startEvolution, stopEvolution, isRunning } = useEvolutionWorker();
 *
 *   // Start
 *   const cleanup = startEvolution(
 *     klines, config,
 *     (gen, best, avg) => { … },
 *     (result) => { … },
 *     (err) => { … },
 *   );
 *
 *   // Stop
 *   stopEvolution();
 */
export function useEvolutionWorker(): UseEvolutionWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const runningRef = useRef<boolean>(false);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        runningRef.current = false;
      }
    };
  }, []);

  /* ── Start evolution in a fresh Worker ── */
  const startEvolution = useCallback(
    (
      klines: KLineData[],
      config: Partial<EvolutionConfig>,
      onProgress: (gen: number, best: number, avg: number) => void,
      onComplete: (result: EvolutionResult) => void,
      onError: (err: string) => void,
    ): (() => void) => {
      // Terminate any previous worker
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      runningRef.current = true;

      // Create new module worker via Vite's supported URL pattern
      const worker = new Worker(
        new URL('@/workers/evolution.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;

      const jobId = Math.random().toString(36).slice(2);

      worker.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
        const msg = e.data;

        // Ignore messages from stale jobs
        if (!msg || (msg as any).id !== jobId) return;

        switch (msg.type) {
          case 'progress':
            onProgress(msg.gen, msg.bestFitness, msg.avgFitness);
            break;
          case 'complete':
            runningRef.current = false;
            onComplete(msg.result);
            // Auto-terminate after completion to free resources
            worker.terminate();
            if (workerRef.current === worker) {
              workerRef.current = null;
            }
            break;
          case 'error':
            runningRef.current = false;
            onError(msg.error);
            worker.terminate();
            if (workerRef.current === worker) {
              workerRef.current = null;
            }
            break;
        }
      };

      worker.onerror = (err) => {
        runningRef.current = false;
        onError(err.message || 'Worker encountered an error');
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      };

      // Send data to worker (klines must be Cloneable — plain objects are fine)
      worker.postMessage({ klines, config, id: jobId });

      // Return cleanup function that kills this specific worker instance
      return () => {
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
        runningRef.current = false;
      };
    },
    [],
  );

  /* ── Stop / terminate ── */
  const stopEvolution = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    runningRef.current = false;
  }, []);

  /* ── Running predicate ── */
  const isRunning = useCallback(() => runningRef.current, []);

  return { startEvolution, stopEvolution, isRunning };
}
