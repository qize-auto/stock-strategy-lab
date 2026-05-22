/* ═══════════════════════════════════════════════
   Evolution Web Worker
   Runs genetic algorithm off the main thread
   to keep UI responsive during computation.
   ═══════════════════════════════════════════════ */

import { runEvolution } from '@/services/strategyEvolution';
import type { EvolutionConfig, EvolutionResult } from '@/services/strategyEvolution';
import type { KLineData } from '@/services/stockApi';

/* ─── Message Types ─── */

interface WorkerInputMessage {
  klines: KLineData[];
  config: Partial<EvolutionConfig>;
  id: string;
}

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

type WorkerOutputMessage =
  | WorkerProgressMessage
  | WorkerCompleteMessage
  | WorkerErrorMessage;

/* ─── Message Handler ─── */

self.onmessage = async (e: MessageEvent<WorkerInputMessage>) => {
  const { klines, config, id } = e.data;

  // Validate input
  if (!klines || !Array.isArray(klines) || klines.length === 0) {
    const errMsg: WorkerErrorMessage = {
      type: 'error',
      error: 'Invalid or empty K-line data',
      id,
    };
    self.postMessage(errMsg);
    return;
  }

  try {
    const result = await runEvolution(
      klines,
      config,
      (gen: number, bestFitness: number, avgFitness: number) => {
        const progressMsg: WorkerProgressMessage = {
          type: 'progress',
          gen,
          bestFitness,
          avgFitness,
          id,
        };
        self.postMessage(progressMsg);
      }
    );

    const completeMsg: WorkerCompleteMessage = {
      type: 'complete',
      result,
      id,
    };
    self.postMessage(completeMsg);
  } catch (error) {
    const errorMsg: WorkerErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      id,
    };
    self.postMessage(errorMsg);
  }
};

/* ─── Keep TypeScript happy about module context ─── */
export {};
