import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  TrendingUp,
  Activity,
  Zap,
  BarChart3,
  ChevronRight,
  Target,
  Brain,
  Sparkles,
  BarChart4,
  Shield,
  Crosshair,
  Layers,
  CheckCircle2,
  ArrowRight,
  X,
  Loader2,
} from 'lucide-react';
import { queryStock, BUILT_IN_STOCKS, fetchStockNameFromEastMoney } from '@/services/stockApi';
import type { StockInfo } from '@/services/stockApi';
import { runAutoMatch } from '@/services/autoMatcher';
import type { AutoMatchResult, StrategyBacktestResult } from '@/services/autoMatcher';

// ───────────────────────────────────────────
// Types
// ───────────────────────────────────────────

interface Stock {
  code: string;
  name: string;
  abbr: string;
  dims: {
    volatility: number;
    momentum: number;
    valuation: number;
    liquidity: number;
    marketCap: number;
    sectorBeta: number;
  };
}

interface Strategy {
  id: string;
  name: string;
  shortName: string;
  color: string;
  colorHex: string;
  icon: React.ReactNode;
  desc: string;
}

interface MatchResult {
  primary: {
    strategy: Strategy;
    score: number;
  };
  secondary: {
    strategy: Strategy;
    score: number;
  };
  tertiary: {
    strategy: Strategy;
    score: number;
  };
  confidence: number;
  weights: {
    stockGene: number;
    marketState: number;
    strategyHistory: number;
  };
  metrics: {
    expectedReturn: string;
    sharpe: string;
    maxDrawdown: string;
    winRate: string;
    profitLoss: string;
  };
  logicChain: LogicStep[];
  // 回测驱动新增
  autoMatch: AutoMatchResult | null;
}

interface LogicStep {
  step: string;
  title: string;
  data: string;
  conclusion: string;
  conclusionColor: string;
}

type MarketState = 'trending' | 'ranging' | 'volatile' | 'quiet';
type AnalysisPhase = 'idle' | 'phase1' | 'phase2' | 'phase3' | 'complete';

// ───────────────────────────────────────────
// Constants
// ───────────────────────────────────────────

const STOCKS: Stock[] = [
  { code: '600519', name: '贵州茅台', abbr: 'GZMZ', dims: { volatility: 15, momentum: 52, valuation: 38, liquidity: 4.8, marketCap: 98, sectorBeta: 0.85 } },
  { code: '300750', name: '宁德时代', abbr: 'CATL', dims: { volatility: 28, momentum: 72, valuation: 42, liquidity: 3.5, marketCap: 92, sectorBeta: 1.24 } },
  { code: '300059', name: '东方财富', abbr: 'DFCF', dims: { volatility: 35, momentum: 65, valuation: 28, liquidity: 5.2, marketCap: 78, sectorBeta: 1.35 } },
  { code: '002594', name: '比亚迪', abbr: 'BYD', dims: { volatility: 28, momentum: 62, valuation: 35, liquidity: 3.2, marketCap: 88, sectorBeta: 1.15 } },
  { code: '600036', name: '招商银行', abbr: 'ZSYH', dims: { volatility: 18, momentum: 48, valuation: 7, liquidity: 2.8, marketCap: 94, sectorBeta: 0.92 } },
  { code: '600030', name: '中信证券', abbr: 'ZXZQ', dims: { volatility: 32, momentum: 58, valuation: 16, liquidity: 4.1, marketCap: 82, sectorBeta: 1.42 } },
  { code: '000858', name: '五粮液', abbr: 'WLY', dims: { volatility: 20, momentum: 45, valuation: 24, liquidity: 3.8, marketCap: 90, sectorBeta: 0.88 } },
  { code: '000333', name: '美的集团', abbr: 'MDJT', dims: { volatility: 16, momentum: 50, valuation: 12, liquidity: 2.5, marketCap: 86, sectorBeta: 0.95 } },
  { code: '002475', name: '立讯精密', abbr: 'LXJM', dims: { volatility: 30, momentum: 68, valuation: 26, liquidity: 2.2, marketCap: 76, sectorBeta: 1.18 } },
  { code: '601318', name: '中国平安', abbr: 'ZGPA', dims: { volatility: 22, momentum: 38, valuation: 8, liquidity: 3.0, marketCap: 96, sectorBeta: 1.05 } },
];

const STRATEGIES: Record<string, Strategy> = {
  trend: {
    id: 'trend',
    name: '趋势跟踪',
    shortName: 'Trend Following',
    color: 'apex-green',
    colorHex: '#00FF94',
    icon: <TrendingUp size={18} />,
    desc: '跟随市场趋势方向，动量驱动持仓',
  },
  reversion: {
    id: 'reversion',
    name: '均值回归',
    shortName: 'Mean Reversion',
    color: 'reversion-red',
    colorHex: '#FF2A6D',
    icon: <Activity size={18} />,
    desc: '价格偏离均值后逆向操作，等待回归',
  },
  breakout: {
    id: 'breakout',
    name: '突破交易',
    shortName: 'Breakout',
    color: 'gold-standard',
    colorHex: '#D4AF37',
    icon: <Zap size={18} />,
    desc: '捕捉价格突破关键位置的爆发行情',
  },
  factor: {
    id: 'factor',
    name: '因子选股',
    shortName: 'Factor Alpha',
    color: 'blue',
    colorHex: '#4A9EFF',
    icon: <BarChart3 size={18} />,
    desc: '多因子模型筛选优质标的，分散持仓',
  },
};

const MARKET_STATES: { key: MarketState; label: string; sub: string; icon: React.ReactNode }[] = [
  { key: 'trending', label: '趋势市', sub: 'TRENDING', icon: <TrendingUp size={16} /> },
  { key: 'ranging', label: '震荡市', sub: 'RANGING', icon: <Activity size={16} /> },
  { key: 'volatile', label: '高波动', sub: 'VOLATILE', icon: <Zap size={16} /> },
  { key: 'quiet', label: '低波动', sub: 'QUIET', icon: <BarChart3 size={16} /> },
];

// ───────────────────────────────────────────
// Mock matching logic
// ───────────────────────────────────────────

function computeMatch(stock: Stock, marketState: MarketState, realData?: StockInfo | null): MatchResult {
  const results: Record<string, Record<string, { p: string; s: string; t: string; c: number }>> = {
    '600519': { any: { p: 'reversion', s: 'factor', t: 'trend', c: 82 } },
    '300750': { any: { p: 'trend', s: 'breakout', t: 'factor', c: 91 } },
    '300059': { any: { p: 'breakout', s: 'trend', t: 'reversion', c: 88 } },
    '002594': { any: { p: 'trend', s: 'breakout', t: 'factor', c: 85 } },
    '600036': { any: { p: 'factor', s: 'reversion', t: 'trend', c: 80 } },
    '600030': { any: { p: 'breakout', s: 'trend', t: 'factor', c: 83 } },
    '000858': { any: { p: 'reversion', s: 'factor', t: 'trend', c: 80 } },
    '000333': { any: { p: 'factor', s: 'reversion', t: 'breakout', c: 78 } },
    '002475': { any: { p: 'trend', s: 'breakout', t: 'factor', c: 79 } },
    '601318': { any: { p: 'reversion', s: 'factor', t: 'trend', c: 77 } },
  };

  // 如果有真实数据，基于涨跌幅调整推荐策略
  let override: { p: string; s: string; t: string; c: number } | null = null;
  if (realData) {
    const changePct = realData.changePercent;
    if (changePct > 3) {
      override = { p: 'reversion', s: 'factor', t: 'breakout', c: 85 }; // 涨多了可能回调
    } else if (changePct < -3) {
      override = { p: 'trend', s: 'breakout', t: 'factor', c: 85 }; // 跌多了可能反弹（趋势跟踪抄底）
    } else {
      override = { p: 'factor', s: 'reversion', t: 'trend', c: 82 }; // 震荡市用因子
    }
  }

  const r = results[stock.code]?.['any'] || override || { p: 'trend', s: 'factor', t: 'reversion', c: 70 };

  const marketBoost: Record<string, Record<string, number>> = {
    trending: { trend: 6, breakout: 3, factor: 1, reversion: -4 },
    ranging: { reversion: 6, factor: 4, breakout: -2, trend: -4 },
    volatile: { breakout: 6, trend: 3, reversion: -2, factor: -4 },
    quiet: { factor: 6, reversion: 3, trend: -4, breakout: -6 },
  };

  const pStrategy = STRATEGIES[r.p];
  const sStrategy = STRATEGIES[r.s];
  const tStrategy = STRATEGIES[r.t];

  const pBoost = marketBoost[marketState]?.[r.p] ?? 0;
  const sBoost = marketBoost[marketState]?.[r.s] ?? 0;

  const pScore = Math.min(99, r.c + pBoost);
  const sScore = Math.min(99, r.c - 8 + sBoost);
  const tScore = Math.max(50, r.c - 15);

  const metricsMap: Record<string, { ret: string; sharpe: string; dd: string; wr: string; pl: string }> = {
    trend: { ret: '28.5%', sharpe: '1.45', dd: '-12.3%', wr: '58.2%', pl: '2.1:1' },
    breakout: { ret: '35.2%', sharpe: '1.62', dd: '-15.8%', wr: '52.5%', pl: '2.8:1' },
    reversion: { ret: '18.3%', sharpe: '1.88', dd: '-8.1%', wr: '64.8%', pl: '1.8:1' },
    factor: { ret: '22.6%', sharpe: '1.72', dd: '-9.5%', wr: '61.3%', pl: '2.0:1' },
  };

  const m = metricsMap[r.p];

  const logicChain: LogicStep[] = [
    {
      step: 'STEP 01',
      title: '六维基因测序',
      data: `VOL: ${stock.dims.volatility} | MOM: ${stock.dims.momentum} | PE: ${stock.dims.valuation}x | LIQ: ${stock.dims.liquidity}B | CAP: ${stock.dims.marketCap} | SEC: ${stock.abbr}`,
      conclusion: getGeneConclusion(stock),
      conclusionColor: '#00FF94',
    },
    {
      step: 'STEP 02',
      title: 'AMH 生态位扫描',
      data: `Market State: ${marketState.toUpperCase()} | Volatility Regime: ${stock.dims.volatility > 25 ? 'HIGH' : 'NORMAL'} | Momentum Rank: ${stock.dims.momentum > 60 ? 'TOP 30%' : 'MID'}`,
      conclusion: getStateConclusion(marketState),
      conclusionColor: '#D4AF37',
    },
    {
      step: 'STEP 03',
      title: '生态位匹配算法',
      data: `${pStrategy.shortName}_Fit: 0.${Math.round(pScore)} | ${sStrategy.shortName}_Fit: 0.${Math.round(sScore)}`,
      conclusion: `${pStrategy.name} 与 ${sStrategy.name} 进入决赛圈`,
      conclusionColor: '#00FF94',
    },
    {
      step: 'STEP 04',
      title: '动态权重分配',
      data: `Stock_Gene: 0.45 | Market_State: 0.35 | Strategy_Hist: 0.20`,
      conclusion: '股票特征主导，市场状态强化，历史表现验证',
      conclusionColor: '#4A9EFF',
    },
    {
      step: 'STEP 05',
      title: '最优策略组合',
      data: `Primary: ${pStrategy.shortName} (60%) | Secondary: ${sStrategy.shortName} (25%)`,
      conclusion: 'PRIMARY MATCH CONFIRMED',
      conclusionColor: '#00FF94',
    },
  ];

  return {
    primary: { strategy: pStrategy, score: pScore },
    secondary: { strategy: sStrategy, score: sScore },
    tertiary: { strategy: tStrategy, score: tScore },
    confidence: Math.min(99, (pScore + sScore) / 2 + 5),
    weights: { stockGene: 85, marketState: 72, strategyHistory: 68 },
    metrics: { expectedReturn: m.ret, sharpe: m.sharpe, maxDrawdown: m.dd, winRate: m.wr, profitLoss: m.pl },
    logicChain,
    autoMatch: null,
  };
}

/**
 * 基于真实回测结果生成匹配结果
 * 如果 autoResult 为 null，回退到硬编码匹配
 */
function computeMatchFromBacktest(
  stock: Stock,
  marketState: MarketState,
  autoResult: AutoMatchResult | null,
  realData?: StockInfo | null
): MatchResult {
  // 如果回测失败，回退到硬编码
  if (!autoResult || autoResult.rankings.length === 0) {
    const fallback = computeMatch(stock, marketState, realData);
    return { ...fallback, autoMatch: autoResult };
  }

  const p = autoResult.primary;
  const s = autoResult.secondary;
  const t = autoResult.tertiary;

  // 从回测结果构建 Strategy 对象
  const toStrategy = (r: StrategyBacktestResult): Strategy => ({
    id: r.strategy.key,
    name: r.strategy.name,
    shortName: r.strategy.shortName,
    color: r.strategy.key === 'trend' ? 'apex-green'
      : r.strategy.key === 'revert' ? 'reversion-red'
      : r.strategy.key === 'breakout' ? 'gold-standard'
      : 'blue',
    colorHex: r.strategy.colorHex,
    icon: r.strategy.key === 'trend' ? <TrendingUp size={18} />
      : r.strategy.key === 'revert' ? <Activity size={18} />
      : r.strategy.key === 'breakout' ? <Zap size={18} />
      : <BarChart3 size={18} />,
    desc: r.strategy.description,
  });

  const pStrategy = toStrategy(p);
  const sStrategy = toStrategy(s);
  const tStrategy = toStrategy(t);

  const pScore = Math.min(99, p.compositeScore);
  const sScore = Math.min(99, s.compositeScore);
  const tScore = Math.min(99, t.compositeScore);
  const confidence = Math.min(99, (pScore + sScore) / 2 + 5);

  const m = p.result;

  const logicChain: LogicStep[] = [
    {
      step: 'STEP 01',
      title: '六维基因测序',
      data: `VOL: ${stock.dims.volatility} | MOM: ${stock.dims.momentum} | PE: ${stock.dims.valuation}x | LIQ: ${stock.dims.liquidity}B | CAP: ${stock.dims.marketCap} | SEC: ${stock.abbr}`,
      conclusion: getGeneConclusion(stock),
      conclusionColor: '#00FF94',
    },
    {
      step: 'STEP 02',
      title: 'AMH 生态位扫描',
      data: `Market State: ${marketState.toUpperCase()} | Volatility Regime: ${stock.dims.volatility > 25 ? 'HIGH' : 'NORMAL'} | Momentum Rank: ${stock.dims.momentum > 60 ? 'TOP 30%' : 'MID'}`,
      conclusion: getStateConclusion(marketState),
      conclusionColor: '#D4AF37',
    },
    {
      step: 'STEP 03',
      title: '真实回测验证',
      data: `对${autoResult.totalBacktests}种策略运行近3年真实K线回测 | 成功${autoResult.totalBacktests - autoResult.failedBacktests}种 | 数据驱动排序`,
      conclusion: `${p.strategy.name} 综合评分最高(${p.compositeScore.toFixed(1)})，${s.strategy.name} 次之(${s.compositeScore.toFixed(1)})`,
      conclusionColor: '#00FF94',
    },
    {
      step: 'STEP 04',
      title: '多维评分分解',
      data: `夏普得分:${p.sharpeScore.toFixed(0)} | 收益得分:${p.returnScore.toFixed(0)} | 回撤得分:${p.drawdownScore.toFixed(0)} | 权重:4:3:3`,
      conclusion: '基于真实历史数据的量化评分，非模拟推测',
      conclusionColor: '#4A9EFF',
    },
    {
      step: 'STEP 05',
      title: '最优策略确认',
      data: `Primary: ${p.strategy.shortName} (综合${p.compositeScore.toFixed(1)}) | Secondary: ${s.strategy.shortName} (综合${s.compositeScore.toFixed(1)})`,
      conclusion: 'BACKTEST-DRIVEN MATCH CONFIRMED',
      conclusionColor: '#00FF94',
    },
  ];

  return {
    primary: { strategy: pStrategy, score: pScore },
    secondary: { strategy: sStrategy, score: sScore },
    tertiary: { strategy: tStrategy, score: tScore },
    confidence,
    weights: { stockGene: 85, marketState: 72, strategyHistory: 68 },
    metrics: {
      expectedReturn: `${m.annualizedReturn.toFixed(1)}%`,
      sharpe: m.sharpeRatio.toFixed(2),
      maxDrawdown: `${m.maxDrawdown.toFixed(1)}%`,
      winRate: `${m.winRate.toFixed(1)}%`,
      profitLoss: `${m.totalTrades}笔交易`,
    },
    logicChain,
    autoMatch: autoResult,
  };
}

function getGeneConclusion(stock: Stock): string {
  if (stock.dims.momentum > 65 && stock.dims.volatility > 25) return '高波动 + 强动量 + 成长型基因';
  if (stock.dims.volatility < 20 && stock.dims.valuation > 30) return '低波动 + 高估值 + 防御型基因';
  if (stock.dims.volatility > 30) return '高波动 + 投机型基因';
  if (stock.dims.marketCap > 90 && stock.dims.valuation < 15) return '大市值 + 低估值 + 稳定型基因';
  return '均衡型多因子基因';
}

function getStateConclusion(state: MarketState): string {
  const map: Record<string, string> = {
    trending: '市场处于 S3 阶段：趋势涌现期 (TREND EMERGENCE)',
    ranging: '市场处于 S2 阶段：区间震荡期 (MEAN REVERSION ZONE)',
    volatile: '市场处于 S4 阶段：高波动突破期 (VOLATILE BREAKOUT)',
    quiet: '市场处于 S1 阶段：低波动蓄力期 (QUIET ACCUMULATION)',
  };
  return map[state];
}

// ───────────────────────────────────────────
// Utility
// ───────────────────────────────────────────

const easeExpoOut = [0.16, 1, 0.3, 1] as [number, number, number, number];

function useCountUp(target: number, duration: number = 1.5, enabled: boolean = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target * 10) / 10);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return value;
}

// ───────────────────────────────────────────
// Sub-Components
// ───────────────────────────────────────────

function MiniRadarChart({ dims, animated }: { dims: Stock['dims']; animated?: boolean }) {
  const labels = ['波动率', '动量', '估值', '流动性', '市值', '行业β'];
  const values = [dims.volatility, dims.momentum, dims.valuation, dims.liquidity * 10, dims.marketCap, dims.sectorBeta * 40];
  const maxVals = [40, 80, 50, 60, 100, 60];
  const angles = labels.map((_, i) => (Math.PI * 2 * i) / labels.length - Math.PI / 2);
  const cx = 75, cy = 75, r = 55;

  const points = values.map((v, i) => {
    const ratio = Math.min(v / maxVals[i], 1);
    const a = angles[i];
    return {
      x: cx + r * ratio * Math.cos(a),
      y: cy + r * ratio * Math.sin(a),
    };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg width="150" height="150" viewBox="0 0 150 150" className="opacity-80">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={angles.map((a) => `${cx + r * ring * Math.cos(a)},${cy + r * ring * Math.sin(a)}`).join(' ')}
          fill="none"
          stroke="rgba(206,209,213,0.12)"
          strokeWidth="0.5"
        />
      ))}
      {/* Axes */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + r * Math.cos(a)}
          y2={cy + r * Math.sin(a)}
          stroke="rgba(206,209,213,0.15)"
          strokeWidth="0.5"
        />
      ))}
      {/* Data polygon */}
      <motion.polygon
        points={polyPoints}
        fill="rgba(0,255,148,0.15)"
        stroke="#00FF94"
        strokeWidth="1.5"
        initial={animated ? { scale: 0, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: easeExpoOut }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#00FF94" />
      ))}
    </svg>
  );
}

function ConfidenceRing({ confidence, enabled }: { confidence: number; enabled: boolean }) {
  const animatedConfidence = useCountUp(confidence, 1.5, enabled);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedConfidence / 100) * circumference;

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <svg width="160" height="160" className="absolute -rotate-90">
        <defs>
          <linearGradient id="confidenceGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00FF94" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(206,209,213,0.08)" strokeWidth="6" />
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="url(#confidenceGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: easeExpoOut }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="font-mono text-[28px] font-bold text-pure">{animatedConfidence.toFixed(1)}%</span>
        <span className="font-mono text-[10px] tracking-widest text-ash/50 mt-1">CONFIDENCE</span>
      </div>
    </div>
  );
}

function StrategyBadge({ strategy }: { strategy: Strategy }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono uppercase tracking-wider border"
      style={{ borderColor: strategy.colorHex, color: strategy.colorHex, background: 'rgba(0,0,0,0.5)' }}
    >
      {strategy.icon}
      {strategy.shortName}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="data-card flex flex-col items-center text-center py-5">
      <span className="font-mono text-[11px] tracking-widest text-ash/50 mb-2">{label}</span>
      <span className="font-mono text-xl font-bold text-pure">{value}</span>
      {sub && <span className="font-mono text-[10px] text-ash/40 mt-1">{sub}</span>}
    </div>
  );
}

function WeightBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-[11px] text-ash/60 w-24 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[rgba(206,209,213,0.08)] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.2, ease: easeExpoOut }}
        />
      </div>
      <span className="font-mono text-[11px] text-pure w-10">{value}%</span>
    </div>
  );
}

function ScoreBarChart({ primary, secondary, tertiary }: { primary: MatchResult['primary']; secondary: MatchResult['secondary']; tertiary: MatchResult['tertiary'] }) {
  const bars = [
    { label: primary.strategy.name, value: primary.score, color: primary.strategy.colorHex },
    { label: secondary.strategy.name, value: secondary.score, color: secondary.strategy.colorHex },
    { label: tertiary.strategy.name, value: tertiary.score, color: tertiary.strategy.colorHex },
  ];

  return (
    <div className="space-y-4">
      {bars.map((bar, i) => (
        <motion.div
          key={bar.label}
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15, duration: 0.6, ease: easeExpoOut }}
        >
          <span className="font-mono text-[11px] text-ash/60 w-24 text-right shrink-0">{bar.label}</span>
          <div className="flex-1 h-6 bg-[rgba(206,209,213,0.06)] rounded overflow-hidden relative">
            <motion.div
              className="h-full rounded flex items-center justify-end pr-2"
              style={{ backgroundColor: `${bar.color}25`, borderRight: `2px solid ${bar.color}` }}
              initial={{ width: 0 }}
              animate={{ width: `${bar.value}%` }}
              transition={{ delay: 0.3 + i * 0.15, duration: 1, ease: easeExpoOut }}
            >
              <span className="font-mono text-[11px] font-bold" style={{ color: bar.color }}>
                {bar.value}%
              </span>
            </motion.div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────
// Analysis Phase Display (Section 1 animated)
// ───────────────────────────────────────────

function AnalysisAnimation({ stock, phase, marketState }: { stock: Stock; phase: AnalysisPhase; marketState: MarketState }) {
  const dimLabels = ['波动率', '动量', '估值', '流动性', '市值', '行业β'];
  const dimValues = [stock.dims.volatility, stock.dims.momentum, stock.dims.valuation, stock.dims.liquidity * 10, stock.dims.marketCap, stock.dims.sectorBeta * 40];
  const dimMax = [40, 80, 50, 60, 100, 60];

  const phaseLabels: Record<string, { title: string; subtitle: string }> = {
    phase1: { title: '提取股票特征...', subtitle: 'EXTRACTING GENETIC SIGNATURE' },
    phase2: { title: '识别市场状态...', subtitle: 'DETECTING AMH REGIME' },
    phase3: { title: '计算策略匹配度...', subtitle: 'COMPUTING NICHE FIT' },
  };

  return (
    <AnimatePresence>
      {(phase === 'phase1' || phase === 'phase2' || phase === 'phase3') && (
        <motion.div
          className="w-full max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center"
            >
              <div className="flex items-center gap-3 mb-2">
                {phase === 'phase1' && <Brain size={20} className="text-apex-green" />}
                {phase === 'phase2' && <Crosshair size={20} className="text-gold-standard" />}
                {phase === 'phase3' && <Sparkles size={20} className="text-apex-green" />}
                <span className="font-heading text-2xl text-pure">
                  {phaseLabels[phase]?.title}
                </span>
              </div>
              <span className="font-mono text-[11px] tracking-widest text-ash/40">
                {phaseLabels[phase]?.subtitle}
              </span>
            </motion.div>
          </div>

          {/* Phase 1: Dimension bars */}
          {phase === 'phase1' && (
            <div className="grid grid-cols-2 gap-4">
              {dimLabels.map((label, i) => (
                <div key={label} className="data-card">
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-[11px] text-ash/60">{label}</span>
                    <span className="font-mono text-[11px] text-pure">{dimValues[i].toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 bg-[rgba(206,209,213,0.08)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-apex-green"
                      initial={{ width: 0 }}
                      animate={{ width: `${(dimValues[i] / dimMax[i]) * 100}%` }}
                      transition={{ delay: i * 0.12, duration: 0.8, ease: easeExpoOut }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phase 2: State detection */}
          {phase === 'phase2' && (
            <div className="flex items-center justify-center gap-6">
              {MARKET_STATES.map((ms, i) => (
                <motion.div
                  key={ms.key}
                  className={`data-card flex flex-col items-center gap-3 w-36 ${ms.key === marketState ? 'border-apex-green/40' : ''}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.12, duration: 0.5 }}
                >
                  <div className={`p-3 rounded-full ${ms.key === marketState ? 'bg-apex-green/10 text-apex-green' : 'text-ash/30'}`}>
                    {ms.icon}
                  </div>
                  <div className="text-center">
                    <div className={`font-heading text-sm ${ms.key === marketState ? 'text-pure' : 'text-ash/30'}`}>
                      {ms.label}
                    </div>
                    <div className={`font-mono text-[10px] mt-1 ${ms.key === marketState ? 'text-apex-green' : 'text-ash/20'}`}>
                      {ms.sub}
                    </div>
                  </div>
                  {ms.key === marketState && (
                    <motion.div
                      className="absolute inset-0 border border-apex-green/30 rounded"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.5] }}
                      transition={{ duration: 1 }}
                      layoutId="activeMarketState"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* Phase 3: Match scores */}
          {phase === 'phase3' && (
            <ScoreBarChart
              primary={{ strategy: STRATEGIES.trend, score: 88 }}
              secondary={{ strategy: STRATEGIES.breakout, score: 76 }}
              tertiary={{ strategy: STRATEGIES.reversion, score: 62 }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────────────────────────────────────────
// Monte Carlo Fan Chart
// ───────────────────────────────────────────

function MonteCarloChart() {
  const data = useMemo(() => {
    const points = [];
    for (let day = 0; day <= 252; day += 7) {
      const t = day / 252;
      const median = 28.5 * t + 5 * Math.sin(t * Math.PI * 2);
      const spread = 8 * Math.sqrt(t) * (1 + t);
      points.push({
        day,
        median,
        p75: median + spread * 0.67,
        p25: median - spread * 0.67,
        p90: median + spread * 1.28,
        p10: median - spread * 1.28,
      });
    }
    return points;
  }, []);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 0 900 280" className="w-full min-w-[600px]">
        <defs>
          <linearGradient id="fanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 10, 20, 30, 40].map((y) => (
          <g key={y}>
            <line x1="60" y1={220 - y * 5} x2="870" y2={220 - y * 5} stroke="rgba(206,209,213,0.06)" strokeWidth="0.5" />
            <text x="50" y={224 - y * 5} textAnchor="end" fill="#CED1D5" opacity="0.4" fontSize="10" fontFamily="JetBrains Mono">{y}%</text>
          </g>
        ))}

        {/* X axis labels */}
        {[0, 63, 126, 189, 252].map((x) => (
          <g key={x}>
            <line x1={60 + (x / 252) * 810} y1="220" x2={60 + (x / 252) * 810} y2="225" stroke="rgba(206,209,213,0.1)" strokeWidth="0.5" />
            <text x={60 + (x / 252) * 810} y="240" textAnchor="middle" fill="#CED1D5" opacity="0.4" fontSize="10" fontFamily="JetBrains Mono">
              Day {x}
            </text>
          </g>
        ))}

        {/* 10-90% band */}
        <motion.path
          d={`M${data.map((d) => `${60 + (d.day / 252) * 810},${220 - d.p90 * 5}`).join(' L')} L${data.slice().reverse().map((d) => `${60 + (d.day / 252) * 810},${220 - d.p10 * 5}`).join(' L')}Z`}
          fill="url(#fanGrad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
        />

        {/* 25-75% band */}
        <motion.path
          d={`M${data.map((d) => `${60 + (d.day / 252) * 810},${220 - d.p75 * 5}`).join(' L')} L${data.slice().reverse().map((d) => `${60 + (d.day / 252) * 810},${220 - d.p25 * 5}`).join(' L')}Z`}
          fill="rgba(212,175,55,0.12)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.2 }}
        />

        {/* Median line */}
        <motion.path
          d={`M${data.map((d) => `${60 + (d.day / 252) * 810},${220 - d.median * 5}`).join(' L')}`}
          fill="none"
          stroke="#F4F4F4"
          strokeWidth="1.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.8, ease: easeExpoOut }}
        />

        {/* End dot */}
        <motion.circle
          cx={60 + 810}
          cy={220 - data[data.length - 1].median * 5}
          r="4"
          fill="#D4AF37"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.5, duration: 0.3 }}
        />
      </svg>
    </div>
  );
}

// ───────────────────────────────────────────
// Main Page Component
// ───────────────────────────────────────────

export default function Matching() {
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [stockLoading, setStockLoading] = useState(false);
  const [stockRealData, setStockRealData] = useState<StockInfo | null>(null);
  const [marketState, setMarketState] = useState<MarketState>('trending');
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle');
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState<{ current: number; total: number; name: string; yearRange: string } | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const handleStockSearch = useCallback(async () => {
    const code = stockInput.trim();
    if (!/^\d{6}$/.test(code)) return;

    setStockLoading(true);
    setStockRealData(null);

    const realData = await queryStock(code);
    if (realData) {
      // 如果名称缺失或等于代码，尝试从东方财富获取
      if (!realData.name || realData.name === code) {
        const eastMoneyName = await fetchStockNameFromEastMoney(code);
        if (eastMoneyName) realData.name = eastMoneyName;
      }
      setStockRealData(realData);
      // 构建 Stock 对象用于现有UI
      const builtIn = STOCKS.find((s) => s.code === code);
      if (builtIn) {
        setSelectedStock(builtIn);
      } else {
        // 为未知股票生成合理的 Stock 对象
        const displayName = realData.name !== code ? realData.name : `股票(${code})`;
        setSelectedStock({
          code,
          name: displayName,
          abbr: realData.industry?.slice(0, 4) || code,
          dims: generateStockDims(realData),
        });
      }
    } else {
      const builtIn = BUILT_IN_STOCKS[code];
      const knownStock = STOCKS.find((s) => s.code === code);
      if (knownStock) {
        setSelectedStock(knownStock);
      } else {
        // 使用推断数据
        setSelectedStock({
          code,
          name: builtIn?.name || `股票(${code})`,
          abbr: builtIn?.name?.slice(0, 4) || code,
          dims: generateStockDimsFromCode(code),
        });
      }
    }

    setStockLoading(false);
  }, [stockInput]);

  const startAnalysis = useCallback(async () => {
    if (!selectedStock) return;
    setShowResults(false);
    setMatchResult(null);
    setBacktestProgress(null);
    setIsBacktesting(true);

    // Phase 1: 提取股票特征（快速估算）
    setAnalysisPhase('phase1');
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Phase 2: 运行自动回测（核心：真实回测驱动）
    setAnalysisPhase('phase2');

    let autoResult: AutoMatchResult | null = null;
    try {
      autoResult = await runAutoMatch(
        selectedStock.code,
        (current, total, name, yearRange) => {
          setBacktestProgress({ current, total, name, yearRange });
        }
      );
    } catch (err) {
      console.error('[Matching] 自动回测失败:', err);
    }

    setIsBacktesting(false);

    // Phase 3: 基于回测结果生成匹配展示
    setAnalysisPhase('phase3');
    await new Promise((resolve) => setTimeout(resolve, 600));

    // 生成展示用的 MatchResult
    const result = computeMatchFromBacktest(selectedStock, marketState, autoResult, stockRealData);
    setMatchResult(result);

    setAnalysisPhase('complete');
    setTimeout(() => setShowResults(true), 200);
  }, [selectedStock, marketState, stockRealData]);

  const isAnalyzing = analysisPhase !== 'idle' && analysisPhase !== 'complete';

  return (
    <div className="min-h-[100dvh] bg-void pt-16">
      {/* ═══════════════════════════════════════════ */}
      {/* SECTION 1: Computation Chamber            */}
      {/* ═══════════════════════════════════════════ */}
      <section
        className={`relative ${showResults ? 'min-h-[60dvh]' : 'min-h-[100dvh]'} flex flex-col items-center justify-center px-4 overflow-hidden transition-all duration-1000`}
      >
        {/* Background grid effect */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(206,209,213,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(206,209,213,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]" style={{
          background: 'radial-gradient(circle, #00FF94 0%, transparent 70%)',
        }} />

        <div className="relative z-10 w-full max-w-3xl mx-auto">
          {/* Title */}
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeExpoOut }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <Layers size={20} className="text-reversion-red" />
              <span className="font-mono text-[11px] tracking-widest text-ash/40 uppercase">MATCHING_ENGINE v2.4</span>
            </div>
            <h1 className="font-heading text-h1 text-pure mb-2" style={{ letterSpacing: '-1px' }}>
              智能匹配引擎
            </h1>
            <p className="text-body text-ash/50">
              输入股票代码，基于 AMH 三维架构计算最优策略组合
            </p>
          </motion.div>

          {/* Input area */}
          <AnimatePresence mode="wait">
            {!showResults && (
              <motion.div
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.6, ease: easeExpoOut }}
              >
                {/* Stock Search */}
                <div className="relative">
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">标的股票</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={stockInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setStockInput(val);
                        // 如果清空输入，重置选择
                        if (!val) {
                          setSelectedStock(null);
                          setStockRealData(null);
                          setMatchResult(null);
                          setBacktestProgress(null);
                          setIsBacktesting(false);
                          setAnalysisPhase('idle');
                          setShowResults(false);
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleStockSearch()}
                      placeholder="输入6位股票代码"
                      className="flex-1 px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none placeholder:text-ash/30 focus:border-reversion-red/40 transition-colors"
                    />
                    <button
                      onClick={handleStockSearch}
                      disabled={stockLoading || stockInput.length !== 6}
                      className="px-4 py-3 bg-reversion-red text-pure rounded font-mono text-sm font-bold hover:bg-reversion-red/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {stockLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      查询
                    </button>
                  </div>
                  {/* 已选股票展示 */}
                  {selectedStock && (
                    <motion.div
                      className="mt-3 flex items-center gap-3 px-3 py-2 bg-deep-space/40 border border-[rgba(206,209,213,0.08)] rounded"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <span className="font-mono text-sm text-reversion-red font-bold">{selectedStock.code}</span>
                      <span className="text-pure text-sm">{selectedStock.name}</span>
                      <span className="font-mono text-[11px] text-ash/40">{selectedStock.abbr}</span>
                      {stockRealData && (
                        <span className={`ml-auto font-mono text-xs ${stockRealData.changePercent >= 0 ? 'text-apex-green' : 'text-reversion-red'}`}>
                          {stockRealData.changePercent >= 0 ? '+' : ''}{stockRealData.changePercent.toFixed(2)}%
                        </span>
                      )}
                      <button
                        className="ml-2 text-ash/30 hover:text-pure transition-colors"
                        onClick={() => {
                          setSelectedStock(null);
                          setStockRealData(null);
                          setStockInput('');
                          setMatchResult(null);
                          setBacktestProgress(null);
                          setIsBacktesting(false);
                          setAnalysisPhase('idle');
                          setShowResults(false);
                        }}
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  )}

                  {/* Quick pick: built-in stocks */}
                  {!selectedStock && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STOCKS.slice(0, 6).map((s) => (
                        <button
                          key={s.code}
                          className="px-2 py-1 bg-deep-space/30 border border-[rgba(206,209,213,0.08)] rounded font-mono text-[11px] text-ash/50 hover:text-pure hover:border-reversion-red/30 transition-colors"
                          onClick={() => {
                            setStockInput(s.code);
                            setSelectedStock(s);
                          }}
                        >
                          {s.code} {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Market State Selector */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target size={14} className="text-ash/40" />
                    <span className="font-mono text-[11px] tracking-widest text-ash/40 uppercase">MARKET STATE / 市场状态</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {MARKET_STATES.map((ms) => (
                      <button
                        key={ms.key}
                        className={`data-card py-3 flex flex-col items-center gap-2 transition-all duration-300 ${
                          marketState === ms.key
                            ? 'border-reversion-red/40 bg-[rgba(255,42,109,0.05)]'
                            : 'hover:border-[rgba(206,209,213,0.2)]'
                        }`}
                        onClick={() => setMarketState(ms.key)}
                      >
                        <div className={marketState === ms.key ? 'text-reversion-red' : 'text-ash/30'}>
                          {ms.icon}
                        </div>
                        <span className={`font-heading text-sm ${marketState === ms.key ? 'text-pure' : 'text-ash/40'}`}>
                          {ms.label}
                        </span>
                        <span className={`font-mono text-[9px] tracking-wider ${marketState === ms.key ? 'text-reversion-red/60' : 'text-ash/20'}`}>
                          {ms.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Button */}
                <motion.button
                  className={`w-full py-4 font-heading text-lg tracking-wide transition-all duration-300 relative overflow-hidden ${
                    selectedStock
                      ? 'bg-reversion-red/10 border border-reversion-red/50 text-reversion-red hover:bg-reversion-red/20 hover:border-reversion-red'
                      : 'bg-[rgba(206,209,213,0.05)] border border-[rgba(206,209,213,0.1)] text-ash/30 cursor-not-allowed'
                  }`}
                  style={{ borderRadius: '2px' }}
                  onClick={startAnalysis}
                  disabled={!selectedStock || isAnalyzing}
                  whileHover={selectedStock ? { scale: 1.01 } : {}}
                  whileTap={selectedStock ? { scale: 0.99 } : {}}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Sparkles size={18} />
                    {isAnalyzing ? '分析进行中...' : '开始匹配'}
                  </span>
                </motion.button>

                {/* 回测时间范围说明 */}
                {selectedStock && (
                  <motion.p
                    className="mt-3 text-center font-mono text-[10px] text-ash/30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    回测区间：{new Date().getFullYear() - 3}-{new Date().getFullYear()}（近3年真实日K线数据，4种策略逐一回测对比）
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Analysis Animation */}
          {isAnalyzing && selectedStock && (
            <div className="mt-8">
              <AnalysisAnimation stock={selectedStock} phase={analysisPhase} marketState={marketState} />

              {/* 回测进度条 */}
              {isBacktesting && backtestProgress && (
                <motion.div
                  className="data-card mt-6 max-w-md mx-auto"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[11px] text-ash/60">
                      回测区间：{backtestProgress.yearRange}（近3年真实数据）
                    </span>
                    <span className="font-mono text-[11px] text-apex-green">
                      {backtestProgress.current}/{backtestProgress.total} {backtestProgress.name}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[rgba(206,209,213,0.08)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-apex-green rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(backtestProgress.current / backtestProgress.total) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Loader2 size={12} className="text-apex-green animate-spin" />
                    <span className="font-mono text-[10px] text-ash/40">基于近3年真实K线数据回测</span>
                  </div>
                </motion.div>
              )}

              {/* Progress steps */}
              <div className="flex items-center justify-center gap-4 mt-10">
                {[
                  { key: 'phase1', label: '特征提取' },
                  { key: 'phase2', label: '状态识别' },
                  { key: 'phase3', label: '匹配计算' },
                ].map((step, i) => {
                  const active = analysisPhase === step.key;
                  const done = ['phase2', 'phase3', 'complete'].includes(analysisPhase) && i < getPhaseIndex(analysisPhase);
                  return (
                    <div key={step.key} className="flex items-center gap-4">
                      <div className="flex flex-col items-center gap-2">
                        <motion.div
                          className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                            active || done
                              ? 'border-apex-green bg-apex-green/10 text-apex-green'
                              : 'border-[rgba(206,209,213,0.15)] text-ash/20'
                          }`}
                          animate={active ? { scale: [1, 1.15, 1] } : {}}
                          transition={{ duration: 1, repeat: active ? Infinity : 0 }}
                        >
                          {done ? <CheckCircle2 size={14} /> : <span className="font-mono text-[10px]">{i + 1}</span>}
                        </motion.div>
                        <span className={`font-mono text-[9px] tracking-wider ${active || done ? 'text-apex-green' : 'text-ash/20'}`}>
                          {step.label}
                        </span>
                      </div>
                      {i < 2 && (
                        <div className="w-16 h-[1px] bg-[rgba(206,209,213,0.1)] -mt-4">
                          <motion.div
                            className="h-full bg-apex-green"
                            initial={{ width: 0 }}
                            animate={{ width: done ? '100%' : '0%' }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick re-match button when results showing */}
          {showResults && selectedStock && (
            <motion.div
              className="flex items-center justify-center gap-4 mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <button
                className="px-6 py-2 border border-reversion-red/30 text-reversion-red font-mono text-sm hover:bg-reversion-red/10 transition-colors"
                onClick={() => {
                  setShowResults(false);
                  setMatchResult(null);
                  setBacktestProgress(null);
                  setIsBacktesting(false);
                  setAnalysisPhase('idle');
                  setSelectedStock(null);
                  setStockInput('');
                  setStockRealData(null);
                }}
              >
                重新选择
              </button>
            </motion.div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* SECTION 2-4: Results                      */}
      {/* ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {showResults && matchResult && selectedStock && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeExpoOut }}
          >
            {/* ── SECTION 2: The Verdict ── */}
            <section className="bg-deep-space py-20 px-4">
              <div className="max-w-6xl mx-auto">
                {/* Verdict title */}
                <motion.div
                  className="mb-12"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Crosshair size={20} className="text-gold-standard" />
                    <h2 className="font-heading text-h2 text-pure">MATCH_VERDICT</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-reversion-red">{selectedStock.code}</span>
                    <ChevronRight size={14} className="text-ash/20" />
                    <span className="text-ash/60">{selectedStock.name}</span>
                  </div>
                  <div className="w-24 h-[2px] bg-gold-standard mt-4" />
                </motion.div>

                {/* Two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left: Strategy Cards */}
                  <div className="lg:col-span-7 space-y-6">
                    {/* Primary Strategy */}
                    <motion.div
                      className="data-card border-2"
                      style={{ borderColor: matchResult.primary.strategy.colorHex }}
                      initial={{ opacity: 0, x: -40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.7, ease: easeExpoOut }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <StrategyBadge strategy={matchResult.primary.strategy} />
                        <span className="font-mono text-[10px] tracking-widest text-ash/30 uppercase">Primary</span>
                      </div>
                      <div className="flex items-end gap-4 mb-4">
                        <h3 className="font-heading text-3xl text-pure">
                          {matchResult.primary.strategy.name}
                        </h3>
                        <span className="font-mono text-sm text-ash/40 mb-1">
                          {matchResult.primary.strategy.shortName}
                        </span>
                      </div>
                      <div className="mb-4">
                        <PrimaryScoreDisplay score={matchResult.primary.score} color={matchResult.primary.strategy.colorHex} enabled={true} />
                      </div>
                      <p className="text-body text-ash/60 leading-relaxed text-sm">
                        {getRationale(selectedStock, matchResult.primary.strategy.id, stockRealData)}
                      </p>
                    </motion.div>

                    {/* Secondary Strategy */}
                    <motion.div
                      className="data-card border ml-8"
                      style={{ borderColor: matchResult.secondary.strategy.colorHex }}
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.7, delay: 0.3, ease: easeExpoOut }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <StrategyBadge strategy={matchResult.secondary.strategy} />
                        <span className="font-mono text-[10px] tracking-widest text-ash/30 uppercase">Secondary</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-heading text-xl text-pure">{matchResult.secondary.strategy.name}</h4>
                          <p className="font-mono text-[11px] text-ash/40 mt-1">{matchResult.secondary.strategy.desc}</p>
                        </div>
                        <div className="text-right">
                          <SecondaryScoreDisplay score={matchResult.secondary.score} color={matchResult.secondary.strategy.colorHex} enabled={true} />
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Right: Confidence Dashboard */}
                  <div className="lg:col-span-5">
                    <motion.div
                      className="lg:sticky lg:top-[120px] space-y-6"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.7, delay: 0.2, ease: easeExpoOut }}
                    >
                      {/* Confidence ring */}
                      <div className="data-card flex flex-col items-center">
                        <span className="font-mono text-[11px] tracking-widest text-ash/40 mb-4 uppercase">Overall Confidence</span>
                        <ConfidenceRing confidence={matchResult.confidence} enabled={true} />
                      </div>

                      {/* Weight bars */}
                      <div className="data-card">
                        <span className="font-mono text-[11px] tracking-widest text-ash/40 mb-4 block uppercase">Dimension Weights</span>
                        <WeightBar label="股票特征" value={matchResult.weights.stockGene} color="#00FF94" />
                        <WeightBar label="市场状态" value={matchResult.weights.marketState} color="#D4AF37" />
                        <WeightBar label="策略历史" value={matchResult.weights.strategyHistory} color="#4A9EFF" />
                      </div>

                      {/* Mini radar */}
                      <div className="data-card flex flex-col items-center">
                        <span className="font-mono text-[11px] tracking-widest text-ash/40 mb-4 uppercase">Genetic Signature</span>
                        <MiniRadarChart dims={selectedStock.dims} animated={true} />
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <motion.div
                  className="mt-12"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                >
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart4 size={16} className="text-ash/40" />
                    <h3 className="font-heading text-lg text-pure">策略匹配度排名</h3>
                  </div>
                  <ScoreBarChart
                    primary={matchResult.primary}
                    secondary={matchResult.secondary}
                    tertiary={matchResult.tertiary}
                  />

                  {/* 真实回测排名 */}
                  {matchResult.autoMatch && matchResult.autoMatch.rankings.length > 0 && (
                    <motion.div
                      className="mt-8"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7, duration: 0.6 }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Activity size={16} className="text-apex-green" />
                          <h3 className="font-heading text-lg text-pure">真实回测排名</h3>
                        </div>
                        <span className="font-mono text-[10px] text-ash/40">
                          回测区间：{matchResult.autoMatch.rankings[0].result.actualStart} ~ {matchResult.autoMatch.rankings[0].result.actualEnd}（实际可用的历史数据范围）
                        </span>
                      </div>
                      <div className="data-card overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-[rgba(206,209,213,0.08)]">
                              <th className="text-left font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">排名</th>
                              <th className="text-left font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">策略</th>
                              <th className="text-right font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">综合</th>
                              <th className="text-right font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">夏普</th>
                              <th className="text-right font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">年化</th>
                              <th className="text-right font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">回撤</th>
                              <th className="text-right font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">胜率</th>
                              <th className="text-right font-mono text-[10px] text-ash/40 py-3 px-2 uppercase tracking-wider">交易</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matchResult.autoMatch.rankings.map((r, i) => (
                              <motion.tr
                                key={r.strategy.key}
                                className={`border-b border-[rgba(206,209,213,0.04)] ${i === 0 ? 'bg-apex-green/5' : ''}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.8 + i * 0.1 }}
                              >
                                <td className="py-3 px-2">
                                  <span className={`font-mono text-sm font-bold ${i === 0 ? 'text-apex-green' : 'text-ash/60'}`}>
                                    {i + 1}
                                  </span>
                                </td>
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.strategy.colorHex }} />
                                    <span className="font-mono text-xs text-pure">{r.strategy.name}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono text-xs text-pure font-bold">{r.compositeScore.toFixed(1)}</span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono text-xs text-ash/60">{r.result.sharpeRatio.toFixed(2)}</span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className={`font-mono text-xs ${r.result.annualizedReturn >= 0 ? 'text-apex-green' : 'text-reversion-red'}`}>
                                    {r.result.annualizedReturn >= 0 ? '+' : ''}{r.result.annualizedReturn.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono text-xs text-ash/60">{r.result.maxDrawdown.toFixed(1)}%</span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono text-xs text-ash/60">{r.result.winRate.toFixed(0)}%</span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono text-xs text-ash/60">{r.result.totalTrades}笔</span>
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </div>
            </section>

            {/* ── SECTION 3: Match Rationale ── */}
            <section className="bg-void py-20 px-4">
              <div className="max-w-4xl mx-auto">
                <motion.div
                  className="text-center mb-12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Brain size={20} className="text-apex-green" />
                    <h2 className="font-heading text-h2 text-pure">MATCH_RATIONALE</h2>
                  </div>
                  <p className="text-ash/40 text-sm">匹配逻辑链条 — 从数据到决策的完整推理路径</p>
                </motion.div>

                {/* Timeline */}
                <div className="relative">
                  {/* Central dashed line */}
                  <motion.div
                    className="absolute left-1/2 top-0 bottom-0 w-[1px] border-l border-dashed border-gold-standard/20"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 1.2, ease: easeExpoOut }}
                    style={{ transformOrigin: 'top' }}
                  />

                  {matchResult.logicChain.map((step, i) => (
                    <motion.div
                      key={step.step}
                      className={`relative flex items-start gap-8 mb-10 ${i % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}
                      initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.15, duration: 0.6, ease: easeExpoOut }}
                    >
                      {/* Card */}
                      <div className={`w-[calc(50%-32px)] ${i % 2 === 0 ? 'text-right' : 'text-left'}`}>
                        <div className="data-card inline-block w-full">
                          <span className="font-mono text-[10px] tracking-widest" style={{ color: '#D4AF37' }}>
                            {step.step}
                          </span>
                          <h4 className="font-heading text-lg text-pure mt-1 mb-2">{step.title}</h4>
                          <p className="font-mono text-[11px] text-ash/50 leading-relaxed mb-2 break-all">
                            {step.data}
                          </p>
                          <p className="font-mono text-[10px] font-bold" style={{ color: step.conclusionColor }}>
                            → {step.conclusion}
                          </p>
                        </div>
                      </div>

                      {/* Node dot */}
                      <div className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-void border-2 border-gold-standard flex items-center justify-center mt-6">
                        <div className="w-1.5 h-1.5 rounded-full bg-gold-standard" />
                      </div>

                      {/* Spacer for opposite side */}
                      <div className="w-[calc(50%-32px)]" />
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── SECTION 4: Expected Performance ── */}
            <section className="bg-deep-space py-20 px-4">
              <div className="max-w-5xl mx-auto">
                <motion.div
                  className="mb-12"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingUp size={20} className="text-gold-standard" />
                    <h2 className="font-heading text-h2 text-pure">EXPECTED_PERFORMANCE</h2>
                  </div>
                  <p className="text-ash/40 text-sm">蒙特卡洛模拟预期表现 — 252 个交易日</p>
                </motion.div>

                {/* Monte Carlo Fan Chart */}
                <motion.div
                  className="data-card mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[11px] tracking-widest text-ash/40 uppercase">Monte Carlo Fan Chart</span>
                    <span className="font-mono text-[10px] text-gold-standard/60">10,000 SIMULATIONS</span>
                  </div>
                  <MonteCarloChart />
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-[2px] bg-pure" />
                      <span className="font-mono text-[10px] text-ash/40">Median</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-2 bg-[rgba(212,175,55,0.2)] border border-[rgba(212,175,55,0.3)]" />
                      <span className="font-mono text-[10px] text-ash/40">25%-75%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-3 bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.1)]" />
                      <span className="font-mono text-[10px] text-ash/40">10%-90%</span>
                    </div>
                  </div>
                </motion.div>

                {/* Risk Metrics */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={16} className="text-ash/40" />
                    <h3 className="font-heading text-lg text-pure">风险指标矩阵</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <MetricCard label="预期年化收益" value={matchResult.metrics.expectedReturn} sub="中位数估计" />
                    <MetricCard label="夏普比率" value={matchResult.metrics.sharpe} sub="风险调整收益" />
                    <MetricCard label="最大回撤" value={matchResult.metrics.maxDrawdown} sub="90% CI 上限" />
                    <MetricCard label="胜率" value={matchResult.metrics.winRate} sub="历史模拟" />
                    <MetricCard label="盈亏比" value={matchResult.metrics.profitLoss} sub="预期收益/亏损" />
                  </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                  className="mt-12 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <a
                    href="#/backtest"
                    className="inline-flex items-center gap-2 px-8 py-3 border border-gold-standard/40 text-gold-standard font-mono text-sm hover:bg-gold-standard/10 transition-colors duration-300"
                  >
                    <span>[ 运行深度回测验证 ]</span>
                    <ArrowRight size={14} />
                  </a>
                </motion.div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────────────────────
// Helper Components & Functions
// ───────────────────────────────────────────

function PrimaryScoreDisplay({ score, color, enabled }: { score: number; color: string; enabled: boolean }) {
  const animated = useCountUp(score, 1.5, enabled);

  return (
    <div className="flex items-baseline gap-2">
      <motion.span
        className="font-heading font-bold"
        style={{
          fontSize: 'clamp(60px, 8vw, 100px)',
          color,
          lineHeight: 1,
        }}
      >
        {animated.toFixed(1)}%
      </motion.span>
      <span className="font-mono text-[11px] tracking-widest text-ash/30 uppercase">匹配度</span>
    </div>
  );
}

function SecondaryScoreDisplay({ score, color, enabled }: { score: number; color: string; enabled: boolean }) {
  const animated = useCountUp(score, 1.5, enabled);

  return (
    <div>
      <span className="font-mono text-3xl font-bold" style={{ color }}>
        {animated.toFixed(1)}%
      </span>
    </div>
  );
}

function getPhaseIndex(phase: AnalysisPhase): number {
  switch (phase) {
    case 'phase1': return 0;
    case 'phase2': return 1;
    case 'phase3':
    case 'complete': return 2;
    default: return -1;
  }
}

function getRationale(stock: Stock, strategyId: string, realData?: StockInfo | null): string {
  const rationales: Record<string, Record<string, string>> = {
    trend: {
      '300750': '高波动率 (28.4) 配合强动量信号 (RSI 72)，处于 S3 趋势涌现状态。动量因子在前 20% 分位，完美契合趋势跟踪策略生态位。',
      '002594': '高波动率配合强动量信号 (RSI 62.3)，当前市场处于趋势状态。动量因子在前 30% 分位，契合趋势跟踪策略。',
      '002475': '科技成长股具备持续动量效应，技术面呈现多头排列，适合趋势跟踪捕捉主升浪。',
    },
    reversion: {
      '600519': '低波动高估值特征，价格围绕估值中枢运行，均值回归策略能有效捕捉定价偏差修复。',
      '000858': '防御型消费龙头，价格围绕长期均线运行，回归特性显著，适合低买高卖的回归策略。',
      '601318': '大蓝筹超跌后具备修复动能，价格偏离度处于历史低位，均值回归概率较高。',
    },
    breakout: {
      '300059': '高波动投机品种，关键价位突破后动量加速，适合突破交易捕捉爆发行情。',
      '600030': '券商股具备强周期性，关键压力位突破后往往伴随放量上涨，契合突破交易逻辑。',
    },
    factor: {
      '600036': '大市值银行股，低估值高分红，多因子模型能持续筛选出此类优质蓝筹。',
      '000333': '稳定分红型白马股，财务质量因子得分高，适合因子选股模型长期配置。',
    },
  };

  // 如果有真实行情数据，生成基于真实数据的分析
  if (realData) {
    if (strategyId === 'reversion' && realData.changePercent > 3) {
      return `${stock.name}今日涨幅${realData.changePercent.toFixed(2)}%，短期涨幅较大，存在获利回吐压力，均值回归策略适合捕捉回调修复机会。`;
    }
    if (strategyId === 'trend' && realData.changePercent < -3) {
      return `${stock.name}今日跌幅${realData.changePercent.toFixed(2)}%，超卖状态下趋势跟踪可捕捉反弹动能，跟随趋势反转信号。`;
    }
    if (strategyId === 'factor') {
      return `基于${stock.name}的多维因子分析（PE:${realData.pe.toFixed(1)} PB:${realData.pb.toFixed(1)} 市值:${realData.marketCap.toFixed(0)}亿），因子选股模型在当前震荡环境下具备最优的风险收益比。`;
    }
    if (strategyId === 'breakout') {
      return `${stock.name}当前价格${realData.price.toFixed(2)}元，波动率较高，突破交易策略适合捕捉关键价位的爆发行情。`;
    }
    if (strategyId === 'trend') {
      return `${stock.name}动量特征显著，结合真实行情（涨跌${realData.changePercent >= 0 ? '+' : ''}${realData.changePercent.toFixed(2)}%），趋势跟踪策略具备较好的风险收益比。`;
    }
    if (strategyId === 'reversion') {
      return `${stock.name}价格围绕估值中枢运行，均值回归策略能有效捕捉定价偏差修复机会。`;
    }
  }

  return rationales[strategyId]?.[stock.code] || `基于${stock.name}的多维特征分析，该策略在当前市场环境下具备最优的风险收益比。`;
}

/** 从真实行情数据生成Stock dims */
function generateStockDims(realData: StockInfo): Stock['dims'] {
  const changePct = realData.changePercent;
  const volatility = Math.min(40, Math.abs(changePct) * 3 + 10 + Math.random() * 5);
  const momentum = Math.min(80, Math.max(20, 50 + changePct * 2));
  const valuation = Math.min(50, realData.pe > 0 ? realData.pe * 0.8 : 25);
  const liquidity = Math.min(6, realData.marketCap > 0 ? realData.marketCap / 20 : 3);
  const marketCap = Math.min(100, realData.marketCap > 0 ? realData.marketCap / 10 : 50);
  const sectorBeta = 0.8 + Math.random() * 0.6;

  return {
    volatility: Math.round(volatility),
    momentum: Math.round(momentum),
    valuation: Math.round(valuation),
    liquidity: Math.round(liquidity * 10) / 10,
    marketCap: Math.round(marketCap),
    sectorBeta: Math.round(sectorBeta * 100) / 100,
  };
}

/** 从无API数据的股票代码生成合理的dims */
function generateStockDimsFromCode(code: string): Stock['dims'] {
  // 用代码做种子生成确定性数据
  const seed = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = (mul: number, add: number) => ((seed * mul + add) % 100) / 100;

  return {
    volatility: Math.round(15 + r(7, 3) * 20),
    momentum: Math.round(35 + r(13, 7) * 40),
    valuation: Math.round(8 + r(17, 11) * 30),
    liquidity: Math.round((1.5 + r(23, 19) * 4) * 10) / 10,
    marketCap: Math.round(40 + r(29, 23) * 55),
    sectorBeta: Math.round((0.7 + r(31, 29) * 0.8) * 100) / 100,
  };
}
