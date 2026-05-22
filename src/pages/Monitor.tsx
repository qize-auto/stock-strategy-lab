import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Bar, Area, ReferenceLine, Scatter, Customized,
} from 'recharts';
import {
  Loader2, RefreshCw, Activity, TrendingUp, TrendingDown,
  Minus, Target, Shield, Clock,
  AlertTriangle, CheckCircle2, XCircle, HelpCircle, Star,
  Eye, Zap, ChevronDown,
} from 'lucide-react';
import {
  fetchMonitorData,
  fetchIntradayTrends,
  isTradingTime,
  getNextRefreshText,
  type MonitorData,
  type TradeSignal,
  type StrengthScore,
  type SignalRecord,
  type IntradayPoint,
} from '@/services/stockApi';
import {
  runBacktest,
} from '@/services/strategyEngine';
import type { StrategyElement } from '@/contexts/AppContext';
import { FACTOR_CATEGORIES } from '@/services/factorLibrary';
import {
  assessFromMonitorData,
  getPhaseColor,
  getAlertColor,
  getPhaseName,
  type MarketState,
} from '@/services/marketStateEngine';
import {
  calculatePositionAdjustment,
  filterSignals,
  getInterventionColor,
  type InterventionResult,
  type TradeSignal as IVTradeSignal,
} from '@/services/strategyIntervention';

/* ──────────────────────── helpers ──────────────────────── */

function easeExpoOut(): [number, number, number, number] {
  return [0.16, 1, 0.3, 1];
}

const COLORS = {
  up: '#00FF94',
  down: '#FF2A6D',
  gold: '#D4AF37',
  apexGreen: '#00FF94',
  reversionRed: '#FF2A6D',
  pure: '#F4F4F4',
  ash: '#CED1D5',
  muted: 'rgba(206,209,213,0.4)',
  cardBg: 'rgba(11,12,16,0.3)',
  cardBorder: 'rgba(206,209,213,0.06)',
  gridColor: 'rgba(206,209,213,0.06)',
};

const chartTheme = {
  gridStroke: 'rgba(206,209,213,0.06)',
  axisStroke: 'rgba(206,209,213,0.15)',
  tickFill: 'rgba(206,209,213,0.4)',
};

const tooltipStyle = {
  backgroundColor: '#15161A',
  border: '1px solid rgba(206,209,213,0.15)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12,
  color: '#F4F4F4',
  borderRadius: '4px',
};

function formatTimeRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

/* ─── Position Management Card ─── */

function PositionCard({ stockCode, stockName, currentPrice }: { stockCode: string; stockName: string; currentPrice: number }) {
  const storageKey = `position_${stockCode}`;
  const [position, setPosition] = useState<{ cost: number; shares: number; date: string } | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [inputPrice, setInputPrice] = useState('');

  const handleMarkPosition = () => {
    const price = parseFloat(inputPrice);
    if (isNaN(price) || price <= 0) return;
    const pos = { cost: price, shares: 100, date: new Date().toISOString().slice(0, 10) };
    localStorage.setItem(storageKey, JSON.stringify(pos));
    setPosition(pos);
  };

  const handleClearPosition = () => {
    localStorage.removeItem(storageKey);
    setPosition(null);
    setInputPrice('');
  };

  const profitPct = position ? ((currentPrice - position.cost) / position.cost * 100) : 0;

  return (
    <motion.div
      className="data-card lg:col-span-1 h-full flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.5, ease: easeExpoOut() }}
    >
      <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">持仓管理</div>
      {position ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] text-ash/50">持仓</span>
            <span className="font-mono text-[13px] text-pure">{stockName}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] text-ash/50">成本价</span>
            <span className="font-mono text-[13px] text-pure">¥{position.cost.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] text-ash/50">当前价</span>
            <span className="font-mono text-[13px] text-pure">¥{currentPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[11px] text-ash/50">浮动盈亏</span>
            <span className={`font-mono text-[13px] font-bold ${profitPct >= 0 ? 'text-apex-green' : 'text-reversion-red'}`}>
              {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
            </span>
          </div>
          <button
            onClick={handleClearPosition}
            className="w-full px-3 py-2 bg-reversion-red/10 border border-reversion-red/30 text-reversion-red font-mono text-[11px] rounded hover:bg-reversion-red/20 transition-colors"
          >
            清仓
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[11px] text-ash/50">买入价格</span>
            <span className="font-mono text-[11px] text-ash/30">¥</span>
            <input
              type="number"
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
              placeholder={currentPrice.toFixed(2)}
              className="flex-1 px-2 py-1.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-xs text-pure outline-none focus:border-apex-green/50"
            />
          </div>
          <button
            onClick={handleMarkPosition}
            disabled={!inputPrice || parseFloat(inputPrice) <= 0}
            className="w-full px-3 py-2 bg-apex-green/10 border border-apex-green/30 text-apex-green font-mono text-[11px] rounded hover:bg-apex-green/20 transition-colors disabled:opacity-30"
          >
            标记持仓
          </button>
          <p className="font-mono text-[9px] text-ash/30 mt-2">输入您的持仓成本价进行跟踪</p>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Factor Config Panel for 因子选股 ─── */

function FactorConfigPanel() {
  const [selectedFactors, setSelectedFactors] = useState<string[]>([
    'trend_ma_cross', 'momentum_rsi', 'volume_ratio', 'volatility_bb'
  ]);
  const [factorWeights, setFactorWeights] = useState<Record<string, number>>({
    'trend_ma_cross': 0.30, 'momentum_rsi': 0.30, 'volume_ratio': 0.20, 'volatility_bb': 0.20
  });
  const [showPanel, setShowPanel] = useState(false);

  const totalWeight = selectedFactors.reduce((sum, id) => sum + (factorWeights[id] || 0), 0);

  return (
    <div className="mb-3 p-3 border border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.03)]">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="flex items-center justify-between w-full"
      >
        <span className="font-mono text-[11px] text-gold-standard">多因子模型配置</span>
        <span className="font-mono text-[10px] text-ash/40">{showPanel ? '收起' : '展开'} {selectedFactors.length}个因子</span>
      </button>
      {showPanel && (
        <div className="mt-2 space-y-2 max-h-[240px] overflow-y-auto">
          {FACTOR_CATEGORIES.map((cat) => (
            <div key={cat.name}>
              <span className="font-mono text-[10px] text-ash/40">{cat.name}</span>
              <div className="mt-1 space-y-1">
                {cat.factors.map((f) => {
                  const isChecked = selectedFactors.includes(f.id);
                  return (
                    <div key={f.id}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFactors((p) => [...p, f.id]);
                              setFactorWeights((p) => ({ ...p, [f.id]: f.defaultWeight }));
                            } else {
                              setSelectedFactors((p) => p.filter((id) => id !== f.id));
                            }
                          }}
                          className="w-3 h-3 accent-apex-green"
                        />
                        <span className="font-mono text-[11px] text-ash/70 flex-1">{f.name}</span>
                      </label>
                      {isChecked && (
                        <div className="flex items-center gap-2 ml-5 mt-1">
                          <span className="font-mono text-[9px] text-ash/30">权重</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={factorWeights[f.id] ?? f.defaultWeight}
                            onChange={(e) => setFactorWeights((p) => ({ ...p, [f.id]: parseFloat(e.target.value) }))}
                            className="flex-1 h-1 accent-gold-standard"
                          />
                          <span className="font-mono text-[10px] text-gold-standard w-8 text-right">
                            {((factorWeights[f.id] ?? f.defaultWeight) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-[rgba(206,209,213,0.06)]">
            <span className="font-mono text-[9px] text-ash/30">已选 {selectedFactors.length} 个因子</span>
            <span className="font-mono text-[9px] text-ash/30">总权重: {(totalWeight * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function signalColor(type: TradeSignal['type']): string {
  switch (type) {
    case '买入': return COLORS.up;
    case '卖出': return COLORS.down;
    case '观望': return COLORS.gold;
  }
}

function signalBg(type: TradeSignal['type']): string {
  switch (type) {
    case '买入': return 'rgba(0,255,148,0.1)';
    case '卖出': return 'rgba(255,42,109,0.1)';
    case '观望': return 'rgba(212,175,55,0.1)';
  }
}

function ratingColor(rating: StrengthScore['rating']): string {
  switch (rating) {
    case '极强': return COLORS.up;
    case '强势': return '#4A6FA5';
    case '均衡': return COLORS.gold;
    case '弱势': return '#8B5A5A';
    case '极弱': return COLORS.down;
  }
}

function verificationIcon(result: SignalRecord['verificationResult']) {
  switch (result) {
    case '有效': return <CheckCircle2 size={14} className="text-apex-green" />;
    case '无效': return <XCircle size={14} className="text-reversion-red" />;
    case '待验证': return <HelpCircle size={14} className="text-gold-standard" />;
    default: return <Minus size={14} className="text-ash/30" />;
  }
}

/* generateIntradaySignals 已移除 — 信号系统已迁移至日K线策略联动模式 */

/**
 * 自定义策略选择器 Dropdown
 * 深色主题，替代浏览器默认select灰色样式
 */
function StrategyDropdown({
  selected,
  onSelect,
  builtinStrategies,
  customStrategies,
  onRefreshCustom,
}: {
  selected: string;
  onSelect: (val: string) => void;
  builtinStrategies: string[];
  customStrategies: string[];
  onRefreshCustom: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 打开时刷新自定义策略列表
  const handleOpen = () => {
    if (!open) onRefreshCustom();
    setOpen(!open);
  };

  const handleSelect = (val: string) => {
    onSelect(val);
    setOpen(false);
  };

  const isCustom = !builtinStrategies.includes(selected);

  return (
    <div ref={ref} className="relative w-full mb-3">
      {/* 触发按钮 */}
      <button
        onClick={handleOpen}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded font-mono text-sm transition-all ${
          open
            ? 'border-apex-green/50 bg-[rgba(0,255,148,0.06)]'
            : 'border-[rgba(206,209,213,0.12)] bg-deep-space/80 hover:border-[rgba(206,209,213,0.2)]'
        }`}
      >
        <span className={isCustom ? 'text-apex-green' : 'text-pure'}>{selected}</span>
        <ChevronDown
          size={14}
          className={`text-ash/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉菜单 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 border border-[rgba(206,209,213,0.12)] rounded bg-[#0d0e12] shadow-xl overflow-hidden"
          >
            {/* 内置策略分组 */}
            <div className="px-2 pt-2 pb-1">
              <div className="px-2 py-1 font-mono text-[10px] text-ash/30 tracking-wider">内置策略</div>
              {builtinStrategies.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSelect(s)}
                  className={`w-full text-left px-2 py-1.5 font-mono text-[12px] rounded transition-colors ${
                    selected === s
                      ? 'text-apex-green bg-[rgba(0,255,148,0.08)]'
                      : 'text-ash/70 hover:text-pure hover:bg-[rgba(206,209,213,0.05)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* 我的策略分组 */}
            {customStrategies.length > 0 ? (
              <div className="px-2 pt-1 pb-2 border-t border-[rgba(206,209,213,0.06)]">
                <div className="px-2 py-1 font-mono text-[10px] text-apex-green/50 tracking-wider flex items-center gap-1">
                  <Star size={9} /> 我的策略
                </div>
                {customStrategies.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSelect(s)}
                    className={`w-full text-left px-2 py-1.5 font-mono text-[12px] rounded transition-colors ${
                      selected === s
                        ? 'text-apex-green bg-[rgba(0,255,148,0.08)]'
                        : 'text-ash/70 hover:text-pure hover:bg-[rgba(206,209,213,0.05)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-2 border-t border-[rgba(206,209,213,0.06)]">
                <div className="font-mono text-[10px] text-ash/30">暂无自定义策略</div>
                <div className="font-mono text-[9px] text-ash/20 mt-0.5">在策略实验室保存或进化策略</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 基于日K线和策略生成买卖信号
 * - 内置策略（6种）：使用预定义规则
 * - 自定义策略（含进化策略）：通过runBacktest运行elements提取交易信号
 */
function generateStrategySignals(
  kline: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>,
  indicators: {
    ma5: number[];
    ma10: number[];
    ma20: number[];
    ma60?: number[];
    bbUpper: number[];
    bbLower: number[];
    macdDIF: number[];
    macdDEA: number[];
    macdHist: number[];
    rsi6: number[];
    support: number;
    resistance: number;
  },
  strategy: string,
  customElements?: StrategyElement[],
  stockCode?: string,
): Array<{ date: string; type: '买入' | '卖出'; price: number; reason: string }> {
  const signals: Array<{ date: string; type: '买入' | '卖出'; price: number; reason: string }> = [];
  const n = kline.length;
  if (n < 20) return signals;

  // ═══ 自定义策略（含进化策略）：通过runBacktest提取交易信号 ═══
  if (customElements && customElements.length > 0) {
    // Note: stockCode not available here, use default ±10% limit
    const result = runBacktest(kline, { elements: customElements }, 100000, undefined, stockCode);
    for (const trade of result.trades) {
      const entryK = kline[trade.entryIdx];
      const exitK = kline[trade.exitIdx];
      if (entryK) {
        signals.push({
          date: entryK.date,
          type: '买入',
          price: trade.entryPrice,
          reason: '策略入场信号',
        });
      }
      if (exitK) {
        const exitReasons: Record<string, string> = { signal: '策略出场信号', stop: '止损出场', time: '持仓超时', scale_out: '分批止盈' };
        signals.push({
          date: exitK.date,
          type: '卖出',
          price: trade.exitPrice,
          reason: exitReasons[trade.exitReason] || '策略出场信号',
        });
      }
    }
    return signals;
  }

  // ═══ 内置策略（6种）：预定义规则 ═══
  const getHighLow = (endIdx: number, days: number) => {
    const start = Math.max(0, endIdx - days + 1);
    let high = 0, low = Infinity;
    for (let i = start; i <= endIdx; i++) {
      high = Math.max(high, kline[i].high);
      low = Math.min(low, kline[i].low);
    }
    return { high, low };
  };

  const addSignal = (date: string, type: '买入' | '卖出', price: number, reason: string) => {
    const lastSig = signals[signals.length - 1];
    if (lastSig && lastSig.type === type) return;
    signals.push({ date, type, price, reason });
  };

  for (let i = 5; i < n; i++) {
    const k = kline[i];
    const ma5 = indicators.ma5[i], ma5Prev = indicators.ma5[i - 1];
    const ma20 = indicators.ma20[i], ma20Prev = indicators.ma20[i - 1];
    const ma60 = indicators.ma60?.[i];
    const bbU = indicators.bbUpper[i], bbL = indicators.bbLower[i];
    const dif = indicators.macdDIF[i], difPrev = indicators.macdDIF[i - 1];
    const dea = indicators.macdDEA[i], deaPrev = indicators.macdDEA[i - 1];
    const rsi = indicators.rsi6[i];

    const maGoldenCross = ma5 && ma5Prev && ma20 && ma20Prev && ma5Prev <= ma20Prev && ma5 > ma20;
    const maDeathCross = ma5 && ma5Prev && ma20 && ma20Prev && ma5Prev >= ma20Prev && ma5 < ma20;
    const macdGoldenCross = dif && difPrev && dea && deaPrev && difPrev <= deaPrev && dif > dea;
    const macdDeathCross = dif && difPrev && dea && deaPrev && difPrev >= deaPrev && dif < dea;

    switch (strategy) {
      case '趋势跟踪': {
        if (maGoldenCross) addSignal(k.date, '买入', k.close, 'MA5上穿MA20金叉');
        if (maDeathCross) addSignal(k.date, '卖出', k.close, 'MA5下穿MA20死叉');
        break;
      }
      case '均值回归': {
        if ((bbL && k.low <= bbL) || (rsi && rsi < 30)) {
          const reason = (bbL && k.low <= bbL) ? '价格触及布林下轨' : `RSI超卖(${rsi!.toFixed(1)})`;
          addSignal(k.date, '买入', k.close, reason);
        }
        if ((bbU && k.high >= bbU) || (rsi && rsi > 70)) {
          const reason = (bbU && k.high >= bbU) ? '价格触及布林上轨' : `RSI超买(${rsi!.toFixed(1)})`;
          addSignal(k.date, '卖出', k.close, reason);
        }
        break;
      }
      case 'MACD动量': {
        if (macdGoldenCross) addSignal(k.date, '买入', k.close, 'MACD金叉(DIF上穿DEA)');
        if (macdDeathCross) addSignal(k.date, '卖出', k.close, 'MACD死叉(DIF下穿DEA)');
        break;
      }
      case '布林带突破': {
        if (bbU && k.close > bbU) addSignal(k.date, '买入', k.close, '收盘价突破布林上轨');
        if (bbL && k.close < bbL) addSignal(k.date, '卖出', k.close, '收盘价跌破布林下轨');
        break;
      }
      case '因子选股': {
        const maBull = ma5 && ma20 && ma60 && ma5 > ma20 && ma20 > ma60;
        const macdBull = dif && dea && dif > dea;
        const rsiOK = rsi && rsi > 40 && rsi < 60;
        if (maBull && macdBull && rsiOK) {
          addSignal(k.date, '买入', k.close, '多因子共振(MA多头+MACD金叉+RSI适中)');
        }
        const maBear = ma5 && ma20 && ma60 && ma5 < ma20 && ma20 < ma60;
        const macdBear = dif && dea && dif < dea;
        if (maBear && macdBear) {
          addSignal(k.date, '卖出', k.close, '多因子共振(MA空头+MACD死叉)');
        }
        break;
      }
      case '突破交易': {
        const { high: high20, low: low20 } = getHighLow(i - 1, 20);
        if (k.close > high20) addSignal(k.date, '买入', k.close, `突破前20日高点(${high20.toFixed(2)})`);
        if (k.close < low20) addSignal(k.date, '卖出', k.close, `跌破前20日低点(${low20.toFixed(2)})`);
        break;
      }
      default: {
        if (maGoldenCross) addSignal(k.date, '买入', k.close, 'MA5上穿MA20金叉');
        if (maDeathCross) addSignal(k.date, '卖出', k.close, 'MA5下穿MA20死叉');
      }
    }
  }

  return signals;
}

/* ──────────────────────── Star Rating ──────────────────────── */

function StarRating({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={14}
          className={i < count ? 'text-gold-standard fill-gold-standard' : 'text-ash/20'}
        />
      ))}
    </div>
  );
}

/* ──────────────────────── Circular Score ──────────────────────── */

function CircularScore({ score, rating, size = 140 }: { score: number; rating: string; size?: number }) {
  const radius = size * 0.4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = ratingColor(rating as StrengthScore['rating']);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(206,209,213,0.08)" strokeWidth={size / 18} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={size / 18}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: easeExpoOut() }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="font-heading text-3xl font-bold"
          style={{ color }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: easeExpoOut() }}
        >
          {score}
        </motion.span>
        <span className="font-mono text-[10px] text-ash/40">/100</span>
      </div>
    </div>
  );
}

/* ──────────────────────── Dimension Bar ──────────────────────── */

function DimensionBar({ label, value, max, color, index }: {
  label: string; value: number; max: number; color: string; index: number;
}) {
  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 + index * 0.08, duration: 0.4, ease: easeExpoOut() }}
    >
      <span className="font-mono text-[11px] text-ash/50 w-16 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-ash/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ delay: 0.7 + index * 0.08, duration: 0.8, ease: easeExpoOut() }}
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[11px] text-pure w-8">{value}</span>
    </motion.div>
  );
}

/* ─── Market State Panel ─── */

function MarketStatePanel({ state, intervention }: { state: MarketState | null; intervention: InterventionResult | null }) {
  if (!state) return null;
  const phaseColor = getPhaseColor(state.phase);
  const alertColor = getAlertColor(state.alertLevel);
  const phaseName = getPhaseName(state.phase);
  const showIntervention = intervention && intervention.interventionLevel >= 1;

  return (
    <motion.div
      className="data-card mb-6"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeExpoOut() }}
    >
      <div className="flex flex-wrap items-center gap-4">
        {/* 市场阶段 */}
        <div className="flex items-center gap-3">
          <div className="font-mono text-[10px] text-ash/40 tracking-wider">市场阶段</div>
          <div
            className="px-3 py-1 rounded font-mono text-xs font-bold"
            style={{ backgroundColor: `${phaseColor}15`, color: phaseColor, border: `1px solid ${phaseColor}40` }}
          >
            {phaseName}
          </div>
        </div>

        {/* 预警级别 */}
        <div className="flex items-center gap-3">
          <div className="font-mono text-[10px] text-ash/40 tracking-wider">预警级别</div>
          <div
            className="px-3 py-1 rounded font-mono text-xs font-bold"
            style={{ backgroundColor: `${alertColor}15`, color: alertColor, border: `1px solid ${alertColor}40` }}
          >
            {state.alertLevel}
          </div>
        </div>

        {/* VIX */}
        <div className="flex items-center gap-2">
          <div className="font-mono text-[10px] text-ash/40">VIX</div>
          <div className="font-mono text-sm font-bold" style={{ color: state.vix > 35 ? '#FF2A6D' : state.vix > 25 ? '#D4AF37' : '#00FF94' }}>
            {state.vix.toFixed(1)}
          </div>
        </div>

        {/* 状态描述 */}
        <div className="flex-1 min-w-[200px]">
          <div className="font-mono text-[11px] text-ash/60">{state.description}</div>
        </div>

        {/* 干预提示 */}
        {showIntervention && (
          <div className="flex items-center gap-2">
            <Shield size={14} style={{ color: getInterventionColor(intervention.interventionLevel) }} />
            <span
              className="font-mono text-[10px] font-bold"
              style={{ color: getInterventionColor(intervention.interventionLevel) }}
            >
              {intervention.alerts[0]?.split(']')[1]?.trim() || '信号已过滤'}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Intervention Badge ─── */

function InterventionBadge({ result, marketState: mState, currentPosition = 50 }: { result: InterventionResult | null; marketState: MarketState | null; currentPosition?: number }) {
  if (!result || !mState) return null;
  if (result.alerts.length === 0) return null;

  const posAdvice = calculatePositionAdjustment(currentPosition, mState);

  return (
    <div className="mt-3 pt-3 border-t border-[rgba(206,209,213,0.06)] space-y-2">
      {result.alerts.map((alert, i) => {
        const isEmergency = alert.includes('应急');
        return (
          <div
            key={i}
            className="flex items-start gap-2 px-2 py-1.5 rounded"
            style={{ backgroundColor: isEmergency ? 'rgba(255,42,109,0.08)' : 'rgba(212,175,55,0.06)' }}
          >
            <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: isEmergency ? '#FF2A6D' : '#D4AF37' }} />
            <span className="font-mono text-[10px]" style={{ color: isEmergency ? '#FF2A6D' : '#D4AF37' }}>
              {alert}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between px-2">
        <span className="font-mono text-[9px] text-ash/40">信号过滤: {result.filteredSignals.length}/{result.originalSignals.length}通过</span>
        <span className="font-mono text-[9px]" style={{ color: getInterventionColor(result.interventionLevel) }}>
          建议仓位: {posAdvice.targetPosition}%
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────── RSI Gauge ──────────────────────── */

function RsiGauge({ value }: { value: number }) {
  const percent = Math.min(100, Math.max(0, value));
  let color = COLORS.ash;
  if (percent > 70) color = COLORS.down;
  else if (percent < 30) color = COLORS.up;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-[200px]">
        <div className="h-3 bg-ash/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 1, ease: easeExpoOut() }}
            style={{
              background: percent > 70
                ? 'linear-gradient(90deg, #CED1D5, #FF2A6D)'
                : percent < 30
                  ? 'linear-gradient(90deg, #00FF94, #CED1D5)'
                  : 'linear-gradient(90deg, #00FF94, #D4AF37, #FF2A6D)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-[9px] text-ash/30">0</span>
          <span className="font-mono text-[9px] text-ash/30">30</span>
          <span className="font-mono text-[9px] text-ash/30">50</span>
          <span className="font-mono text-[9px] text-ash/30">70</span>
          <span className="font-mono text-[9px] text-ash/30">100</span>
        </div>
      </div>
      <motion.div
        className="font-heading text-2xl font-bold"
        style={{ color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {value.toFixed(2)}
      </motion.div>
      <span className="font-mono text-[10px] text-ash/40">
        {percent > 70 ? '超买区间' : percent < 30 ? '超卖区间' : '中性区间'}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */

export default function Monitor() {
  const [inputCode, setInputCode] = useState('');
  const [monitorCode, setMonitorCode] = useState('');
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [error, setError] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('均值回归');
  const [customStrategies, setCustomStrategies] = useState<string[]>([]);
  // 当前选中自定义策略的elements（进化/自定义策略用）
  const [selectedStrategyElements, setSelectedStrategyElements] = useState<StrategyElement[] | undefined>(undefined);
  const [marketState, setMarketState] = useState<MarketState | null>(null);
  const [interventionResult, setInterventionResult] = useState<InterventionResult | null>(null);
  const [chartMode, setChartMode] = useState<'daily' | 'minute'>('daily');
  const [intradayData, setIntradayData] = useState<IntradayPoint[] | null>(null);
  // 日K策略信号：基于选中策略生成的买卖信号
  const [strategySignals, setStrategySignals] = useState<Array<{
    date: string;
    type: '买入' | '卖出';
    price: number;
    reason: string;
  }>>([]);
  const [resolvedName, setResolvedName] = useState('');
  const BUILTIN_STRATEGIES = ['趋势跟踪', '均值回归', 'MACD动量', '布林带突破', '因子选股', '突破交易'];

  /* Load custom strategies from localStorage — 支持多源 */
  const loadCustomStrategies = useCallback(() => {
    const allNames: string[] = [];
    // Source 1: quant_lab_strategies (策略实验室保存的)
    try {
      const raw = localStorage.getItem('quant_lab_strategies');
      if (raw) {
        const parsed = JSON.parse(raw) as { name: string; elements?: StrategyElement[] }[];
        for (const s of parsed) {
          if (s.name && !allNames.includes(s.name)) allNames.push(s.name);
        }
      }
    } catch { /* ignore */ }
    // Source 2: strategy_market (进化中心/策略市场保存的)
    try {
      const raw2 = localStorage.getItem('strategy_market');
      if (raw2) {
        const parsed2 = JSON.parse(raw2) as Array<{ name?: string; strategy?: { name?: string } }>;
        for (const s of parsed2) {
          const name = s.name || s.strategy?.name;
          if (name && !allNames.includes(name)) allNames.push(name);
        }
      }
    } catch { /* ignore */ }
    // Source 3: 进化结果直接保存的best_strategy
    try {
      const raw3 = localStorage.getItem('best_strategy');
      if (raw3) {
        const parsed3 = JSON.parse(raw3);
        if (parsed3.name && !allNames.includes(parsed3.name)) allNames.push(parsed3.name);
      }
    } catch { /* ignore */ }
    setCustomStrategies(allNames);
  }, []);

  useEffect(() => {
    loadCustomStrategies();
  }, [loadCustomStrategies]);

  /* When selected strategy changes, load its elements if it's a custom strategy */
  useEffect(() => {
    if (BUILTIN_STRATEGIES.includes(selectedStrategy)) {
      setSelectedStrategyElements(undefined);
      return;
    }
    // Custom strategy: find and load elements from localStorage
    try {
      const raw = localStorage.getItem('quant_lab_strategies');
      if (raw) {
        const parsed = JSON.parse(raw) as { name: string; elements?: StrategyElement[] }[];
        const match = parsed.find((s) => s.name === selectedStrategy);
        if (match?.elements && match.elements.length > 0) {
          setSelectedStrategyElements(match.elements);
          return;
        }
      }
    } catch { /* ignore */ }
    setSelectedStrategyElements(undefined);
  }, [selectedStrategy]);

  /* ─── load data ─── */
  const loadData = useCallback(async () => {
    if (!monitorCode) return;
    setRefreshing(true);
    setError('');
    try {
      const result = await fetchMonitorData(monitorCode);
      if (result) {
        setData(result);
        setCountdown(30);

        /* ── 名称修复：当API返回的名称等于代码或为'未知'时，从腾讯API重新获取 ── */
        if (result.stock.name === monitorCode || result.stock.name === '未知') {
          const fetchName = async () => {
            try {
              const code = result.stock.code;
              const prefix = code.startsWith('6') || code.startsWith('5') || code.startsWith('11') ? 'sh' : 'sz';
              const res = await fetch(`https://qt.gtimg.cn/q=${prefix}${code}`);
              const buffer = await res.arrayBuffer();
              const text = new TextDecoder('gbk').decode(buffer);
              const match = text.match(new RegExp(`v_${prefix}${code}="([^"]*)"`));
              if (match) {
                const parts = match[1].split('~');
                if (parts[1] && parts[1] !== code) {
                  setResolvedName(parts[1]);
                  return;
                }
              }
            } catch { /* 静默失败 */ }
            setResolvedName(result.stock.name);
          };
          fetchName();
        } else {
          setResolvedName(result.stock.name);
        }

        // 获取真实分时数据
        let trends: IntradayPoint[] | null = null;
        try {
          trends = await fetchIntradayTrends(monitorCode);
          if (trends && trends.length > 0) {
            setIntradayData(trends);
          }
        } catch {
          // 分时数据失败不阻塞
        }

        // 基于日K线和选中策略生成信号
        if (result.kline.length >= 20 && result.indicators) {
          const sigs = generateStrategySignals(result.kline, result.indicators, selectedStrategy, selectedStrategyElements, monitorCode);
          setStrategySignals(sigs);
        } else {
          setStrategySignals([]);
        }

        // 计算市场状态
        const state = await assessFromMonitorData(result as any);
        setMarketState(state);

        // 计算策略干预
        const signals: IVTradeSignal[] = result.signals.map((s: any, i: number) => ({
          id: `${s.type}_${i}`,
          type: s.type === '买入' ? 'BUY' : s.type === '卖出' ? 'SELL' : 'HOLD',
          code: result.stock.code,
          name: result.stock.name,
          price: s.price ?? result.stock.price,
          confidence: (s as any).confidence ?? 60,
          strategy: selectedStrategy === '趋势跟踪' ? 'TREND_FOLLOW' :
                     selectedStrategy === '均值回归' ? 'MEAN_REVERSION' :
                     selectedStrategy === 'MACD动量' ? 'MOMENTUM' :
                     selectedStrategy === '因子选股' ? 'FACTOR' :
                     selectedStrategy === '突破交易' ? 'BREAKOUT' : 'VALUE',
          timestamp: new Date().toISOString(),
        }));
        const ivResult = filterSignals(signals, state);
        setInterventionResult(ivResult);
      } else {
        setError('获取数据失败，请检查股票代码');
      }
    } catch {
      setError('获取数据失败');
    }
    setRefreshing(false);
    setLoading(false);
  }, [monitorCode, selectedStrategy]);

  /* ─── initial load ─── */
  useEffect(() => {
    if (!monitorCode) return;
    setLoading(true);
    loadData();
  }, [monitorCode, loadData]);

  /* ─── 30-sec auto refresh ─── */
  useEffect(() => {
    if (!monitorCode) return;
    const interval = setInterval(() => {
      if (isTradingTime()) loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [monitorCode, loadData]);

  /* ─── countdown timer ─── */
  useEffect(() => {
    if (!monitorCode) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [monitorCode]);

  // 策略切换时重新生成日K信号
  useEffect(() => {
    if (!data || data.kline.length < 20 || !data.indicators) return;
    const sigs = generateStrategySignals(data.kline, data.indicators, selectedStrategy, selectedStrategyElements, monitorCode);
    setStrategySignals(sigs);
  }, [selectedStrategy, data]);

  /* ─── handle start ─── */
  const handleStart = useCallback(() => {
    const code = inputCode.replace(/\D/g, '').slice(0, 6);
    if (code.length === 6) {
      setMonitorCode(code);
      setData(null);
      setLoading(true);
      setError('');
    } else {
      setError('请输入6位数字股票代码');
    }
  }, [inputCode]);

  /* ─── handle key down ─── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleStart();
    },
    [handleStart]
  );

  /* ─── minute chart data — 东方财富API真实分时数据 ─── */
  const minuteData = useMemo(() => {
    if (!data) return [];
    // 优先使用东方财富真实分时数据
    if (intradayData && intradayData.length > 0) {
      return intradayData.map((d, i) => ({
        time: d.time,
        minuteOffset: i,
        close: d.price,
        open: d.price,
        high: d.price,
        low: d.price,
        avg: d.avg,
        support: null,
        resistance: null,
        ma5: null,
        ma10: null,
        ma20: null,
        bbUpper: null,
        bbLower: null,
        macdHist: null,
        macdDIF: null,
        macdDEA: null,
        kdjK: null,
        kdjD: null,
        kdjJ: null,
        rsi6: null,
        buyMarker: null,
        sellMarker: null,
      }));
    }
    // fallback: 无真实数据时显示空
    return [];
  }, [data, intradayData]);

  /* ─── derived chart data — 始终使用 data.kline + data.indicators（配套） ─── */
  const chartData = useMemo(() => {
    if (!data) return [];
    if (chartMode === 'minute') {
      // 分时图不显示买卖信号
      return minuteData.map((m) => ({
        date: m.time,
        minuteOffset: m.minuteOffset,
        close: m.close,
        open: m.open,
        high: m.high,
        low: m.low,
        avg: m.avg,
        support: null,
        resistance: null,
        ma5: null,
        ma10: null,
        ma20: null,
        bbUpper: null,
        bbLower: null,
        macdHist: null,
        macdDIF: null,
        macdDEA: null,
        kdjK: null,
        kdjD: null,
        kdjJ: null,
        rsi6: null,
        // 分时图不显示信号
        buyMarker: null,
        sellMarker: null,
      }));
    }
    // Daily: 使用策略信号替代 signalHistory
    const kline = data.kline;
    const supportVal = data.indicators.support;
    const resistanceVal = data.indicators.resistance;
    const buyDates = new Set<string>();
    const sellDates = new Set<string>();
    strategySignals.forEach((s) => {
      if (s.type === '买入') buyDates.add(s.date);
      else if (s.type === '卖出') sellDates.add(s.date);
    });
    return kline.map((k, i) => ({
      date: k.date,
      open: k.open,
      close: k.close,
      high: k.high,
      low: k.low,
      volume: k.volume,
      support: supportVal,
      resistance: resistanceVal,
      ma5: data.indicators.ma5[i] ?? null,
      ma10: data.indicators.ma10[i] ?? null,
      ma20: data.indicators.ma20[i] ?? null,
      bbUpper: data.indicators.bbUpper[i] ?? null,
      bbLower: data.indicators.bbLower[i] ?? null,
      macdHist: data.indicators.macdHist[i] ?? null,
      macdDIF: data.indicators.macdDIF[i] ?? null,
      macdDEA: data.indicators.macdDEA[i] ?? null,
      kdjK: data.indicators.kdjK[i] ?? null,
      kdjD: data.indicators.kdjD[i] ?? null,
      kdjJ: data.indicators.kdjJ[i] ?? null,
      rsi6: data.indicators.rsi6[i] ?? null,
      // 日K策略信号
      buyMarker: buyDates.has(k.date) ? k.close : null,
      sellMarker: sellDates.has(k.date) ? k.close : null,
    }));
  }, [data, chartMode, minuteData, strategySignals]);

  // 技术指标chartData：始终基于日K线，不受chartMode切换影响
  const indicatorChartData = useMemo(() => {
    if (!data) return [];
    const kline = data.kline;
    const buyDates = new Set<string>();
    const sellDates = new Set<string>();
    strategySignals.forEach((s) => {
      if (s.type === '买入') buyDates.add(s.date);
      else if (s.type === '卖出') sellDates.add(s.date);
    });
    return kline.map((k, i) => ({
      date: k.date,
      open: k.open,
      close: k.close,
      high: k.high,
      low: k.low,
      volume: k.volume,
      support: data.indicators.support,
      resistance: data.indicators.resistance,
      ma5: data.indicators.ma5[i] ?? null,
      ma10: data.indicators.ma10[i] ?? null,
      ma20: data.indicators.ma20[i] ?? null,
      bbUpper: data.indicators.bbUpper[i] ?? null,
      bbLower: data.indicators.bbLower[i] ?? null,
      macdHist: data.indicators.macdHist[i] ?? null,
      macdDIF: data.indicators.macdDIF[i] ?? null,
      macdDEA: data.indicators.macdDEA[i] ?? null,
      kdjK: data.indicators.kdjK[i] ?? null,
      kdjD: data.indicators.kdjD[i] ?? null,
      kdjJ: data.indicators.kdjJ[i] ?? null,
      rsi6: data.indicators.rsi6[i] ?? null,
      buyMarker: buyDates.has(k.date) ? k.close : null,
      sellMarker: sellDates.has(k.date) ? k.close : null,
    }));
  }, [data, strategySignals]);

  const prevClose = useMemo(() => {
    return data?.stock?.prevClose ?? (chartData.length > 0 ? (chartData[0] as any).close ?? 0 : 0);
  }, [data, chartData]);

  const currentRsi = useMemo(() => {
    if (!data) return 50;
    const vals = data.indicators.rsi6.filter((v) => !isNaN(v));
    return vals.length > 0 ? vals[vals.length - 1] : 50;
  }, [data]);

  /* ─── 基于当前策略信号的回测验证 ─── */
  const accuracyStats = useMemo(() => {
    if (!data || !strategySignals || strategySignals.length === 0) return null;

    let total = 0;
    let correct = 0;

    // 对每条策略信号进行回测验证：看信号发出后5天价格变化
    for (const sig of strategySignals) {
      // 找到信号对应的K线索引
      const sigIdx = data.kline.findIndex((k) => k.date === sig.date);
      if (sigIdx === -1 || sigIdx + 5 >= data.kline.length) continue;

      const signalPrice = sig.price;
      const futurePrice = data.kline[sigIdx + 5].close;
      const changePercent = ((futurePrice - signalPrice) / signalPrice) * 100;

      total++;
      if (sig.type === '买入') {
        // 买入信号：5天后价格上涨>1%则为正确
        if (changePercent > 1) correct++;
      } else if (sig.type === '卖出') {
        // 卖出信号：5天后价格下跌>1%则为正确
        if (changePercent < -1) correct++;
      }
    }

    return total > 0 ? { total, correct, rate: ((correct / total) * 100).toFixed(1) } : null;
  }, [data, strategySignals, selectedStrategy]);

  // 带验证结果的策略信号列表（用于表格显示）
  const verifiedSignals = useMemo(() => {
    if (!data || !strategySignals.length) return [];
    return strategySignals.map((sig) => {
      const sigIdx = data.kline.findIndex((k) => k.date === sig.date);
      if (sigIdx === -1 || sigIdx + 5 >= data.kline.length) {
        return {
          ...sig,
          changePercent: null as number | null,
          isCorrect: null as boolean | null,
          verificationResult: '待验证' as const,
        };
      }
      const changePercent = ((data.kline[sigIdx + 5].close - sig.price) / sig.price) * 100;
      const isCorrect = sig.type === '买入' ? changePercent > 1 : changePercent < -1;
      const verificationResult = changePercent > 1 || changePercent < -1
        ? (isCorrect ? '有效' as const : '无效' as const)
        : '待验证' as const;
      return {
        ...sig,
        changePercent: Math.round(changePercent * 100) / 100,
        isCorrect,
        verificationResult,
      };
    });
  }, [data, strategySignals]);

  return (
    <div className="min-h-[100dvh] bg-void">
      {/* ═══════════════ Header + Input ═══════════════ */}
      <section className="pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="flex items-center gap-3 mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeExpoOut() }}
          >
            <Eye size={22} className="text-apex-green" />
            <h1 className="text-h2 text-pure">实时盯盘</h1>
            <span className="font-mono text-[11px] text-ash/40 tracking-wider">MONITOR</span>
          </motion.div>

          <motion.div
            className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease: easeExpoOut() }}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={handleKeyDown}
                placeholder="输入6位股票代码"
                className="w-[200px] h-11 bg-deep-space border border-[rgba(206,209,213,0.1)] px-4 font-mono text-sm text-pure outline-none focus:border-apex-green/50 transition-colors placeholder:text-ash/20"
              />
              <button
                onClick={handleStart}
                disabled={loading}
                className="h-11 px-5 bg-apex-green/10 border border-apex-green/30 text-apex-green font-mono text-sm hover:bg-apex-green/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                开始监控
              </button>
            </div>

            {monitorCode && data && (
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-pure">{resolvedName || data.stock.name}</span>
                <span className="font-mono text-xs text-ash/40">{data.stock.code}</span>
                <span className="font-mono text-xs px-2 py-0.5" style={{ background: 'rgba(206,209,213,0.08)' }}>
                  {data.stock.industry}
                </span>
              </div>
            )}
          </motion.div>

          {error && (
            <motion.p
              className="mt-3 font-mono text-xs text-reversion-red flex items-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <AlertTriangle size={12} />
              {error}
            </motion.p>
          )}
        </div>
      </section>

      {/* ═══════════════ Loading State ═══════════════ */}
      {loading && !data && (
        <div className="flex items-center justify-center py-32">
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Loader2 size={32} className="text-apex-green animate-spin" />
            <span className="font-mono text-xs text-ash/40">正在加载监控数据...</span>
          </motion.div>
        </div>
      )}

      {/* ═══════════════ Main Content ═══════════════ */}
      <AnimatePresence>
        {data && (
          <motion.div
            className="max-w-7xl mx-auto px-6 pb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: easeExpoOut() }}
          >
            {/* ─── Market State Panel ─── */}
            <MarketStatePanel state={marketState} intervention={interventionResult} />

            {/* ─── Row 1: Stock Info + Strategy + Strength ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6 items-stretch">
              {/* Real-time Price */}
              <motion.div
                className="data-card lg:col-span-1 h-full flex flex-col"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5, ease: easeExpoOut() }}
              >
                <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">实时行情</div>
                <div className="font-heading text-4xl font-bold" style={{ color: data.stock.change >= 0 ? COLORS.up : COLORS.down }}>
                  {data.stock.price.toFixed(2)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {data.stock.change >= 0 ? (
                    <TrendingUp size={14} className="text-apex-green" />
                  ) : (
                    <TrendingDown size={14} className="text-reversion-red" />
                  )}
                  <span className="font-mono text-sm" style={{ color: data.stock.change >= 0 ? COLORS.up : COLORS.down }}>
                    {data.stock.change >= 0 ? '+' : ''}{data.stock.change.toFixed(2)}
                  </span>
                  <span className="font-mono text-sm" style={{ color: data.stock.change >= 0 ? COLORS.up : COLORS.down }}>
                    ({data.stock.change >= 0 ? '+' : ''}{data.stock.changePercent.toFixed(2)}%)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[rgba(206,209,213,0.06)]">
                  <div>
                    <div className="font-mono text-[9px] text-ash/30">今开</div>
                    <div className="font-mono text-xs text-pure">{data.stock.open.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] text-ash/30">昨收</div>
                    <div className="font-mono text-xs text-pure">{data.stock.prevClose.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] text-ash/30">最高</div>
                    <div className="font-mono text-xs text-pure">{data.stock.high.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] text-ash/30">最低</div>
                    <div className="font-mono text-xs text-pure">{data.stock.low.toFixed(2)}</div>
                  </div>
                </div>
              </motion.div>

              {/* Position Management */}
              <PositionCard stockCode={data.stock.code} stockName={data.stock.name} currentPrice={data.stock.price} />

              {/* Strategy Match */}
              <motion.div
                className="data-card lg:col-span-1 h-full flex flex-col"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5, ease: easeExpoOut() }}
              >
                <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">策略匹配</div>
                {/* ═══ 自定义策略选择器 ═══ */}
                <StrategyDropdown
                  selected={selectedStrategy}
                  onSelect={(val) => setSelectedStrategy(val)}
                  builtinStrategies={BUILTIN_STRATEGIES}
                  customStrategies={customStrategies}
                  onRefreshCustom={loadCustomStrategies}
                />
                {selectedStrategy === '因子选股' && <FactorConfigPanel />}
                {(() => {
                  const isCustomStrat = !BUILTIN_STRATEGIES.includes(selectedStrategy);
                  const scoreMap: Record<string, number> = {
                    '趋势跟踪': 0.85, '均值回归': 0.72, 'MACD动量': 0.68,
                    '布林带突破': 0.60, '因子选股': 0.78, '突破交易': 0.65,
                  };
                  const baseScore = isCustomStrat ? 0.82 : (scoreMap[selectedStrategy] || 0.70);
                  const codeHash = data.stock.code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                  const score = Math.min(0.98, baseScore + (codeHash % 10) * 0.01);
                  return (
                    <>
                      <div className="font-heading text-xl font-medium text-pure mb-1">
                        {selectedStrategy}
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="font-mono text-2xl font-bold" style={{ color: isCustomStrat ? COLORS.apexGreen : COLORS.gold }}>
                          {isCustomStrat ? '自定义' : `${(score * 100).toFixed(0)}%`}
                        </div>
                        <span className="font-mono text-[10px] text-ash/40">{isCustomStrat ? '策略已激活' : '匹配度'}</span>
                      </div>
                      <div className="h-1.5 bg-ash/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: isCustomStrat ? COLORS.apexGreen : COLORS.gold }}
                          initial={{ width: 0 }}
                          animate={{ width: `${isCustomStrat ? 100 : score * 100}%` }}
                          transition={{ delay: 0.5, duration: 0.8, ease: easeExpoOut() }}
                        />
                      </div>
                    </>
                  );
                })()}
                <InterventionBadge result={interventionResult} marketState={marketState} />
              </motion.div>

              {/* Strength Score */}
              <motion.div
                className="data-card lg:col-span-1 h-full flex flex-col"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: easeExpoOut() }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="font-mono text-[11px] text-ash/40 tracking-wider">强弱评分</div>
                  <span
                    className="font-mono text-[11px] px-2 py-0.5 rounded-sm"
                    style={{
                      color: ratingColor(data.strength.rating),
                      backgroundColor: `${ratingColor(data.strength.rating)}15`,
                      border: `1px solid ${ratingColor(data.strength.rating)}30`,
                    }}
                  >
                    {data.strength.rating}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex justify-center">
                    <CircularScore score={data.strength.total} rating={data.strength.rating} size={80} />
                  </div>
                  <div className="space-y-1.5">
                    <DimensionBar label="趋势强度" value={data.strength.trendScore} max={30} color={COLORS.up} index={0} />
                    <DimensionBar label="量价配合" value={data.strength.volumeScore} max={25} color="#4A6FA5" index={1} />
                    <DimensionBar label="技术形态" value={data.strength.techScore} max={20} color={COLORS.gold} index={2} />
                    <DimensionBar label="策略匹配" value={data.strength.strategyScore} max={15} color={COLORS.pure} index={3} />
                    <DimensionBar label="实时动量" value={data.strength.momentumScore} max={10} color="#8B5A5A" index={4} />
                  </div>
                </div>
                <p className="mt-3 font-mono text-[11px] text-ash/50 leading-relaxed">
                  {data.strength.analysis}
                </p>
              </motion.div>
            </div>

            {/* ─── Row 2: K-Line Chart ─── */}
            <motion.div
              className="data-card mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: easeExpoOut() }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    {/* 分时/日K切换 */}
                    <div className="flex items-center bg-ash/5 rounded overflow-hidden">
                      <button
                        onClick={() => setChartMode('minute')}
                        className={`px-3 py-1 font-mono text-[11px] font-bold transition-all ${chartMode === 'minute' ? 'bg-gold-standard text-void' : 'text-ash/40 hover:text-ash/60'}`}
                      >
                        分时
                      </button>
                      <button
                        onClick={() => setChartMode('daily')}
                        className={`px-3 py-1 font-mono text-[11px] font-bold transition-all ${chartMode === 'daily' ? 'bg-gold-standard text-void' : 'text-ash/40 hover:text-ash/60'}`}
                      >
                        日K
                      </button>
                    </div>
                    <span className="font-mono text-[11px] text-ash/40">
                      {chartMode === 'minute' ? '当日走势' : '真实日K线 + 均线 + 布林带'}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-ash/30 mt-0.5">当前策略: {selectedStrategy}</div>
                </div>
                <div className="flex items-center gap-3">
                  {chartMode === 'daily' && (
                    <>
                      <span className="font-mono text-[10px] text-ash/30 flex items-center gap-1">
                        <span className="w-3 h-[2px] bg-apex-green inline-block" />MA5
                      </span>
                      <span className="font-mono text-[10px] text-ash/30 flex items-center gap-1">
                        <span className="w-3 h-[2px] bg-gold-standard inline-block" />MA10
                      </span>
                      <span className="font-mono text-[10px] text-ash/30 flex items-center gap-1">
                        <span className="w-3 h-[2px] bg-ash/50 inline-block" />MA20
                      </span>
                      <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: '#E74C3C' }}>
                        <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: '#E74C3C' }} />红涨
                      </span>
                      <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: '#52C41A' }}>
                        <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: '#52C41A' }} />绿跌
                      </span>
                      <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: '#F5A623' }}>
                        <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-[#F5A623] inline-block" />买入
                      </span>
                      <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: '#4A90D9' }}>
                        <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#4A90D9] inline-block" />卖出
                      </span>
                    </>
                  )}
                  {chartMode === 'minute' && (
                    <>
                      <span className="font-mono text-[10px] text-ash/30 flex items-center gap-1">
                        <span className="w-3 h-[2px] bg-pure inline-block" />价格
                      </span>
                      <span className="font-mono text-[10px] text-ash/30 flex items-center gap-1">
                        <span className="w-3 h-[2px] bg-gold-standard inline-block" />均价
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* ═══════ 分时图（同花顺风格） ═══════ */}
              {chartMode === 'minute' && (
                <div className="relative">
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <XAxis
                        dataKey="minuteOffset"
                        type="number"
                        domain={[0, 240]}
                        ticks={[0, 60, 120, 180, 240]}
                        tickFormatter={(v: number) => {
                          switch (v) {
                            case 0: return '09:30';
                            case 60: return '10:30';
                            case 120: return '11:30|13:00';
                            case 180: return '14:00';
                            case 240: return '15:00';
                            default: return '';
                          }
                        }}
                        stroke={chartTheme.axisStroke}
                        tick={{ fill: chartTheme.tickFill, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        tickLine={false}
                        axisLine={{ stroke: chartTheme.axisStroke }}
                      />
                      <YAxis
                        yAxisId="price"
                        domain={['auto', 'auto']}
                        stroke={chartTheme.axisStroke}
                        tick={{ fill: chartTheme.tickFill, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        tickLine={false}
                        axisLine={{ stroke: chartTheme.axisStroke }}
                        width={60}
                        tickFormatter={(v: number) => v.toFixed(2)}
                      />
                      {/* 昨收参考水平线 */}
                      {prevClose > 0 && (
                        <ReferenceLine
                          yAxisId="price"
                          y={prevClose}
                          stroke="#6B6D72"
                          strokeDasharray="3 3"
                          strokeWidth={1}
                          label={{
                            value: `昨收 ${prevClose.toFixed(2)}`,
                            position: 'insideTopRight',
                            fill: '#6B6D72',
                            fontSize: 10,
                            fontFamily: 'JetBrains Mono',
                          }}
                        />
                      )}
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const item = payload[0]?.payload as any;
                          if (!item) return null;
                          const timeStr = item.date ?? '';
                          const price = item.close as number;
                          const avg = item.avg as number;
                          const isUp = typeof price === 'number' && price >= prevClose;
                          const sigType = item.signalType as string;
                          const sigReason = item.signalReason as string;
                          const sigStrategy = item.signalStrategy as string;
                          const sigStrength = item.signalStrength as number;
                          // 查找当前时间点是否有信号
                          const hasSignal = sigType === '买入' || sigType === '卖出';
                          return (
                            <div style={tooltipStyle}>
                              <div style={{ color: '#F4F4F4', fontSize: 11, marginBottom: 4 }}>{timeStr}</div>
                              <div style={{ color: isUp ? '#E74C3C' : '#52C41A' }}>
                                {'价格: '}{typeof price === 'number' ? price.toFixed(2) : '-'}
                              </div>
                              <div style={{ color: COLORS.gold }}>
                                {'均价: '}{typeof avg === 'number' ? avg.toFixed(2) : '-'}
                              </div>
                              {hasSignal && (
                                <div style={{ color: sigType === '买入' ? '#E74C3C' : '#52C41A', fontSize: 10, marginTop: 4, borderTop: '1px solid rgba(206,209,213,0.15)', paddingTop: 4 }}>
                                  <span style={{ fontWeight: 'bold' }}>▲ {sigStrategy} - {sigType}</span>
                                  {sigReason && <div style={{ color: '#9CA3AF', marginTop: 2 }}>{sigReason}</div>}
                                  {sigStrength > 0 && <span style={{ color: '#6B6D72', marginLeft: 8 }}>强度:{sigStrength}</span>}
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="avg"
                        stroke={COLORS.gold}
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="4 4"
                        name="均价"
                      />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="close"
                        stroke={chartData.length > 0 && (chartData[chartData.length - 1] as any).close >= prevClose ? '#E74C3C' : '#52C41A'}
                        strokeWidth={1.5}
                        dot={false}
                        name="价格"
                      />
                      {/* 分时图不再显示买卖信号（信号已迁移至日K线） */}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ═══════ 日K线图（标准同花顺风格） ═══════ */}
              {chartMode === 'daily' && (
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      stroke={chartTheme.axisStroke}
                      tick={{ fill: chartTheme.tickFill, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: chartTheme.axisStroke }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="price"
                      domain={['auto', 'auto']}
                      stroke={chartTheme.axisStroke}
                      tick={{ fill: chartTheme.tickFill, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: chartTheme.axisStroke }}
                      width={60}
                      tickFormatter={(v: number) => v.toFixed(2)}
                    />
                    {/* 支撑压力线 */}
                    {chartData.length > 0 && chartData[0].support !== null && chartData[0].resistance !== null && (
                      <>
                        <ReferenceLine
                          yAxisId="price"
                          y={chartData[0].support ?? 0}
                          stroke={COLORS.up}
                          strokeDasharray="4 4"
                          strokeWidth={1}
                          label={{ value: `支撑 ${(chartData[0].support ?? 0).toFixed(2)}`, position: 'insideTopRight', fill: COLORS.up, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        />
                        <ReferenceLine
                          yAxisId="price"
                          y={chartData[0].resistance ?? 0}
                          stroke={COLORS.down}
                          strokeDasharray="4 4"
                          strokeWidth={1}
                          label={{ value: `压力 ${(chartData[0].resistance ?? 0).toFixed(2)}`, position: 'insideBottomRight', fill: COLORS.down, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        />
                      </>
                    )}
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: COLORS.pure, fontSize: 11 }}
                      formatter={(value: number, name: string) => {
                        if (typeof value === 'number') return [value.toFixed(2), name];
                        return [value, name];
                      }}
                    />
                    {/* 布林带底色 */}
                    <Area
                      yAxisId="price"
                      type="monotone"
                      dataKey="bbUpper"
                      stroke="transparent"
                      fill="rgba(206,209,213,0.05)"
                      connectNulls={false}
                    />
                    {/* 标准K线：Customized SVG，使用recharts xAxis.scale精确对齐均线 */}
                    <Customized
                      component={(props: any) => {
                        const xAxis = props.xAxisMap?.[Object.keys(props.xAxisMap)[0]];
                        const priceAxisKey = Object.keys(props.yAxisMap).find(
                          (k) => props.yAxisMap[k].yAxisId === 'price'
                        ) || Object.keys(props.yAxisMap)[0];
                        const yAxis = props.yAxisMap?.[priceAxisKey];
                        if (!xAxis || !yAxis) return null;
                        const xs = xAxis.scale;
                        const ys = yAxis.scale;
                        const bw = xAxis.bandwidth || 8;
                        const candleW = Math.max(2, Math.min(10, bw * 0.7));
                        return (
                          <g>
                            {chartData.map((d, i) => {
                              if (!d.open || !d.close || !d.high || !d.low) return null;
                              // category scale: 传数据值(date)与Line组件内部完全一致
                              const cx = xs(d.date) + bw / 2;
                              const yHigh = ys(d.high);
                              const yLow = ys(d.low);
                              const yOpen = ys(Math.max(d.open, d.close));
                              const yClose = ys(Math.min(d.open, d.close));
                              const isUp = d.close >= d.open;
                              const color = isUp ? '#E74C3C' : '#52C41A';
                              const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
                              return (
                                <g key={i}>
                                  {/* 影线 */}
                                  <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
                                  {/* 实体 */}
                                  <rect
                                    x={cx - candleW / 2}
                                    y={Math.min(yOpen, yClose)}
                                    width={candleW}
                                    height={bodyH}
                                    fill={color}
                                  />
                                </g>
                              );
                            })}
                          </g>
                        );
                      }}
                    />
                    {/* 均线 */}
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="ma5"
                      stroke={COLORS.up}
                      strokeWidth={1}
                      dot={false}
                      connectNulls={false}
                      name="MA5"
                    />
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="ma10"
                      stroke={COLORS.gold}
                      strokeWidth={1}
                      dot={false}
                      connectNulls={false}
                      name="MA10"
                    />
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="ma20"
                      stroke="rgba(206,209,213,0.4)"
                      strokeWidth={1}
                      dot={false}
                      connectNulls={false}
                      name="MA20"
                    />
                    {/* 买卖标记 */}
                    <Scatter
                      yAxisId="price"
                      dataKey="buyMarker"
                      fill="#F5A623"
                      shape="triangle"
                      name="买入信号"
                    />
                    <Scatter
                      yAxisId="price"
                      dataKey="sellMarker"
                      fill="#4A90D9"
                      shape="triangle"
                      name="卖出信号"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {/* ═══════ 日K策略信号列表 ═══════ */}
              {chartMode === 'daily' && strategySignals.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="font-mono text-[10px] text-ash/40 mb-1 flex justify-between">
                    <span>策略信号 ({strategySignals.length}个) — {selectedStrategy}</span>
                  </div>
                  {strategySignals.slice(-10).map((sig, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-[10px] font-mono px-2 py-1 rounded ${
                        sig.type === '买入'
                          ? 'bg-[rgba(245,166,35,0.08)]'
                          : 'bg-[rgba(74,144,217,0.08)]'
                      }`}
                    >
                      <span className={sig.type === '买入' ? 'text-[#F5A623]' : 'text-[#4A90D9]'}>{sig.type}</span>
                      <span className="text-ash/40">{sig.date}</span>
                      <span className="text-ash/60 flex-1 truncate">{sig.reason}</span>
                      <span className="text-pure">{sig.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ─── Row 2b: Signal History (Reflection) ─── */}
            <motion.div
              className="data-card mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.5, ease: easeExpoOut() }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[11px] text-ash/40 tracking-wider">信号反思反馈</div>
                {accuracyStats && (
                  <div className="font-mono text-[11px] text-ash/50">
                    累计验证: <span className="text-pure">{accuracyStats.correct}/{accuracyStats.total}</span>
                    {' '}准确率 <span className="text-apex-green">{accuracyStats.rate}%</span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[rgba(206,209,213,0.08)]">
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">日期</th>
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">类型</th>
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">策略</th>
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">信号价</th>
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">验证</th>
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">收益率</th>
                      <th className="text-left font-mono text-[10px] text-ash/30 py-2 px-2">触发条件</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 实时信号：当前策略产生的最新信号 */}
                    {data.signals.length > 0 && (() => {
                      const s = data.signals[0];
                      const now = new Date();
                      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                      return (
                        <motion.tr
                          key="realtime-signal"
                          className="border-b border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.04)]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <td className="font-mono text-[11px] text-gold-standard py-2.5 px-2 whitespace-nowrap font-bold">{timeStr}</td>
                          <td className="py-2.5 px-2">
                            <span className="font-mono text-[11px] px-2 py-0.5 font-bold" style={{ color: signalColor(s.type), backgroundColor: signalBg(s.type) }}>
                              {s.type}
                            </span>
                          </td>
                          <td className="font-mono text-[11px] text-gold-standard py-2.5 px-2 font-bold">{selectedStrategy}</td>
                          <td className="font-mono text-[11px] text-pure py-2.5 px-2 font-bold">{(s.priceAtSignal ?? data.stock.price).toFixed(2)}</td>
                          <td className="py-2.5 px-2">
                            <span className="font-mono text-[10px] text-ash/40">盘中实时</span>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="font-mono text-[11px] text-ash/40">--</span>
                          </td>
                          <td className="font-mono text-[10px] text-ash/50 py-2.5 px-2 max-w-[200px] truncate">
                            {s.triggers.join('; ')}
                          </td>
                        </motion.tr>
                      );
                    })()}
                    {/* 策略回测信号：基于当前选中策略生成的验证信号 */}
                    {verifiedSignals.slice().reverse().map((record, idx) => (
                      <motion.tr
                        key={`${record.date}_${record.type}_${idx}`}
                        className="border-b border-[rgba(206,209,213,0.04)] hover:bg-[rgba(206,209,213,0.02)] transition-colors"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + idx * 0.04, duration: 0.3 }}
                      >
                        <td className="font-mono text-[11px] text-ash/50 py-2.5 px-2 whitespace-nowrap">{record.date}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className="font-mono text-[11px] px-2 py-0.5"
                            style={{
                              color: signalColor(record.type),
                              backgroundColor: signalBg(record.type),
                            }}
                          >
                            {record.type}
                          </span>
                        </td>
                        <td className="font-mono text-[11px] text-ash/60 py-2.5 px-2">{selectedStrategy}</td>
                        <td className="font-mono text-[11px] text-pure py-2.5 px-2">{record.price.toFixed(2)}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            {verificationIcon(record.verificationResult)}
                            <span
                              className="font-mono text-[10px]"
                              style={{ color: record.verificationResult === '有效' ? COLORS.up : record.verificationResult === '无效' ? COLORS.down : COLORS.ash }}
                            >
                              {record.verificationResult || '未验证'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          {record.changePercent !== null ? (
                            <span
                              className="font-mono text-[11px]"
                              style={{ color: record.changePercent >= 0 ? COLORS.up : COLORS.down }}
                            >
                              {record.changePercent >= 0 ? '+' : ''}{record.changePercent.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-ash/20">--</span>
                          )}
                        </td>
                        <td className="font-mono text-[10px] text-ash/40 py-2.5 px-2 max-w-[200px] truncate">
                          {record.reason}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {accuracyStats && (
                <div className="mt-4 pt-3 border-t border-[rgba(206,209,213,0.06)] flex items-center justify-between">
                  <span className="font-mono text-[10px] text-ash/30">基于历史信号验证的统计结果</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ash/50">总准确率</span>
                    <span className="font-heading text-xl font-bold" style={{ color: parseFloat(accuracyStats.rate) >= 60 ? COLORS.up : COLORS.gold }}>
                      {accuracyStats.rate}%
                    </span>
                  </div>
                </div>
              )}
            </motion.div>

            {/* ─── Row 3: MACD + KDJ + RSI & Support/Resistance ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* MACD */}
              <motion.div
                className="data-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: easeExpoOut() }}
              >
                <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">MACD</div>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={indicatorChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      stroke={chartTheme.axisStroke}
                      tick={{ fill: chartTheme.tickFill, fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: chartTheme.axisStroke }}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      stroke={chartTheme.axisStroke}
                      tick={{ fill: chartTheme.tickFill, fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: chartTheme.axisStroke }}
                      width={45}
                      tickFormatter={(v: number) => v.toFixed(2)}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [typeof value === 'number' ? value.toFixed(3) : value, name]} />
                    <Bar
                      dataKey="macdHist"
                      barSize={3}
                      fill={COLORS.up}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        const isPositive = payload && payload.macdHist >= 0;
                        return (
                          <rect
                            x={x}
                            y={isPositive ? y : y + height}
                            width={width}
                            height={Math.abs(height)}
                            fill={isPositive ? COLORS.up : COLORS.down}
                            opacity={0.6}
                          />
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="macdDIF" stroke={COLORS.gold} strokeWidth={1} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="macdDEA" stroke="#4A6FA5" strokeWidth={1} dot={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </motion.div>

              {/* KDJ */}
              <motion.div
                className="data-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5, ease: easeExpoOut() }}
              >
                <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">KDJ</div>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={indicatorChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      stroke={chartTheme.axisStroke}
                      tick={{ fill: chartTheme.tickFill, fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: chartTheme.axisStroke }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      stroke={chartTheme.axisStroke}
                      tick={{ fill: chartTheme.tickFill, fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: chartTheme.axisStroke }}
                      width={35}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <ReferenceLine y={80} stroke={COLORS.down} strokeDasharray="3 3" opacity={0.3} />
                    <ReferenceLine y={20} stroke={COLORS.up} strokeDasharray="3 3" opacity={0.3} />
                    <Line type="monotone" dataKey="kdjK" stroke={COLORS.gold} strokeWidth={1} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="kdjD" stroke="#4A6FA5" strokeWidth={1} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="kdjJ" stroke={COLORS.up} strokeWidth={1} dot={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </motion.div>

              {/* RSI + Support/Resistance */}
              <motion.div
                className="data-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: easeExpoOut() }}
              >
                <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">RSI(6) + 支撑/压力</div>
                <RsiGauge value={currentRsi} />
                <div className="mt-4 pt-4 border-t border-[rgba(206,209,213,0.06)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield size={12} className="text-apex-green" />
                      <span className="font-mono text-[11px] text-ash/50">支撑位</span>
                    </div>
                    <span className="font-heading text-lg font-bold" style={{ color: COLORS.up }}>
                      {data.indicators.support.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target size={12} className="text-reversion-red" />
                      <span className="font-mono text-[11px] text-ash/50">压力位</span>
                    </div>
                    <span className="font-heading text-lg font-bold" style={{ color: COLORS.down }}>
                      {data.indicators.resistance.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden flex">
                    <div
                      className="h-full rounded-l-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((data.stock.price - data.indicators.support) / (data.indicators.resistance - data.indicators.support)) * 100))}%`,
                        background: `linear-gradient(90deg, ${COLORS.up}, ${COLORS.gold})`,
                      }}
                    />
                  </div>
                  <p className="font-mono text-[9px] text-ash/30 text-center">
                    当前价距支撑 {Math.abs(((data.stock.price - data.indicators.support) / data.stock.price) * 100).toFixed(2)}%
                    {' / '}
                    距压力 {Math.abs(((data.indicators.resistance - data.stock.price) / data.stock.price) * 100).toFixed(2)}%
                  </p>
                </div>
              </motion.div>
            </div>

            {/* ─── Row 4: Trade Signals ─── */}
            <motion.div
              className="mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.5, ease: easeExpoOut() }}
            >
              <div className="font-mono text-[11px] text-ash/40 mb-3 tracking-wider">买卖信号</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.signals.map((signal, idx) => (
                  <motion.div
                    key={idx}
                    className="data-card"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: 0.5 + idx * 0.1,
                      duration: 0.5,
                      ease: easeExpoOut(),
                    }}
                    style={{
                      borderColor: `${signalColor(signal.type)}30`,
                      boxShadow: `0 0 20px ${signalColor(signal.type)}08`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="font-heading text-2xl font-bold px-3 py-1"
                        style={{
                          color: signalColor(signal.type),
                          backgroundColor: signalBg(signal.type),
                          border: `1px solid ${signalColor(signal.type)}30`,
                        }}
                      >
                        {signal.type}
                      </div>
                      <StarRating count={signal.strength} />
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="font-mono text-[10px] text-ash/40">触发条件</div>
                      {signal.triggers.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Zap size={10} style={{ color: signalColor(signal.type) }} />
                          <span className="font-mono text-xs text-pure">{t}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[rgba(206,209,213,0.06)]">
                      <div>
                        <div className="font-mono text-[9px] text-ash/30">建议价格</div>
                        <div className="font-mono text-sm text-pure">{signal.suggestedPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] text-ash/30">止损</div>
                        <div className="font-mono text-sm" style={{ color: COLORS.down }}>{signal.stopLoss.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] text-ash/30">止盈</div>
                        <div className="font-mono text-sm" style={{ color: COLORS.up }}>{signal.takeProfit.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="mt-3 font-mono text-[9px] text-ash/30">
                      信号时间: {signal.timestamp} / 信号价: {signal.priceAtSignal.toFixed(2)}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Row 5: Signal History moved to Row 2b (below K-Line Chart) */}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════ Bottom Bar ═══════════════ */}
      {monitorCode && (
        <motion.div
          className="fixed bottom-0 left-0 right-0 border-t border-[rgba(206,209,213,0.06)] px-6 py-3 flex items-center justify-between"
          style={{ background: 'rgba(11,12,16,0.95)', backdropFilter: 'blur(8px)' }}
          initial={{ y: 50 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: easeExpoOut() }}
        >
          <div className="flex items-center gap-3">
            <Clock size={14} className="text-gold-standard/70" />
            <span className="font-mono text-[13px] text-ash/70 font-bold">
              {isTradingTime()
                ? `下次刷新: ${formatTimeRemaining(countdown)}`
                : getNextRefreshText()}
            </span>
            {!isTradingTime() && (
              <span className="font-mono text-[11px] px-2 py-0.5 text-gold-standard bg-gold-standard/10 border border-gold-standard/20 font-bold">
                非交易时间
              </span>
            )}
          </div>
          <button
            onClick={loadData}
            disabled={refreshing}
            className="flex items-center gap-1.5 font-mono text-[11px] text-ash/50 hover:text-pure transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            手动刷新
          </button>
        </motion.div>
      )}
    </div>
  );
}
