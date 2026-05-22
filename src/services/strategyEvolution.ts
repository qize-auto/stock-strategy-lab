import type { KLineData } from './stockApi';
import type { StrategyElement } from '../contexts/AppContext';
import {
  ENTRY_SIGNALS,
  EXIT_SIGNALS,
  FILTERS,
  RISK_MANAGEMENT,
  scoreCombination,
  cloneElement,
  getParamValue,
  runBacktest,
} from './strategyEngine';

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface Genome {
  elements: StrategyElement[];
  fitness: number;
  generation: number;
  id: string;
}

export interface EvolutionConfig {
  populationSize: number;
  maxGenerations: number;
  crossoverRate: number;
  mutationRate: number;
  elitismCount: number;
  targetFitness: number;
  /** 连续多少代最优适应度无改进则早停 (0=禁用) */
  stagnationGenerations: number;
  /** 种群多样性低于此值则早停 (0=禁用) */
  minDiversity: number;
  /** Walk-Forward分析：训练集占比 (0.7=70%训练30%测试) */
  walkForwardTrainRatio: number;
  /** 过拟合阈值：训练/测试得分差异超过此比例则标记为过拟合 */
  overfitThreshold: number;
}

export interface EvolutionResult {
  bestGenome: Genome;
  generations: Genome[][];
  stats: {
    avgFitnessPerGen: number[];
    bestFitnessPerGen: number[];
    diversityPerGen: number[];
  };
  /** Walk-Forward过拟合检测结果 */
  walkForward: {
    trainFitness: number;
    testFitness: number;
    overfitRatio: number;
    isOverfitted: boolean;
  } | null;
  /** 早停原因 (null=正常完成) */
  earlyStopReason: 'target' | 'stagnation' | 'low_diversity' | 'overfitting' | null;
  elapsedMs: number;
}

export interface APIKeyConfig {
  provider: 'openai' | 'deepseek' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  volatility: number;
  bestReturn: number;
  worstReturn: number;
  avgHoldDays: number;
}

export interface StrategyReport {
  strategyName: string;
  description: string;
  elements: StrategyElement[];
  backtestResult: {
    totalReturn: number;
    annualizedReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
  analysis: string;
  riskAssessment: string;
  createdAt: string;
}

/* ═══════════════════════════════════════════════
   Constants & Defaults
   ═══════════════════════════════════════════════ */

const DEFAULT_CONFIG: EvolutionConfig = {
  populationSize: 30,
  maxGenerations: 20,
  crossoverRate: 0.7,
  mutationRate: 0.2,
  elitismCount: 3,
  targetFitness: 85,
  stagnationGenerations: 7,
  minDiversity: 0.1,
  walkForwardTrainRatio: 0.7,
  overfitThreshold: 0.5,
};

const STORAGE_KEY_API = 'quant_lab_api_config';
const ENCRYPTION_SALT = 'quant_lab_evolution_salt_v1';

let _elementPool: StrategyElement[] | null = null;

/* ═══════════════════════════════════════════════
   Crypto helpers (PBKDF2 + AES-GCM)
   ═══════════════════════════════════════════════ */

async function getCryptoKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(ENCRYPTION_SALT);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_SALT + window.location.hostname),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(plain: string): Promise<string> {
  try {
    const key = await getCryptoKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plain)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch {
    return plain;
  }
}

async function decryptData(cipher: string): Promise<string | null> {
  try {
    const key = await getCryptoKey();
    const combined = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════
   Element Pool
   ═══════════════════════════════════════════════ */

export function getEvolutionElementPool(): StrategyElement[] {
  if (!_elementPool) {
    _elementPool = [
      ...ENTRY_SIGNALS.map((e) => cloneElement(e)),
      ...EXIT_SIGNALS.map((e) => cloneElement(e)),
      ...FILTERS.map((e) => cloneElement(e)),
      ...RISK_MANAGEMENT.map((e) => cloneElement(e)),
    ];
  }
  return _elementPool.map((e) => cloneElement(e));
}

/* ═══════════════════════════════════════════════
   ID Generator
   ═══════════════════════════════════════════════ */

function genId(prefix = 'g'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ═══════════════════════════════════════════════
   Population Initialization
   ═══════════════════════════════════════════════ */

function initializePopulation(
  size: number,
  availableElements: StrategyElement[]
): Genome[] {
  const entryEls = availableElements.filter((e) => e.type === 'entry');
  const exitEls = availableElements.filter((e) => e.type === 'exit');
  const filterEls = availableElements.filter((e) => e.type === 'filter');
  const riskEls = availableElements.filter((e) => e.type === 'risk');

  const population: Genome[] = [];

  for (let i = 0; i < size; i++) {
    const elements: StrategyElement[] = [];

    // At least 1 entry (1-2)
    const entryCount = 1 + Math.floor(Math.random() * 2);
    const shuffledEntries = shuffleArray([...entryEls]);
    elements.push(...shuffledEntries.slice(0, entryCount).map((e) => cloneElement(e)));

    // At least 1 exit (1-2)
    const exitCount = 1 + Math.floor(Math.random() * 2);
    const shuffledExits = shuffleArray([...exitEls]);
    elements.push(...shuffledExits.slice(0, exitCount).map((e) => cloneElement(e)));

    // Optional filter (0-1)
    if (Math.random() > 0.3 && filterEls.length > 0) {
      const f = filterEls[Math.floor(Math.random() * filterEls.length)];
      elements.push(cloneElement(f));
    }

    // Optional risk management (0-1)
    if (Math.random() > 0.2 && riskEls.length > 0) {
      const r = riskEls[Math.floor(Math.random() * riskEls.length)];
      elements.push(cloneElement(r));
    }

    // Randomize params
    elements.forEach(randomizeParams);

    population.push({
      elements,
      fitness: 0,
      generation: 0,
      id: genId('genome'),
    });
  }

  return population;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomizeParams(el: StrategyElement): void {
  if (!el.params) return;
  el.params.forEach((p) => {
    if (p.min !== undefined && p.max !== undefined && p.step !== undefined) {
      const steps = Math.floor((p.max - p.min) / p.step);
      const randomStep = Math.floor(Math.random() * (steps + 1));
      p.value = Math.round((p.min + randomStep * p.step) * 100) / 100;
    }
  });
}

/* ═══════════════════════════════════════════════
   Fitness Evaluation
   ═══════════════════════════════════════════════ */

function evaluateFitness(genome: Genome, klines: KLineData[], stockCode?: string): number {
  if (klines.length < 30) return 0;
  return scoreCombination(klines, { elements: genome.elements.map((e) => cloneElement(e)) }, undefined, stockCode);
}

/* ═══════════════════════════════════════════════
   Tournament Selection
   ═══════════════════════════════════════════════ */

function tournamentSelection(
  population: Genome[],
  tournamentSize: number
): Genome {
  let best = population[Math.floor(Math.random() * population.length)];
  for (let i = 1; i < tournamentSize; i++) {
    const contender = population[Math.floor(Math.random() * population.length)];
    if (contender.fitness > best.fitness) best = contender;
  }
  return { ...best, elements: best.elements.map((e) => cloneElement(e)) };
}

/* ═══════════════════════════════════════════════
   Crossover (Uniform)
   ═══════════════════════════════════════════════ */

function crossover(
  parent1: Genome,
  parent2: Genome
): [Genome, Genome] {
  const child1: Genome = {
    id: genId('genome'),
    fitness: 0,
    generation: parent1.generation,
    elements: [],
  };
  const child2: Genome = {
    id: genId('genome'),
    fitness: 0,
    generation: parent1.generation,
    elements: [],
  };

  // Group by type
  const p1ByType = groupByType(parent1.elements);
  const p2ByType = groupByType(parent2.elements);
  const allTypes: StrategyElement['type'][] = ['entry', 'exit', 'filter', 'risk'];

  for (const type of allTypes) {
    const e1 = p1ByType[type] || [];
    const e2 = p2ByType[type] || [];

    if (type === 'entry' || type === 'exit') {
      // Must have at least 1
      const maxLen = Math.max(e1.length, e2.length);
      const c1Els: StrategyElement[] = [];
      const c2Els: StrategyElement[] = [];

      for (let i = 0; i < maxLen; i++) {
        if (i === 0) {
          // First element: crossover
          if (Math.random() < 0.5) {
            c1Els.push(e1[i] ? cloneElement(e1[i]) : cloneElement(e2[i]));
            c2Els.push(e2[i] ? cloneElement(e2[i]) : cloneElement(e1[i]));
          } else {
            c1Els.push(e2[i] ? cloneElement(e2[i]) : cloneElement(e1[i]));
            c2Els.push(e1[i] ? cloneElement(e1[i]) : cloneElement(e2[i]));
          }
        } else {
          // Additional elements: probabilistic
          if (Math.random() < 0.5 && e1[i]) c1Els.push(cloneElement(e1[i]));
          else if (e2[i]) c1Els.push(cloneElement(e2[i]));

          if (Math.random() < 0.5 && e2[i]) c2Els.push(cloneElement(e2[i]));
          else if (e1[i]) c2Els.push(cloneElement(e1[i]));
        }
      }

      // Ensure at least 1
      if (c1Els.length === 0) c1Els.push(cloneElement(e1[0] || e2[0]));
      if (c2Els.length === 0) c2Els.push(cloneElement(e2[0] || e1[0]));

      child1.elements.push(...c1Els);
      child2.elements.push(...c2Els);
    } else {
      // filter/risk: 0 or 1, crossover
      const useFromP1 = Math.random() < 0.5;
      if (useFromP1 && e1.length > 0) child1.elements.push(cloneElement(e1[0]));
      else if (e2.length > 0) child1.elements.push(cloneElement(e2[0]));

      const useFromP2 = Math.random() < 0.5;
      if (useFromP2 && e2.length > 0) child2.elements.push(cloneElement(e2[0]));
      else if (e1.length > 0) child2.elements.push(cloneElement(e1[0]));
    }
  }

  return [child1, child2];
}

function groupByType(elements: StrategyElement[]): Record<string, StrategyElement[]> {
  const grouped: Record<string, StrategyElement[]> = {};
  for (const el of elements) {
    if (!grouped[el.type]) grouped[el.type] = [];
    grouped[el.type].push(el);
  }
  return grouped;
}

/* ═══════════════════════════════════════════════
   Mutation
   ═══════════════════════════════════════════════ */

function mutate(
  genome: Genome,
  availableElements: StrategyElement[]
): Genome {
  const mutated: Genome = {
    ...genome,
    id: genId('genome'),
    elements: genome.elements.map((e) => cloneElement(e)),
  };

  const actions = ['add', 'remove', 'replace', 'param'] as const;
  const action = actions[Math.floor(Math.random() * actions.length)];

  const entryEls = mutated.elements.filter((e) => e.type === 'entry');
  const exitEls = mutated.elements.filter((e) => e.type === 'exit');
  const filterEls = mutated.elements.filter((e) => e.type === 'filter');
  const riskEls = mutated.elements.filter((e) => e.type === 'risk');

  switch (action) {
    case 'add': {
      const poolEntry = availableElements.filter((e) => e.type === 'entry');
      const poolExit = availableElements.filter((e) => e.type === 'exit');
      const poolFilter = availableElements.filter((e) => e.type === 'filter');
      const poolRisk = availableElements.filter((e) => e.type === 'risk');

      if (Math.random() < 0.3 && entryEls.length < 2 && poolEntry.length > entryEls.length) {
        const newEntry = poolEntry.find((e) => !entryEls.some((ee) => ee.id === e.id));
        if (newEntry) mutated.elements.push(cloneElement(newEntry));
      } else if (Math.random() < 0.3 && exitEls.length < 2 && poolExit.length > exitEls.length) {
        const newExit = poolExit.find((e) => !exitEls.some((ee) => ee.id === e.id));
        if (newExit) mutated.elements.push(cloneElement(newExit));
      } else if (Math.random() < 0.3 && filterEls.length === 0 && poolFilter.length > 0) {
        mutated.elements.push(cloneElement(poolFilter[Math.floor(Math.random() * poolFilter.length)]));
      } else if (riskEls.length === 0 && poolRisk.length > 0) {
        mutated.elements.push(cloneElement(poolRisk[Math.floor(Math.random() * poolRisk.length)]));
      }
      break;
    }

    case 'remove': {
      const removable = mutated.elements.filter(
        (e) => (e.type === 'entry' && entryEls.length > 1) ||
               (e.type === 'exit' && exitEls.length > 1) ||
               e.type === 'filter' || e.type === 'risk'
      );
      if (removable.length > 0) {
        const toRemove = removable[Math.floor(Math.random() * removable.length)];
        mutated.elements = mutated.elements.filter((e) => e.id !== toRemove.id);
      }
      break;
    }

    case 'replace': {
      if (mutated.elements.length > 0) {
        const idx = Math.floor(Math.random() * mutated.elements.length);
        const oldEl = mutated.elements[idx];
        const poolOfType = availableElements.filter((e) => e.type === oldEl.type);
        const alternatives = poolOfType.filter((e) => e.id !== oldEl.id);
        if (alternatives.length > 0) {
          const replacement = cloneElement(alternatives[Math.floor(Math.random() * alternatives.length)]);
          randomizeParams(replacement);
          mutated.elements[idx] = replacement;
        }
      }
      break;
    }

    case 'param': {
      const paramEls = mutated.elements.filter((e) => e.params && e.params.length > 0);
      if (paramEls.length > 0) {
        const target = paramEls[Math.floor(Math.random() * paramEls.length)];
        randomizeParams(target);
      }
      break;
    }
  }

  return mutated;
}

/* ═══════════════════════════════════════════════
   Diversity Calculation
   ═══════════════════════════════════════════════ */

function calculateDiversity(population: Genome[]): number {
  if (population.length <= 1) return 0;

  let totalDiff = 0;
  let pairs = 0;

  for (let i = 0; i < Math.min(population.length, 50); i++) {
    for (let j = i + 1; j < Math.min(population.length, 50); j++) {
      totalDiff += genomeDistance(population[i], population[j]);
      pairs++;
    }
  }

  return pairs > 0 ? Math.round((totalDiff / pairs) * 100) / 100 : 0;
}

function genomeDistance(g1: Genome, g2: Genome): number {
  const s1 = new Set(g1.elements.map((e) => e.id));
  const s2 = new Set(g2.elements.map((e) => e.id));

  let common = 0;
  s1.forEach((id) => { if (s2.has(id)) common++; });

  const union = s1.size + s2.size - common;
  return union > 0 ? 1 - common / union : 0;
}

/* ═══════════════════════════════════════════════
   Detailed Backtest for Best Genome
   ═══════════════════════════════════════════════ */

/**
 * Detailed backtest for best genome — delegates to full runBacktest engine
 * so all 31 entry + 23 exit signals are evaluated, not just the 7+7 hard-coded subset.
 */
export function runDetailedBacktest(
  klines: KLineData[],
  elements: StrategyElement[],
  stockCode?: string,
): BacktestMetrics {
  if (klines.length < 30) {
    return {
      totalReturn: 0, annualizedReturn: 0, sharpeRatio: 0,
      maxDrawdown: 0, winRate: 0, totalTrades: 0, winningTrades: 0,
      volatility: 0, bestReturn: 0, worstReturn: 0, avgHoldDays: 0,
    };
  }

  // Use the full backtest engine (supports all 31 entry + 23 exit signals)
  const result = runBacktest(klines, { elements }, 100000, undefined, stockCode);

  if (result.tradeCount === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, sharpeRatio: 0,
      maxDrawdown: Math.round(result.maxDrawdown * 100) / 100,
      winRate: 0, totalTrades: 0, winningTrades: 0,
      volatility: 0, bestReturn: 0, worstReturn: 0, avgHoldDays: 0,
    };
  }

  const trades = result.trades;
  const pnls = trades.map((t) => t.pnlPct);
  const winningTrades = trades.filter((t) => t.pnlPct > 0).length;
  const avgReturn = result.totalReturn / result.tradeCount;
  const avgHoldDays = trades.reduce((s, t) => s + t.holdBars, 0) / trades.length;

  // Volatility (population std dev of per-trade returns)
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const variance = pnls.reduce((s, v) => s + (v - mean) * (v - mean), 0) / pnls.length;
  const volatility = Math.sqrt(variance);

  // Sharpe (simplified, risk-free rate = 0)
  const sharpeRatio = volatility > 0 ? (avgReturn / volatility) * Math.sqrt(result.tradeCount) : 0;

  // Annualized return — use actual trading bars / 252
  const tradingDays = Math.floor(klines.length / 252) || 1;
  const annualizedReturn = result.totalReturn * (1 / tradingDays);

  // Equity-curve drawdown
  let peak = 0;
  let running = 0;
  let maxDD = 0;
  for (const t of trades) {
    running += t.pnlPct;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalReturn: Math.round(result.totalReturn * 10) / 10,
    annualizedReturn: Math.round(annualizedReturn * 10) / 10,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    winRate: Math.round(result.winRate * 10) / 10,
    totalTrades: result.tradeCount,
    winningTrades: winningTrades,
    volatility: Math.round(volatility * 100) / 100,
    bestReturn: Math.round(Math.max(...pnls) * 10) / 10,
    worstReturn: Math.round(Math.min(...pnls) * 10) / 10,
    avgHoldDays: Math.round(avgHoldDays * 10) / 10,
  };
}

/* ═══════════════════════════════════════════════
   Main Evolution Loop
   ═══════════════════════════════════════════════ */

export async function runEvolution(
  klines: KLineData[],
  config?: Partial<EvolutionConfig>,
  onProgress?: (gen: number, bestFitness: number, avgFitness: number) => void
): Promise<EvolutionResult> {
  const cfg: EvolutionConfig = { ...DEFAULT_CONFIG, ...config };
  const pool = getEvolutionElementPool();
  const startTime = performance.now();

  // ═══ Walk-Forward: split data into train / test sets ═══
  const trainSplitIdx = Math.floor(klines.length * cfg.walkForwardTrainRatio);
  const trainKlines = klines.slice(0, trainSplitIdx);
  const testKlines = klines.slice(trainSplitIdx);
  const hasTestSet = testKlines.length >= 30;


  // Initialize population
  let population = initializePopulation(cfg.populationSize, pool);

  // Evaluate on TRAINING set only
  for (const genome of population) {
    genome.fitness = evaluateFitness(genome, trainKlines);
  }

  const generations: Genome[][] = [];
  const avgFitnessPerGen: number[] = [];
  const bestFitnessPerGen: number[] = [];
  const diversityPerGen: number[] = [];

  let bestGenome: Genome = { ...population[0], elements: population[0].elements.map((e) => cloneElement(e)) };

  // Early-stop tracking
  let generationsWithoutImprovement = 0;
  let lastBestFitness = -Infinity;
  let earlyStopReason: EvolutionResult['earlyStopReason'] = null;

  for (let gen = 0; gen < cfg.maxGenerations; gen++) {
    // Sort by fitness descending
    population.sort((a, b) => b.fitness - a.fitness);

    // Track best (on training set)
    if (population[0].fitness > bestGenome.fitness) {
      bestGenome = {
        ...population[0],
        elements: population[0].elements.map((e) => cloneElement(e)),
        generation: gen,
      };
    }

    // Stats
    const avgFitness = population.reduce((s, g) => s + g.fitness, 0) / population.length;
    const diversity = calculateDiversity(population);

    avgFitnessPerGen.push(Math.round(avgFitness * 10) / 10);
    bestFitnessPerGen.push(Math.round(population[0].fitness * 10) / 10);
    diversityPerGen.push(diversity);

    // Save generation snapshot
    generations.push(
      population.slice(0, 5).map((g) => ({
        ...g,
        elements: g.elements.map((e) => cloneElement(e)),
      }))
    );

    // Progress callback
    onProgress?.(gen, population[0].fitness, avgFitness);

    // Yield to event loop
    await new Promise((r) => setTimeout(r, 0));

    // ═══ Early Stop 1: target fitness reached ═══
    if (population[0].fitness >= cfg.targetFitness) {
      earlyStopReason = 'target';
      break;
    }

    // ═══ Early Stop 2: stagnation (no improvement for N generations) ═══
    if (population[0].fitness > lastBestFitness) {
      lastBestFitness = population[0].fitness;
      generationsWithoutImprovement = 0;
    } else {
      generationsWithoutImprovement++;
    }
    if (cfg.stagnationGenerations > 0 && generationsWithoutImprovement >= cfg.stagnationGenerations) {
      earlyStopReason = 'stagnation';
      break;
    }

    // ═══ Early Stop 3: low diversity ═══
    if (cfg.minDiversity > 0 && diversity < cfg.minDiversity) {
      earlyStopReason = 'low_diversity';
      break;
    }

    // Next generation
    const newPopulation: Genome[] = [];

    // Elitism
    for (let i = 0; i < cfg.elitismCount && i < population.length; i++) {
      newPopulation.push({
        ...population[i],
        id: genId('genome'),
        elements: population[i].elements.map((e) => cloneElement(e)),
        generation: gen + 1,
      });
    }

    // Generate offspring
    while (newPopulation.length < cfg.populationSize) {
      const parent1 = tournamentSelection(population, 3);
      const parent2 = tournamentSelection(population, 3);

      let [child1, child2]: [Genome, Genome] = [
        { ...parent1, id: genId('genome'), generation: gen + 1, elements: parent1.elements.map((e) => cloneElement(e)) },
        { ...parent2, id: genId('genome'), generation: gen + 1, elements: parent2.elements.map((e) => cloneElement(e)) },
      ];

      // Crossover
      if (Math.random() < cfg.crossoverRate) {
        [child1, child2] = crossover(parent1, parent2);
        child1.generation = gen + 1;
        child2.generation = gen + 1;
      }

      // Mutation
      if (Math.random() < cfg.mutationRate) {
        child1 = mutate(child1, pool);
        child1.generation = gen + 1;
      }
      if (Math.random() < cfg.mutationRate && newPopulation.length + 1 < cfg.populationSize) {
        child2 = mutate(child2, pool);
        child2.generation = gen + 1;
      }

      // Evaluate children
      child1.fitness = evaluateFitness(child1, klines);
      child2.fitness = evaluateFitness(child2, klines);

      newPopulation.push(child1);
      if (newPopulation.length < cfg.populationSize) {
        newPopulation.push(child2);
      }
    }

    population = newPopulation;
  }

  // ═══ Final sort and best ═══
  population.sort((a, b) => b.fitness - a.fitness);
  if (population[0].fitness > bestGenome.fitness) {
    bestGenome = {
      ...population[0],
      elements: population[0].elements.map((e) => cloneElement(e)),
      generation: cfg.maxGenerations,
    };
  }

  // ═══ Walk-Forward: evaluate best genome on TEST set ═══
  let walkForward: EvolutionResult['walkForward'] = null;
  if (hasTestSet) {
    const testFitness = evaluateFitness(bestGenome, testKlines);
    const overfitRatio = bestGenome.fitness > 0
      ? (bestGenome.fitness - testFitness) / bestGenome.fitness
      : 0;
    const isOverfitted = overfitRatio > cfg.overfitThreshold;

    walkForward = {
      trainFitness: Math.round(bestGenome.fitness * 10) / 10,
      testFitness: Math.round(testFitness * 10) / 10,
      overfitRatio: Math.round(overfitRatio * 1000) / 1000,
      isOverfitted,
    };


    // Early stop 4: overfitting detected (test score much worse than train)
    if (!earlyStopReason && isOverfitted) {
      earlyStopReason = 'overfitting';
    }
  }

  // Store train fitness as the "official" fitness
  bestGenome.fitness = Math.round(bestGenome.fitness * 10) / 10;

  const elapsedMs = Math.round(performance.now() - startTime);

  return {
    bestGenome,
    generations,
    stats: { avgFitnessPerGen, bestFitnessPerGen, diversityPerGen },
    walkForward,
    earlyStopReason,
    elapsedMs,
  };
}


/* ═══════════════════════════════════════════════
   API Key Management
   ═══════════════════════════════════════════════ */

export async function saveAPIKeyConfig(config: APIKeyConfig): Promise<void> {
  const data = JSON.stringify(config);
  const encrypted = await encryptData(data);
  localStorage.setItem(STORAGE_KEY_API, encrypted);
}

export async function getAPIKeyConfig(): Promise<APIKeyConfig | null> {
  const encrypted = localStorage.getItem(STORAGE_KEY_API);
  if (!encrypted) return null;
  const decrypted = await decryptData(encrypted);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted) as APIKeyConfig;
  } catch {
    return null;
  }
}

export function clearAPIKey(): void {
  localStorage.removeItem(STORAGE_KEY_API);
}

/* ═══════════════════════════════════════════════
   AI API Calls
   ═══════════════════════════════════════════════ */

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '你是一名资深量化策略分析师。请用中文回答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content;
}

async function callDeepSeek(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一名资深量化策略分析师。请用中文回答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`DeepSeek API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from DeepSeek');
  return content;
}

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Empty response from Anthropic');
  return content;
}

async function callCustomAPI(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<string> {
  const url = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'default',
      messages: [
        { role: 'system', content: '你是一名资深量化策略分析师。请用中文回答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Custom API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? data.content?.[0]?.text;
  if (!content) throw new Error('Empty response from custom API');
  return content;
}

/* ═══════════════════════════════════════════════
   Prompt Builder
   ═══════════════════════════════════════════════ */

function buildAnalysisPrompt(
  genome: Genome,
  metrics: BacktestMetrics
): string {
  const elementsDesc = genome.elements
    .map((e) => {
      let line = `- [${e.type.toUpperCase()}] ${e.name}: ${e.description}`;
      if (e.params && e.params.length > 0) {
        line += ` (参数: ${e.params.map((p) => `${p.name}=${p.value}`).join(', ')})`;
      }
      return line;
    })
    .join('\n');

  return `你是一名资深量化策略分析师。请分析以下交易策略的表现并给出专业建议。

策略组成：
${elementsDesc}

回测结果：
- 总收益率: ${metrics.totalReturn}%
- 年化收益率: ${metrics.annualizedReturn}%
- 夏普比率: ${metrics.sharpeRatio}
- 最大回撤: ${metrics.maxDrawdown}%
- 胜率: ${metrics.winRate}%
- 交易次数: ${metrics.totalTrades}
- 最佳单次收益: ${metrics.bestReturn}%
- 最差单次收益: ${metrics.worstReturn}%
- 平均持仓天数: ${metrics.avgHoldDays}

请提供：
1. 策略优势分析
2. 潜在风险点
3. 改进建议
4. 适合的 Market Regime
5. 综合评分（1-100）`;
}

function buildRiskPrompt(
  genome: Genome,
  metrics: BacktestMetrics
): string {
  return `你是一名资深风控分析师。请基于以下策略和回测数据进行风险评估。

策略组成：
${genome.elements.map((e) => `- ${e.name}: ${e.description}`).join('\n')}

回测结果：
- 总收益率: ${metrics.totalReturn}%
- 最大回撤: ${metrics.maxDrawdown}%
- 胜率: ${metrics.winRate}%
- 夏普比率: ${metrics.sharpeRatio}
- 交易次数: ${metrics.totalTrades}
- 最差单次收益: ${metrics.worstReturn}%

请给出专业的风险评估报告（300字以内），包括：风险等级（低/中/高）、主要风险因素、风控建议。`;
}

/* ═══════════════════════════════════════════════
   AI Strategy Analysis
   ═══════════════════════════════════════════════ */

export async function analyzeStrategyWithAI(
  genome: Genome,
  backtestResult: BacktestMetrics,
  apiConfig: APIKeyConfig
): Promise<{ analysis: string; riskAssessment: string }> {
  const analysisPrompt = buildAnalysisPrompt(genome, backtestResult);
  const riskPrompt = buildRiskPrompt(genome, backtestResult);

  let analysis: string;
  let riskAssessment: string;

  try {
    switch (apiConfig.provider) {
      case 'openai':
        analysis = await callOpenAI(apiConfig.apiKey, apiConfig.model, analysisPrompt);
        riskAssessment = await callOpenAI(apiConfig.apiKey, apiConfig.model, riskPrompt);
        break;
      case 'deepseek':
        analysis = await callDeepSeek(apiConfig.apiKey, apiConfig.model, analysisPrompt);
        riskAssessment = await callDeepSeek(apiConfig.apiKey, apiConfig.model, riskPrompt);
        break;
      case 'anthropic':
        analysis = await callAnthropic(apiConfig.apiKey, apiConfig.model, analysisPrompt);
        riskAssessment = await callAnthropic(apiConfig.apiKey, apiConfig.model, riskPrompt);
        break;
      case 'custom':
        if (!apiConfig.baseUrl) throw new Error('Custom API requires baseUrl');
        analysis = await callCustomAPI(apiConfig.baseUrl, apiConfig.apiKey, apiConfig.model, analysisPrompt);
        riskAssessment = await callCustomAPI(apiConfig.baseUrl, apiConfig.apiKey, apiConfig.model, riskPrompt);
        break;
      default:
        throw new Error(`Unsupported provider: ${apiConfig.provider}`);
    }

    return { analysis, riskAssessment };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI analysis failed';
    return {
      analysis: `AI分析暂时不可用。错误: ${msg}\n\n请检查API Key配置和网络连接后重试。`,
      riskAssessment: `风险评估暂时不可用。错误: ${msg}`,
    };
  }
}

/* ═══════════════════════════════════════════════
   Strategy Report Generation
   ═══════════════════════════════════════════════ */

export async function generateStrategyReport(
  genome: Genome,
  backtestResult: BacktestMetrics,
  apiConfig?: APIKeyConfig | null
): Promise<StrategyReport> {
  const entryNames = genome.elements.filter((e) => e.type === 'entry').map((e) => e.name).join('+');
  const strategyName = `进化策略_${entryNames}_${genome.generation}代`;

  let analysis = '未启用AI分析。配置API Key后可获得AI策略分析报告。';
  let riskAssessment = '未启用AI风险评估。配置API Key后可获得专业风险评估。';

  if (apiConfig?.apiKey) {
    try {
      const aiResult = await analyzeStrategyWithAI(genome, backtestResult, apiConfig);
      analysis = aiResult.analysis;
      riskAssessment = aiResult.riskAssessment;
    } catch (err) {
      analysis = `AI分析失败: ${err instanceof Error ? err.message : '未知错误'}`;
      riskAssessment = 'AI风险评估失败。';
    }
  }

  return {
    strategyName,
    description: `由遗传算法进化生成的策略（第${genome.generation}代，适应度${genome.fitness}）`,
    elements: genome.elements.map((e) => cloneElement(e)),
    backtestResult: {
      totalReturn: backtestResult.totalReturn,
      annualizedReturn: backtestResult.annualizedReturn,
      sharpeRatio: backtestResult.sharpeRatio,
      maxDrawdown: backtestResult.maxDrawdown,
      winRate: backtestResult.winRate,
      totalTrades: backtestResult.totalTrades,
    },
    analysis,
    riskAssessment,
    createdAt: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════
   API Key Validation
   ═══════════════════════════════════════════════ */

export async function validateAPIKey(config: APIKeyConfig): Promise<boolean> {
  try {
    const testPrompt = '请回复"OK"，仅这两个字。';
    let response: string;

    switch (config.provider) {
      case 'openai':
        response = await callOpenAI(config.apiKey, config.model, testPrompt);
        break;
      case 'deepseek':
        response = await callDeepSeek(config.apiKey, config.model, testPrompt);
        break;
      case 'anthropic':
        response = await callAnthropic(config.apiKey, config.model, testPrompt);
        break;
      case 'custom':
        if (!config.baseUrl) return false;
        response = await callCustomAPI(config.baseUrl, config.apiKey, config.model, testPrompt);
        break;
      default:
        return false;
    }

    return response.length > 0;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════
   Strategy Import / Export
   ═══════════════════════════════════════════════ */

export function exportStrategy(genome: Genome): string {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    genome: {
      id: genome.id,
      generation: genome.generation,
      fitness: genome.fitness,
      elements: genome.elements.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        description: e.description,
        params: e.params?.map((p) => ({ name: p.name, value: p.value })),
      })),
    },
  };
  return JSON.stringify(exportData, null, 2);
}

export function importStrategy(json: string): Genome | null {
  try {
    const data = JSON.parse(json);
    if (!data.genome || !Array.isArray(data.genome.elements)) return null;

    const elements: StrategyElement[] = data.genome.elements.map((e: Record<string, unknown>) => ({
      id: String(e.id),
      type: e.type as StrategyElement['type'],
      name: String(e.name),
      description: String(e.description),
      params: Array.isArray(e.params)
        ? e.params.map((p: Record<string, unknown>) => ({
            name: String(p.name),
            value: typeof p.value === 'number' ? p.value : Number(p.value),
          }))
        : undefined,
    }));

    // Validate element types
    const validTypes: StrategyElement['type'][] = ['entry', 'exit', 'filter', 'risk'];
    if (!elements.every((e) => validTypes.includes(e.type))) return null;

    return {
      id: String(data.genome.id || genId('imported')),
      generation: Number(data.genome.generation) || 0,
      fitness: Number(data.genome.fitness) || 0,
      elements,
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════
   Strategy Marketplace
   策略市场：保存/加载/分享/评分排行榜
   ═══════════════════════════════════════════════ */

const STORAGE_KEY_STRATEGIES = 'quant_lab_strategy_marketplace';
const STORAGE_KEY_USAGE = 'quant_lab_api_usage';
const MAX_SAVED_STRATEGIES = 50;

/** 策略市场条目 */
export interface StrategyMarketplaceItem {
  id: string;
  name: string;
  description: string;
  genome: Genome;
  backtestResult: BacktestMetrics;
  score: number;           // 综合评分 (0-100)
  scoreBreakdown: {        // 评分细项
    returnScore: number;     // 收益评分
    riskScore: number;       // 风险评分
    stabilityScore: number;  // 稳定性评分
    efficiencyScore: number; // 效率评分
  };
  tags: string[];          // 标签（如 ["趋势跟踪", "低回撤"]）
  createdAt: string;
  updatedAt: string;
  isShared: boolean;       // 是否已分享
  importedFrom?: string;   // 导入来源标识
}

/** 策略排行榜项 */
export interface StrategyLeaderboardItem {
  rank: number;
  strategyId: string;
  name: string;
  score: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  creator: 'system' | 'user' | 'imported';
  createdAt: string;
}

/**
 * 计算策略综合评分 (0-100)
 * 基于收益、风险、稳定性、效率四个维度
 */
export function calculateStrategyScore(metrics: BacktestMetrics): StrategyMarketplaceItem['scoreBreakdown'] {
  // 收益评分 (0-25): 基于年化收益和总收益
  const returnScore = Math.min(25, Math.max(0,
    metrics.annualizedReturn > 0
      ? 10 + metrics.annualizedReturn * 0.5
      : metrics.annualizedReturn * 0.3 + 10
  ));

  // 风险评分 (0-25): 基于最大回撤和波动率
  const riskScore = Math.min(25, Math.max(0,
    25 - Math.abs(metrics.maxDrawdown) * 0.8 - metrics.volatility * 0.3
  ));

  // 稳定性评分 (0-25): 基于夏普比率和胜率
  const stabilityScore = Math.min(25, Math.max(0,
    metrics.sharpeRatio * 8 + metrics.winRate * 0.15
  ));

  // 效率评分 (0-25): 基于交易次数和持仓天数
  const efficiencyScore = Math.min(25, Math.max(0,
    metrics.totalTrades > 0
      ? 15 - Math.abs(metrics.avgHoldDays - 5) * 1.5 + Math.min(10, metrics.totalTrades * 0.2)
      : 5
  ));

  return {
    returnScore: Math.round(returnScore * 10) / 10,
    riskScore: Math.round(riskScore * 10) / 10,
    stabilityScore: Math.round(stabilityScore * 10) / 10,
    efficiencyScore: Math.round(efficiencyScore * 10) / 10,
  };
}

/**
 * 保存策略到本地策略市场
 */
export async function saveStrategyToMarketplace(
  item: Omit<StrategyMarketplaceItem, 'id' | 'score' | 'scoreBreakdown' | 'createdAt' | 'updatedAt'>
): Promise<StrategyMarketplaceItem> {
  const scoreBreakdown = calculateStrategyScore(item.backtestResult);
  const score = Math.round(
    (scoreBreakdown.returnScore + scoreBreakdown.riskScore +
     scoreBreakdown.stabilityScore + scoreBreakdown.efficiencyScore) * 10
  ) / 10;

  const newItem: StrategyMarketplaceItem = {
    ...item,
    id: genId('strategy'),
    score,
    scoreBreakdown,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const existing = getMarketplaceStrategies();
  existing.unshift(newItem); // 新策略放在最前面

  // 限制数量
  if (existing.length > MAX_SAVED_STRATEGIES) {
    existing.splice(MAX_SAVED_STRATEGIES);
  }

  localStorage.setItem(STORAGE_KEY_STRATEGIES, JSON.stringify(existing));
  return newItem;
}

/**
 * 从本地策略市场加载所有策略
 */
export function getMarketplaceStrategies(): StrategyMarketplaceItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STRATEGIES);
    if (!raw) return [];
    return JSON.parse(raw) as StrategyMarketplaceItem[];
  } catch {
    return [];
  }
}

/**
 * 删除策略市场中的策略
 */
export function deleteMarketplaceStrategy(id: string): boolean {
  const existing = getMarketplaceStrategies();
  const filtered = existing.filter((s) => s.id !== id);
  if (filtered.length === existing.length) return false;
  localStorage.setItem(STORAGE_KEY_STRATEGIES, JSON.stringify(filtered));
  return true;
}

/**
 * 分享策略（导出为JSON字符串，包含完整的市场条目信息）
 */
export function shareStrategy(item: StrategyMarketplaceItem): string {
  const shareData = {
    version: '2.0',
    type: 'strategy_marketplace_item',
    sharedAt: new Date().toISOString(),
    item: {
      ...item,
      isShared: true,
    },
  };
  return JSON.stringify(shareData, null, 2);
}

/**
 * 从分享的JSON导入策略
 */
export function importSharedStrategy(json: string): StrategyMarketplaceItem | null {
  try {
    const data = JSON.parse(json);
    if (data.type !== 'strategy_marketplace_item' || !data.item) return null;
    const item = data.item as StrategyMarketplaceItem;
    item.id = genId('imported');
    item.importedFrom = data.sharedAt;
    item.isShared = false;
    item.createdAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();
    return item;
  } catch {
    return null;
  }
}

/**
 * 获取策略排行榜（按综合评分排序）
 */
export function getStrategyLeaderboard(): StrategyLeaderboardItem[] {
  const strategies = getMarketplaceStrategies();
  const items: StrategyLeaderboardItem[] = strategies.map((s) => ({
    rank: 0, // 稍后计算
    strategyId: s.id,
    name: s.name,
    score: s.score,
    totalReturn: s.backtestResult.totalReturn,
    sharpeRatio: s.backtestResult.sharpeRatio,
    maxDrawdown: s.backtestResult.maxDrawdown,
    winRate: s.backtestResult.winRate,
    creator: s.importedFrom ? 'imported' : 'user',
    createdAt: s.createdAt,
  }));

  // 按评分降序排序
  items.sort((a, b) => b.score - a.score);

  // 计算排名
  items.forEach((item, idx) => { item.rank = idx + 1; });

  return items;
}

/**
 * 生成策略标签（基于回测表现自动分类）
 */
export function autoTagStrategy(metrics: BacktestMetrics): string[] {
  const tags: string[] = [];

  if (metrics.totalReturn > 50) tags.push('高收益');
  else if (metrics.totalReturn < 0) tags.push('亏损策略');

  if (Math.abs(metrics.maxDrawdown) < 10) tags.push('低回撤');
  else if (Math.abs(metrics.maxDrawdown) > 30) tags.push('高波动');

  if (metrics.sharpeRatio > 1.5) tags.push('高质量');
  else if (metrics.sharpeRatio < 0) tags.push('低质量');

  if (metrics.winRate > 60) tags.push('高胜率');
  else if (metrics.winRate < 40) tags.push('低胜率');

  if (metrics.avgHoldDays < 3) tags.push('超短线');
  else if (metrics.avgHoldDays < 7) tags.push('短线');
  else if (metrics.avgHoldDays < 20) tags.push('波段');
  else tags.push('中长线');

  if (metrics.totalTrades > 50) tags.push('高频交易');
  else if (metrics.totalTrades < 10) tags.push('低频交易');

  return tags;
}

/* ═══════════════════════════════════════════════
   Enhanced API Key Management
   API Key 管理优化：有效性检测/多Provider/用量统计
   ═══════════════════════════════════════════════ */

export interface APIKeyStatus {
  provider: APIKeyConfig['provider'];
  isValid: boolean;
  lastValidated: string | null;
  model: string;
  usageStats: APIUsageStats;
}

export interface APIUsageStats {
  totalRequests: number;      // 总请求次数
  totalTokens: number;        // 总token消耗（估算）
  totalErrors: number;        // 错误次数
  lastUsed: string | null;    // 最后使用时间
  dailyRequests: number;      // 本日请求数
  dailyResetAt: string;       // 每日计数重置时间
}

const DEFAULT_USAGE: APIUsageStats = {
  totalRequests: 0,
  totalTokens: 0,
  totalErrors: 0,
  lastUsed: null,
  dailyRequests: 0,
  dailyResetAt: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
};

/**
 * 获取API用量统计
 */
export function getAPIUsageStats(): APIUsageStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USAGE);
    if (!raw) return { ...DEFAULT_USAGE };
    const stats = JSON.parse(raw) as APIUsageStats;

    // 检查是否需要重置日计数
    const today = new Date().toISOString().slice(0, 10);
    if (stats.dailyResetAt !== today) {
      stats.dailyRequests = 0;
      stats.dailyResetAt = today;
    }

    return stats;
  } catch {
    return { ...DEFAULT_USAGE };
  }
}

/**
 * 记录API请求（更新用量统计）
 */
export function recordAPIRequest(tokenCount: number = 0, isError: boolean = false): void {
  const stats = getAPIUsageStats();
  stats.totalRequests++;
  stats.totalTokens += tokenCount;
  if (isError) stats.totalErrors++;
  stats.lastUsed = new Date().toISOString();

  // 检查日计数
  const today = new Date().toISOString().slice(0, 10);
  if (stats.dailyResetAt !== today) {
    stats.dailyRequests = 1;
    stats.dailyResetAt = today;
  } else {
    stats.dailyRequests++;
  }

  localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(stats));
}

/**
 * 重置API用量统计
 */
export function resetAPIUsageStats(): void {
  localStorage.removeItem(STORAGE_KEY_USAGE);
}

/**
 * 检测API Key有效性并返回详细状态
 */
export async function checkAPIKeyStatus(config: APIKeyConfig): Promise<APIKeyStatus> {
  const startTime = performance.now();
  let isValid = false;

  try {
    isValid = await validateAPIKey(config);
    recordAPIRequest(2, !isValid); // 估算2个token
  } catch {
    isValid = false;
    recordAPIRequest(0, true);
  }

  const elapsed = Math.round(performance.now() - startTime);

  return {
    provider: config.provider,
    isValid,
    lastValidated: new Date().toISOString(),
    model: config.model,
    usageStats: getAPIUsageStats(),
  };
}

/**
 * 获取所有Provider的默认模型列表
 */
export function getProviderModels(): Record<APIKeyConfig['provider'], { models: string[]; defaultModel: string; label: string }> {
  return {
    openai: {
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o-mini',
      label: 'OpenAI',
    },
    deepseek: {
      models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      label: 'DeepSeek',
    },
    anthropic: {
      models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
      defaultModel: 'claude-3-haiku-20240307',
      label: 'Anthropic',
    },
    custom: {
      models: ['default'],
      defaultModel: 'default',
      label: '自定义',
    },
  };
}

/* ═══════════════════════════════════════════════
   Enhanced Evolution Report
   进化报告增强：可视化数据/最佳策略对比/参数敏感性
   ═══════════════════════════════════════════════ */

export interface EvolutionVisualizationData {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  diversity: number;
  bestGenomeId: string;
}

export interface StrategyComparisonItem {
  id: string;
  name: string;
  generation: number;
  fitness: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  elementCount: number;
  entryElements: string[];
  exitElements: string[];
  filterElements: string[];
  riskElements: string[];
}

export interface ParameterSensitivityItem {
  parameter: string;       // 参数名称
  elementName: string;     // 所属元素
  minValue: number;
  maxValue: number;
  currentValue: number;
  sensitivity: number;     // 敏感性得分 (0-100)，越高表示该参数对策略影响越大
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 生成进化过程可视化数据
 */
export function generateEvolutionVisualization(result: EvolutionResult): EvolutionVisualizationData[] {
  return result.stats.bestFitnessPerGen.map((best, i) => ({
    generation: i + 1,
    bestFitness: Math.round(best * 10) / 10,
    avgFitness: Math.round(result.stats.avgFitnessPerGen[i] * 10) / 10,
    diversity: Math.round(result.stats.diversityPerGen[i] * 100) / 100,
    bestGenomeId: result.generations[i]?.[0]?.id || '',
  }));
}

/**
 * 生成最佳策略对比数据
 * 对比所有代中的top 5策略
 */
export function generateStrategyComparison(result: EvolutionResult): StrategyComparisonItem[] {
  const bestPerGen: Genome[] = [];

  for (let i = 0; i < result.generations.length; i++) {
    const gen = result.generations[i];
    if (gen && gen.length > 0) {
      // 找出每一代中 fitness 最高的（去重）
      const best = gen.reduce((max, g) => g.fitness > max.fitness ? g : max, gen[0]);
      // 只有当与上一个不同才加入
      if (bestPerGen.length === 0 || best.id !== bestPerGen[bestPerGen.length - 1].id) {
        bestPerGen.push(best);
      }
    }
  }

  // 按 fitness 排序取前5
  const top5 = [...bestPerGen]
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, 5);

  return top5.map((g) => ({
    id: g.id,
    name: `Gen${g.generation}_${g.elements.filter((e) => e.type === 'entry').map((e) => e.name).join('+')}`,
    generation: g.generation,
    fitness: Math.round(g.fitness * 10) / 10,
    totalReturn: 0, // 需要额外回测计算
    sharpeRatio: 0,
    maxDrawdown: 0,
    winRate: 0,
    elementCount: g.elements.length,
    entryElements: g.elements.filter((e) => e.type === 'entry').map((e) => e.name),
    exitElements: g.elements.filter((e) => e.type === 'exit').map((e) => e.name),
    filterElements: g.elements.filter((e) => e.type === 'filter').map((e) => e.name),
    riskElements: g.elements.filter((e) => e.type === 'risk').map((e) => e.name),
  }));
}

/**
 * 计算参数敏感性分析
 * 通过轻微扰动参数，观察fitness变化来评估参数敏感性
 */
export function calculateParameterSensitivity(
  genome: Genome,
  klines: KLineData[],
  perturbationPct: number = 0.1 // 扰动比例 10%
): ParameterSensitivityItem[] {
  const baseFitness = evaluateFitness(genome, klines);
  const results: ParameterSensitivityItem[] = [];

  for (const element of genome.elements) {
    if (!element.params || element.params.length === 0) continue;

    for (const param of element.params) {
      if (param.min === undefined || param.max === undefined || param.step === undefined) continue;

      const currentValue = Number(param.value ?? param.min);
      const minVal = Number(param.min);
      const maxVal = Number(param.max);
      const range = maxVal - minVal;
      const perturbation = range * perturbationPct;

      // 正向扰动
      const perturbedUp = Math.min(maxVal, currentValue + perturbation);
      // 负向扰动
      const perturbedDown = Math.max(minVal, currentValue - perturbation);

      // 测试正向扰动
      const fitnessUp = testParamChange(genome, element.id, param.name, perturbedUp, klines);
      // 测试负向扰动
      const fitnessDown = testParamChange(genome, element.id, param.name, perturbedDown, klines);

      // 计算敏感性：扰动前后fitness变化的平均值
      const avgChange = (Math.abs(fitnessUp - baseFitness) + Math.abs(fitnessDown - baseFitness)) / 2;
      const sensitivity = Math.min(100, avgChange * 10); // 放大并限制在100以内

      let impact: ParameterSensitivityItem['impact'] = 'LOW';
      if (sensitivity > 30) impact = 'HIGH';
      else if (sensitivity > 10) impact = 'MEDIUM';

      results.push({
        parameter: param.name,
        elementName: element.name,
        minValue: param.min,
        maxValue: param.max,
        currentValue,
        sensitivity: Math.round(sensitivity * 10) / 10,
        impact,
      });
    }
  }

  // 按敏感性降序排列
  results.sort((a, b) => b.sensitivity - a.sensitivity);
  return results;
}



/** 测试改变某个参数后的fitness */
function testParamChange(
  genome: Genome,
  elementId: string,
  paramName: string,
  newValue: number,
  klines: KLineData[]
): number {
  const testElements = genome.elements.map((e) => {
    const cloned = cloneElement(e);
    if (cloned.id === elementId && cloned.params) {
      const param = cloned.params.find((p) => p.name === paramName);
      if (param) param.value = newValue;
    }
    return cloned;
  });

  if (klines.length < 30) return 0;
  return scoreCombination(klines, { elements: testElements });
}

/**
 * 生成增强版进化报告
 */
export async function generateEnhancedEvolutionReport(
  result: EvolutionResult,
  bestMetrics: BacktestMetrics,
  klines: KLineData[],
  apiConfig?: APIKeyConfig | null
): Promise<{
  basic: StrategyReport;
  visualizationData: EvolutionVisualizationData[];
  comparison: StrategyComparisonItem[];
  sensitivity: ParameterSensitivityItem[];
}> {
  // 基础报告
  const basic = await generateStrategyReport(result.bestGenome, bestMetrics, apiConfig);

  // 可视化数据
  const visualizationData = generateEvolutionVisualization(result);

  // 策略对比
  const comparison = generateStrategyComparison(result);

  // 参数敏感性（需要 K 线数据）
  let sensitivity: ParameterSensitivityItem[] = [];
  if (klines.length >= 60) {
    sensitivity = calculateParameterSensitivity(result.bestGenome, klines);
  }

  return {
    basic,
    visualizationData,
    comparison,
    sensitivity,
  };
}

/* ═══════════════════════════════════════════════
   Evolution Visualization Data
   ═══════════════════════════════════════════════ */

export function generateEvolutionMarkdownReport(
  result: EvolutionResult,
  metrics: BacktestMetrics
): string {
  const g = result.bestGenome;
  const entries = g.elements.filter((e) => e.type === 'entry');
  const exits = g.elements.filter((e) => e.type === 'exit');
  const filters = g.elements.filter((e) => e.type === 'filter');
  const risks = g.elements.filter((e) => e.type === 'risk');

  let md = `# 策略进化报告

## 最优策略概要

- **适应度**: ${g.fitness.toFixed(1)}
- **进化代数**: ${g.generation}
- **总交易次数**: ${metrics.totalTrades}
- **胜率**: ${metrics.winRate}%
- **总收益率**: ${metrics.totalReturn}%
- **最大回撤**: ${metrics.maxDrawdown}%
- **夏普比率**: ${metrics.sharpeRatio}
- **平均持仓天数**: ${metrics.avgHoldDays}

## 入场信号 (${entries.length})

${entries.map((e) => {
      const ps = e.params ? ' (' + e.params.map((p) => p.name + '=' + p.value).join(', ') + ')' : '';
      return '- ' + e.name + ps;
    }).join('\n')}

## 出场信号 (${exits.length})

${exits.map((e) => {
      const ps = e.params ? ' (' + e.params.map((p) => p.name + '=' + p.value).join(', ') + ')' : '';
      return '- ' + e.name + ps;
    }).join('\n')}

## 过滤器 (${filters.length})

${filters.length > 0 ? filters.map((e) => `- ${e.name}`).join('\n') : '无'}

## 风控规则 (${risks.length})

${risks.length > 0 ? risks.map((e) => {
      const ps = e.params ? ' (' + e.params.map((p) => p.name + '=' + p.value).join(', ') + ')' : '';
      return '- ' + e.name + ps;
    }).join('\n') : '无'}

`;

  if (result.walkForward) {
    md += `## Walk-Forward 验证

- **训练集适应度**: ${result.walkForward.trainFitness}
- **测试集适应度**: ${result.walkForward.testFitness}
- **过拟合度**: ${(result.walkForward.overfitRatio * 100).toFixed(1)}%
- **是否过拟合**: ${result.walkForward.isOverfitted ? '⚠️ 是' : '✅ 否'}

`;
  }

  if (result.earlyStopReason) {
    const reasons: Record<string, string> = {
      target: '达到目标适应度',
      stagnation: '连续多代无改进',
      low_diversity: '种群多样性过低',
      overfitting: '检测到过拟合',
    };
    md += `## 早停信息

- **早停原因**: ${reasons[result.earlyStopReason] || result.earlyStopReason}

`;
  }

  md += `---
*报告生成时间: ${new Date().toLocaleString('zh-CN')}*
`;

  return md;
}
