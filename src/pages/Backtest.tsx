import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
  ReferenceLine, Cell, Scatter,
} from 'recharts';
import {
  Play, TrendingUp, TrendingDown, Activity,
  Shield, Target, BarChart3, Zap, ChevronDown, Calendar, DollarSign,
  Search, Loader2, Sparkles, List, Minus,
} from 'lucide-react';
import {
  queryStock, runRealBacktest,
  type StockInfo, type RealBacktestResult, type EquityPoint, type BacktestTrade,
} from '@/services/stockApi';

import { useApp } from '@/contexts/AppContext';
import { FACTOR_CATEGORIES } from '@/services/factorLibrary';

/* ──────────────────────── constants ──────────────────────── */

const STOCKS = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '300750', name: '宁德时代', industry: '新能源' },
  { code: '300059', name: '东方财富', industry: '金融科技' },
  { code: '002594', name: '比亚迪', industry: '汽车' },
  { code: '000858', name: '五粮液', industry: '白酒' },
  { code: '002475', name: '立讯精密', industry: '电子' },
  { code: '601318', name: '中国平安', industry: '保险' },
  { code: '600036', name: '招商银行', industry: '银行' },
  { code: '000333', name: '美的集团', industry: '家电' },
  { code: '688981', name: '中芯国际', industry: '半导体' },
];

const STRATEGIES = [
  { key: 'trend', name: '趋势跟踪', color: '#00FF94', desc: '跟随市场趋势，顺势而为' },
  { key: 'revert', name: '均值回归', color: '#FF2A6D', desc: '价格偏离均值时反向交易' },
  { key: 'breakout', name: '突破交易', color: '#D4AF37', desc: '突破关键价位时跟进' },
  { key: 'factor', name: '因子选股', color: '#00FF94', desc: '多因子模型精选个股' },
];

// 默认回测时间范围：近3年到今天
const TODAY = new Date().toISOString().slice(0, 10);
const THREE_YEARS_AGO = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type BacktestResult = RealBacktestResult;

/* ──────────────────────── helpers ──────────────────────── */

function easeExpoOut() {
  return [0.16, 1, 0.3, 1] as [number, number, number, number];
}

function calcDrawdown(equity: EquityPoint[]): { date: string; drawdown: number }[] {
  let peak = equity[0]?.value || 0;
  return equity.map((e) => {
    if (e.value > peak) peak = e.value;
    return { date: e.date, drawdown: -((peak - e.value) / peak) * 100 };
  });
}

/* ──────────────────────── sub-components ──────────────────────── */

function MetricCard({ label, value, suffix, color, delay }: {
  label: string; value: string | number; suffix?: string; color?: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.6, delay, ease: easeExpoOut() }}
      className="data-card"
      style={{ perspective: 800 }}
    >
      <p className="font-mono text-[11px] uppercase tracking-widest text-ash/60 mb-2">{label}</p>
      <p
        className="font-heading text-[28px] md:text-[36px] font-bold leading-none"
        style={{ color: color || '#F4F4F4' }}
      >
        {value}
        {suffix && <span className="text-[16px] ml-1 text-ash/50">{suffix}</span>}
      </p>
    </motion.div>
  );
}

function MonthlyHeatmap({ monthlyReturns }: { monthlyReturns: Record<string, number> }) {
  const monthKeys = Object.keys(monthlyReturns).sort();
  const years = [...new Set(monthKeys.map((k) => parseInt(k.split('-')[0])))];
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  const allValues = Object.values(monthlyReturns);
  const maxVal = Math.max(...allValues.map(Math.abs), 0.01);

  const getColor = (val: number) => {
    const intensity = Math.abs(val) / maxVal;
    if (val > 0) {
      return `rgba(0, 255, 148, ${0.15 + intensity * 0.7})`;
    }
    return `rgba(255, 42, 109, ${0.15 + intensity * 0.7})`;
  };

  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-gold-standard" />
        <h3 className="font-heading text-lg text-pure">月度收益热力图</h3>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[60px_repeat(12,1fr)] gap-1">
            <div />
            {months.map((m) => (
              <div key={m} className="text-center font-mono text-[10px] text-ash/50 py-1">{m}</div>
            ))}
            {years.map((year) => (
              <div key={year} className="contents">
                <div className="font-mono text-[11px] text-ash/70 flex items-center">{year}</div>
                {Array.from({ length: 12 }, (_, mi) => {
                  const key = `${year}-${String(mi + 1).padStart(2, '0')}`;
                  const val = monthlyReturns[key] || 0;
                  return (
                    <motion.div
                      key={mi}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: mi * 0.03 }}
                      className="rounded-sm h-8 flex items-center justify-center font-mono text-[10px]"
                      style={{ backgroundColor: getColor(val), color: val > 0 ? '#00FF94' : '#FF2A6D' }}
                      title={`${val.toFixed(2)}%`}
                    >
                      {val.toFixed(1)}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 justify-end">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0,255,148,0.5)' }} />
          <span className="font-mono text-[10px] text-ash/50">正收益</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(255,42,109,0.5)' }} />
          <span className="font-mono text-[10px] text-ash/50">负收益</span>
        </div>
      </div>
    </div>
  );
}

function TradeStats({ result }: { result: BacktestResult }) {
  const sellTrades = result.trades.filter((t) => t.type === '卖出');
  const winTrades = sellTrades.filter((t) => (t.plPct || 0) > 0);
  const lossTrades = sellTrades.filter((t) => (t.plPct || 0) <= 0);
  const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + (t.plPct || 0), 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((s, t) => s + (t.plPct || 0), 0) / lossTrades.length : 0;

  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">交易统计</h3>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center py-2 border-b border-[rgba(206,209,213,0.08)]">
          <span className="font-mono text-[12px] text-ash/60">总交易次数</span>
          <span className="font-mono text-[14px] text-pure">{result.totalTrades}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-[rgba(206,209,213,0.08)]">
          <span className="font-mono text-[12px] text-ash/60">平均盈利</span>
          <span className="font-mono text-[14px] text-apex-green">+{avgWin.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-[rgba(206,209,213,0.08)]">
          <span className="font-mono text-[12px] text-ash/60">平均亏损</span>
          <span className="font-mono text-[14px] text-reversion-red">{avgLoss.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-[rgba(206,209,213,0.08)]">
          <span className="font-mono text-[12px] text-ash/60">最佳交易</span>
          <span className="font-mono text-[14px] text-apex-green">+{result.bestReturn.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="font-mono text-[12px] text-ash/60">最差交易</span>
          <span className="font-mono text-[14px] text-reversion-red">{result.worstReturn.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function WinLossDistribution({ distribution }: { distribution: Record<string, number> }) {
  const data = Object.entries(distribution).map(([range, count]) => {
    const isProfit = range.startsWith('盈利');
    return { range, count, fill: isProfit ? '#00FF94' : '#FF2A6D' };
  });

  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-4">
        <Target size={16} className="text-reversion-red" />
        <h3 className="font-heading text-lg text-pure">盈亏分布</h3>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(206,209,213,0.08)" />
          <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#CED1D5' }} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11, fill: '#CED1D5' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#15161A', border: '1px solid rgba(206,209,213,0.15)', fontSize: 12 }}
            labelStyle={{ color: '#F4F4F4' }}
          />
          <Bar dataKey="count" name="交易次数" radius={[2, 2, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ──────────────────────── Daily Return Table ──────────────────────── */

interface DailyReturnRow {
  date: string;
  nav: number;
  dailyReturn: number;
  cumulativeReturn: number;
  drawdown: number;
  trade?: string;
}

function DailyReturnTable({ equityCurve, trades }: { equityCurve: EquityPoint[]; trades: BacktestTrade[] }) {
  const rows = useMemo<DailyReturnRow[]>(() => {
    if (!equityCurve || equityCurve.length < 2) return [];
    const initial = equityCurve[0]?.value || 1;
    const peakRef = { value: initial };
    const tradeMap = new Map<string, BacktestTrade[]>();
    trades.forEach((t) => {
      const list = tradeMap.get(t.date) || [];
      list.push(t);
      tradeMap.set(t.date, list);
    });
    return equityCurve.map((pt, i) => {
      const prev = i > 0 ? equityCurve[i - 1].value : initial;
      const dailyReturn = i === 0 ? 0 : (pt.value - prev) / prev;
      const cumulativeReturn = (pt.value - initial) / initial;
      if (pt.value > peakRef.value) peakRef.value = pt.value;
      const drawdown = (pt.value - peakRef.value) / peakRef.value;
      const dayTrades = tradeMap.get(pt.date);
      const tradeStr = dayTrades?.map((t) => `${t.type}${t.type === '卖出' && t.plPct !== undefined ? `(${t.plPct > 0 ? '+' : ''}${t.plPct}%)` : ''}`).join(', ');
      return {
        date: pt.date,
        nav: pt.value,
        dailyReturn,
        cumulativeReturn,
        drawdown,
        trade: tradeStr,
      };
    });
  }, [equityCurve, trades]);

  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">日收益明细</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">{rows.length}个交易日</span>
      </div>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#15161A] z-10">
            <tr className="border-b border-[rgba(206,209,213,0.12)]">
              <th className="text-left font-mono text-[10px] text-ash/40 py-2 px-3">日期</th>
              <th className="text-right font-mono text-[10px] text-ash/40 py-2 px-3">净值</th>
              <th className="text-right font-mono text-[10px] text-ash/40 py-2 px-3">日收益</th>
              <th className="text-right font-mono text-[10px] text-ash/40 py-2 px-3">累计收益</th>
              <th className="text-right font-mono text-[10px] text-ash/40 py-2 px-3">回撤</th>
              <th className="text-left font-mono text-[10px] text-ash/40 py-2 px-3">交易</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={r.date}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.005, 0.5), duration: 0.2 }}
                className="border-b border-[rgba(206,209,213,0.04)] hover:bg-[rgba(206,209,213,0.02)]"
              >
                <td className="font-mono text-[11px] text-ash/60 py-1.5 px-3">{r.date}</td>
                <td className="font-mono text-[11px] text-pure py-1.5 px-3 text-right">{r.nav.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                <td className={`font-mono text-[11px] py-1.5 px-3 text-right ${r.dailyReturn >= 0 ? 'text-apex-green' : 'text-reversion-red'}`}>
                  {r.dailyReturn >= 0 ? '+' : ''}{(r.dailyReturn * 100).toFixed(2)}%
                </td>
                <td className={`font-mono text-[11px] py-1.5 px-3 text-right ${r.cumulativeReturn >= 0 ? 'text-apex-green' : 'text-reversion-red'}`}>
                  {r.cumulativeReturn >= 0 ? '+' : ''}{(r.cumulativeReturn * 100).toFixed(2)}%
                </td>
                <td className="font-mono text-[11px] text-reversion-red py-1.5 px-3 text-right">
                  {(r.drawdown * 100).toFixed(2)}%
                </td>
                <td className="font-mono text-[10px] py-1.5 px-3">
                  {r.trade && (
                    <span className={`px-1.5 py-0.5 rounded ${r.trade.includes('买入') ? 'bg-apex-green/10 text-apex-green' : r.trade.includes('卖出') ? 'bg-reversion-red/10 text-reversion-red' : ''}`}>
                      {r.trade}
                    </span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────── Trade Log ──────────────────────── */

function TradeLog({ trades }: { trades: BacktestTrade[] }) {
  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-4">
        <List size={16} className="text-gold-standard" />
        <h3 className="font-heading text-lg text-pure">交易流水</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">共{trades.length}笔</span>
      </div>
      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Minus size={20} className="text-ash/20 mb-2" />
          <span className="font-mono text-xs text-ash/30">本回测周期内无交易</span>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#15161A] z-10">
              <tr className="border-b border-[rgba(206,209,213,0.12)]">
                <th className="text-left font-mono text-[10px] text-ash/40 py-2 px-3">序号</th>
                <th className="text-left font-mono text-[10px] text-ash/40 py-2 px-3">日期</th>
                <th className="text-left font-mono text-[10px] text-ash/40 py-2 px-3">类型</th>
                <th className="text-right font-mono text-[10px] text-ash/40 py-2 px-3">价格</th>
                <th className="text-right font-mono text-[10px] text-ash/40 py-2 px-3">盈亏</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <motion.tr
                  key={`${t.date}-${i}`}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.5), duration: 0.2 }}
                  className="border-b border-[rgba(206,209,213,0.04)] hover:bg-[rgba(206,209,213,0.02)]"
                >
                  <td className="font-mono text-[11px] text-ash/40 py-2 px-3">{i + 1}</td>
                  <td className="font-mono text-[11px] text-ash/60 py-2 px-3">{t.date}</td>
                  <td className="py-2 px-3">
                    <span className={`font-mono text-[11px] px-2 py-0.5 rounded ${t.type === '买入' ? 'bg-apex-green/10 text-apex-green' : 'bg-reversion-red/10 text-reversion-red'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-pure py-2 px-3 text-right">{t.price.toFixed(2)}</td>
                  <td className="font-mono text-[11px] py-2 px-3 text-right">
                    {t.plPct !== undefined ? (
                      <span className={t.plPct >= 0 ? 'text-apex-green' : 'text-reversion-red'}>
                        {t.plPct >= 0 ? '+' : ''}{t.plPct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-ash/30">-</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── main page ──────────────────────── */

export default function Backtest() {
  const [stockInput, setStockInput] = useState('600519');
  const [selectedStock, setSelectedStock] = useState('600519');
  const [selectedStockName, setSelectedStockName] = useState('贵州茅台');
  const [apiStock, setApiStock] = useState<StockInfo | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(STRATEGIES[1].key);
  const [startDate, setStartDate] = useState(THREE_YEARS_AGO);
  const [endDate, setEndDate] = useState(TODAY);
  const [capital, setCapital] = useState(1000000);
  const [hasRun, setHasRun] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [showDropdown, setShowDropdown] = useState<string | null>(null);

  // Custom strategy state
  const [customName, setCustomName] = useState('我的自定义策略');
  const [customEntry, setCustomEntry] = useState('');
  const [customExit, setCustomExit] = useState('');
  const [customStopLoss, setCustomStopLoss] = useState(8);
  const [customTakeProfit, setCustomTakeProfit] = useState(15);
  const [customHoldPeriod, setCustomHoldPeriod] = useState(20);
  const [showGuide, setShowGuide] = useState(false);

  // Factor selection state
  const [selectedFactors, setSelectedFactors] = useState<string[]>([
    'trend_ma_cross', 'momentum_rsi', 'volume_ratio', 'volatility_bb'
  ]);
  const [factorWeights, setFactorWeights] = useState<Record<string, number>>({
    'trend_ma_cross': 0.3, 'momentum_rsi': 0.3, 'volume_ratio': 0.2, 'volatility_bb': 0.2
  });
  const [showFactorPanel, setShowFactorPanel] = useState(false);

  const { customStrategies } = useApp();

  const selectedStrategyObj = STRATEGIES.find((s) => s.key === selectedStrategy);
  const selectedCustomObj = customStrategies.find((s) => s.id === selectedStrategy);
  const selectedCustomStrategy = selectedCustomObj || null;
  const isCustomSelected = !!selectedCustomObj;

  // Sync custom strategy params when a custom strategy is selected
  useEffect(() => {
    if (selectedCustomObj) {
      setCustomName(selectedCustomObj.name);
      const entry = selectedCustomObj.elements.find((e) => e.type === 'entry');
      const exit = selectedCustomObj.elements.find((e) => e.type === 'exit');
      const risk = selectedCustomObj.elements.find((e) => e.type === 'risk');
      setCustomEntry(entry?.description || entry?.name || '');
      setCustomExit(exit?.description || exit?.name || '');
      const stopPct = risk?.params?.find((p) => p.name === 'stopPct')?.value;
      const trailPct = risk?.params?.find((p) => p.name === 'trailPct')?.value;
      if (typeof stopPct === 'number') setCustomStopLoss(stopPct);
      if (typeof trailPct === 'number') setCustomTakeProfit(trailPct);
    }
  }, [selectedCustomObj]);

  // 查询股票（API优先）
  const handleStockSearch = useCallback(async () => {
    const code = stockInput.trim();
    if (!/^\d{6}$/.test(code)) return;

    setStockLoading(true);

    // 1. 尝试API
    const realData = await queryStock(code);
    if (realData) {
      setApiStock(realData);
      setSelectedStock(code);
      setSelectedStockName(realData.name);
      setStockLoading(false);
      return;
    }

    // 2. 回退到本地库
    const known = STOCKS.find((s) => s.code === code);
    if (known) {
      setSelectedStock(code);
      setSelectedStockName(known.name);
    } else {
      setSelectedStock(code);
      setSelectedStockName(`股票(${code})`);
    }
    setStockLoading(false);
  }, [stockInput]);

  const handleStockKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleStockSearch();
  };

  const runBacktest = useCallback(async () => {
    setLoading(true);
    try {
      let customParamData = undefined;
      // 检查是否是策略实验室的自定义策略
      if (selectedCustomStrategy) {
        const risk = selectedCustomStrategy.elements.find((e) => e.type === 'risk');
        customParamData = {
          stopLoss: Number(risk?.params?.find((p) => p.name === 'stopPct')?.value || 8),
          takeProfit: Number(risk?.params?.find((p) => p.name === 'trailPct')?.value || 15),
          holdPeriod: 20,
        };
      } else if (selectedStrategy === 'custom') {
        customParamData = {
          stopLoss: customStopLoss,
          takeProfit: customTakeProfit,
          holdPeriod: customHoldPeriod,
        };
      } else if (selectedStrategy === 'factor') {
        customParamData = {
          selectedFactors,
          factorWeights,
        };
      }
      const strategyKey = selectedCustomStrategy ? 'custom' : selectedStrategy;
      const res = await runRealBacktest(
        selectedStock,
        strategyKey,
        startDate,
        endDate,
        capital,
        customParamData,
      );
      if (res) {
        setResult(res);
        setHasRun(true);
      } else {
        console.warn(`[Backtest] 回测失败：无法获取 ${selectedStock} 的历史数据`);
        // 通过设置空结果来触发UI的无数据状态
        setResult(null);
        setHasRun(false);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStock, selectedStrategy, selectedCustomStrategy, startDate, endDate, capital, customStopLoss, customTakeProfit, customHoldPeriod, selectedFactors, factorWeights]);

  const formatCurrency = useMemo(() => {
    return (v: number) => `¥${(v / 10000).toFixed(1)}万`;
  }, []);

  const drawdownData = useMemo(() => {
    if (!result?.equityCurve.length) return [];
    return calcDrawdown(result.equityCurve);
  }, [result?.equityCurve]);

  const equityWithMarkers = useMemo(() => {
    if (!result) return [];
    return result.equityCurve.map((pt) => {
      const dayTrades = result.trades.filter((t) => t.date === pt.date);
      const buyMarker = dayTrades.find((t) => t.type === '买入') ? pt.value : null;
      const sellMarker = dayTrades.find((t) => t.type === '卖出') ? pt.value : null;
      return { ...pt, buyMarker, sellMarker };
    });
  }, [result]);

  return (
    <div className="min-h-[100dvh] bg-void pt-16">
      {/* ─── Hero / Control Panel ─── */}
      <section className="relative bg-void border-b border-[rgba(206,209,213,0.08)]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeExpoOut() }}
          >
            <h1 className="font-heading text-h2 text-pure mb-2">回测模拟器</h1>
            <p className="font-mono text-caption text-ash/60 mb-8">
              BACKTEST_ENGINE v4.2.1 — 深度历史回测与性能分析
            </p>
          </motion.div>

          {/* Control Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: easeExpoOut() }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
          >
            {/* Stock Selector - Input */}
            <div className="relative">
              <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">标的股票</label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded hover:border-apex-green/40 transition-colors">
                  <Search size={14} className="text-ash/40 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => setStockInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={handleStockKeyDown}
                    onBlur={handleStockSearch}
                    placeholder="输入6位股票代码"
                    className="w-full bg-transparent font-mono text-sm text-pure outline-none placeholder:text-ash/30"
                  />
                </div>
                <button
                  onClick={handleStockSearch}
                  disabled={stockLoading}
                  className="px-3 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded hover:border-apex-green/40 transition-colors disabled:opacity-50"
                >
                  {stockLoading ? <Loader2 size={14} className="text-ash/50 animate-spin" /> : <Search size={14} className="text-ash/50" />}
                </button>
              </div>
              {selectedStockName && (
                <p className="mt-1.5 font-mono text-[11px] text-apex-green">
                  {apiStock ? '【实时】' : '【本地】'} {selectedStockName} ({selectedStock})
                  {apiStock && ` 现价:¥${apiStock.price.toFixed(2)} PE:${apiStock.pe.toFixed(1)}`}
                </p>
              )}
            </div>

            {/* Strategy Selector */}
            <div className="relative">
              <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">交易策略</label>
              <button
                onClick={() => setShowDropdown(showDropdown === 'strategy' ? null : 'strategy')}
                className="w-full flex items-center justify-between px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded hover:border-apex-green/40 transition-colors"
              >
                <span className="font-mono text-sm text-pure">
                  {selectedStrategyObj?.name || selectedCustomObj?.name || '选择策略'}
                </span>
                <ChevronDown size={14} className="text-ash/50" />
              </button>
              <AnimatePresence>
                {showDropdown === 'strategy' && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 right-0 mt-1 z-30 bg-deep-space border border-[rgba(206,209,213,0.15)] rounded"
                  >
                    {STRATEGIES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => { setSelectedStrategy(s.key); setShowDropdown(null); }}
                        className={`w-full text-left px-4 py-2.5 font-mono text-sm hover:bg-[rgba(0,255,148,0.08)] transition-colors ${
                          selectedStrategy === s.key ? 'text-apex-green' : 'text-ash'
                        }`}
                      >
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </button>
                    ))}
                    <div className="px-3 py-1 border-t border-[rgba(206,209,213,0.06)]">
                      <span className="font-mono text-[9px] text-ash/30">自定义策略</span>
                    </div>
                    {customStrategies.length > 0 ? (
                      customStrategies.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setSelectedStrategy(s.id); setShowDropdown(null); }}
                          className={`w-full text-left px-3 py-2 font-mono text-[12px] hover:bg-[rgba(0,255,148,0.08)] transition-colors ${
                            selectedStrategy === s.id ? 'text-apex-green' : 'text-ash'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 font-mono text-[11px] text-ash/30 italic">
                        暂无自定义策略，前往策略实验室创建
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Factor Selection Panel */}
            {selectedStrategy === 'factor' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="lg:col-span-5 overflow-hidden"
              >
                <div className="mt-2 p-4 bg-deep-space/60 border border-[rgba(206,209,213,0.1)] rounded">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-gold-standard" />
                      <span className="font-heading text-sm text-pure">多因子模型配置</span>
                    </div>
                    <button
                      onClick={() => setShowFactorPanel(!showFactorPanel)}
                      className="font-mono text-[10px] text-ash/50 hover:text-gold-standard transition-colors"
                    >
                      {showFactorPanel ? '收起' : '展开'}配置
                    </button>
                  </div>
                  <p className="text-[11px] text-ash/40 mb-3">综合评分 = Σ(因子得分 × 权重) / Σ权重，得分≥60买入</p>

                  {showFactorPanel && (
                    <div className="space-y-3">
                      {FACTOR_CATEGORIES.map((cat) => (
                        <div key={cat.name}>
                          <p className="font-mono text-[10px] text-ash/40 mb-1.5 uppercase">{cat.name}</p>
                          <div className="space-y-1.5">
                            {cat.factors.map((f) => (
                              <div key={f.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedFactors.includes(f.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedFactors(prev => [...prev, f.id]);
                                      setFactorWeights(prev => ({ ...prev, [f.id]: f.defaultWeight }));
                                    } else {
                                      setSelectedFactors(prev => prev.filter(id => id !== f.id));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 accent-apex-green"
                                />
                                <span className="text-[11px] text-ash/70 flex-1">{f.name}</span>
                                {selectedFactors.includes(f.id) && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-ash/30">权重</span>
                                    <input
                                      type="number"
                                      value={factorWeights[f.id] || 0}
                                      onChange={(e) => setFactorWeights(prev => ({ ...prev, [f.id]: Number(e.target.value) }))}
                                      min={0} max={1} step={0.05}
                                      className="w-14 px-1 py-0.5 bg-deep-space/80 border border-[rgba(206,209,213,0.1)] rounded font-mono text-[10px] text-pure text-center outline-none"
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-[rgba(206,209,213,0.06)] flex justify-between">
                        <span className="text-[10px] text-ash/40">已选 {selectedFactors.length} 个因子</span>
                        <span className="text-[10px] text-ash/40">总权重: {Object.values(factorWeights).filter((_, i) => selectedFactors.includes(Object.keys(factorWeights)[i])).reduce((a, b) => a + b, 0).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Date Range */}
            <div className="relative">
              <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">开始日期</label>
              <div className="flex items-center px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded hover:border-apex-green/40 transition-colors">
                <Calendar size={12} className="text-ash/40 mr-2 shrink-0" />
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-transparent font-mono text-sm text-pure outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="relative">
              <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">结束日期</label>
              <div className="flex items-center px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded hover:border-apex-green/40 transition-colors">
                <Calendar size={12} className="text-ash/40 mr-2 shrink-0" />
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={TODAY}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-transparent font-mono text-sm text-pure outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Capital & Run Button */}
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">初始资金</label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded">
                  <DollarSign size={12} className="text-ash/40 mr-1" />
                  <input
                    type="number"
                    value={capital}
                    onChange={(e) => setCapital(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm text-pure outline-none"
                    min={100000}
                    step={100000}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Custom Strategy Panel */}
          <AnimatePresence>
            {isCustomSelected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: easeExpoOut() }}
                className="overflow-hidden"
              >
                <div className="mt-6 p-5 bg-deep-space/60 border border-[rgba(212,175,55,0.2)] rounded data-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={16} className="text-gold-standard" />
                    <h3 className="font-heading text-base text-pure">{selectedCustomObj?.name || '自定义策略参数'}</h3>
                    <span className="font-mono text-[10px] text-ash/40 ml-2">CUSTOM_STRATEGY_CONFIG</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">策略名称</label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors"
                        placeholder="输入策略名称"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">止损比例 (%)</label>
                      <input
                        type="number"
                        value={customStopLoss}
                        onChange={(e) => setCustomStopLoss(Number(e.target.value))}
                        className="w-full px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors"
                        min={1}
                        max={50}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">止盈比例 (%)</label>
                      <input
                        type="number"
                        value={customTakeProfit}
                        onChange={(e) => setCustomTakeProfit(Number(e.target.value))}
                        className="w-full px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors"
                        min={1}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">持仓周期 (天)</label>
                      <input
                        type="number"
                        value={customHoldPeriod}
                        onChange={(e) => setCustomHoldPeriod(Number(e.target.value))}
                        className="w-full px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors"
                        min={1}
                        max={252}
                        step={1}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">入场规则</label>
                      <textarea
                        value={customEntry}
                        onChange={(e) => setCustomEntry(e.target.value)}
                        className="w-full px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors resize-none"
                        rows={2}
                        placeholder="描述你的入场条件（如：5日均线上穿20日均线）"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block font-mono text-[11px] uppercase tracking-wider text-ash/50 mb-2">出场规则</label>
                      <textarea
                        value={customExit}
                        onChange={(e) => setCustomExit(e.target.value)}
                        className="w-full px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors resize-none"
                        rows={2}
                        placeholder="描述你的出场条件（如：5日均线下穿20日均线或达到止盈位）"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Strategy Build Guide */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: easeExpoOut() }}
            className="mt-4"
          >
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-2 font-mono text-[12px] text-ash/50 hover:text-gold-standard transition-colors"
            >
              <Shield size={14} />
              <span>{showGuide ? '收起' : '展开'}策略构建指南</span>
              <ChevronDown size={12} className={`transition-transform duration-300 ${showGuide ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showGuide && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: easeExpoOut() }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-5 bg-deep-space/40 border border-[rgba(206,209,213,0.08)] rounded data-card">
                    <h3 className="font-heading text-base text-pure mb-4">如何构建量化策略</h3>
                    <div className="space-y-4 font-mono text-[12px] text-ash/70 leading-relaxed">
                      <div>
                        <p className="text-gold-standard font-bold mb-2">一、策略要素</p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>入场信号：什么条件下买入？（如：5日均线上穿20日均线）</li>
                          <li>出场信号：什么条件下卖出？（如：5日均线下穿20日均线）</li>
                          <li>止损规则：亏损多少止损？（建议5%-10%）</li>
                          <li>止盈规则：盈利多少止盈？（建议10%-20%）</li>
                          <li>仓位管理：每次投入多少资金？（建议不超过总资金20%）</li>
                        </ol>
                      </div>
                      <div>
                        <p className="text-gold-standard font-bold mb-2">二、常见策略模板</p>
                        <div className="space-y-2 ml-2">
                          <div>
                            <p className="text-pure font-medium">1. 均线交叉策略</p>
                            <p className="ml-3 text-ash/50">- 买入：短期均线（5日）上穿长期均线（20日）</p>
                            <p className="ml-3 text-ash/50">- 卖出：短期均线下穿长期均线</p>
                            <p className="ml-3 text-ash/50">- 适用于：趋势明显的股票</p>
                          </div>
                          <div>
                            <p className="text-pure font-medium">2. RSI超买超卖策略</p>
                            <p className="ml-3 text-ash/50">- 买入：RSI &lt; 30（超卖）</p>
                            <p className="ml-3 text-ash/50">- 卖出：RSI &gt; 70（超买）</p>
                            <p className="ml-3 text-ash/50">- 适用于：震荡行情</p>
                          </div>
                          <div>
                            <p className="text-pure font-medium">3. 布林带突破策略</p>
                            <p className="ml-3 text-ash/50">- 买入：价格触及下轨且反弹</p>
                            <p className="ml-3 text-ash/50">- 卖出：价格触及上轨且回落</p>
                            <p className="ml-3 text-ash/50">- 适用于：波动较大的股票</p>
                          </div>
                          <div>
                            <p className="text-pure font-medium">4. MACD金叉死叉策略</p>
                            <p className="ml-3 text-ash/50">- 买入：MACD线上穿信号线（金叉）</p>
                            <p className="ml-3 text-ash/50">- 卖出：MACD线下穿信号线（死叉）</p>
                            <p className="ml-3 text-ash/50">- 适用于：中长线趋势</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-gold-standard font-bold mb-2">三、策略评估标准</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>夏普比率 &gt; 1.0：策略可用</li>
                          <li>最大回撤 &lt; 20%：风险可控</li>
                          <li>胜率 &gt; 45%：具有正期望值</li>
                          <li>盈亏比 &gt; 1.5：收益大于风险</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Run Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: easeExpoOut() }}
            className="mt-6"
          >
            <button
              onClick={runBacktest}
              disabled={loading}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-apex-green text-void font-mono text-sm font-bold uppercase tracking-wider rounded overflow-hidden hover:shadow-glow-green transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} className="group-hover:scale-110 transition-transform" />}
              {loading ? '回测中...' : '运行回测'}
              <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ─── Results Dashboard ─── */}
      <AnimatePresence>
        {hasRun && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: easeExpoOut() }}
          >
            {/* Performance Summary Cards */}
            <section className="bg-deep-space py-12 lg:py-16">
              <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                <div className="flex items-center gap-3 mb-6">
                  <Zap size={18} className="text-apex-green" />
                  <h2 className="font-heading text-h2 text-pure">性能指标</h2>
                  <span className="font-mono text-[11px] text-ash/40 ml-2">
                    {selectedStockName} &middot; {selectedStrategyObj?.name || selectedCustomObj?.name} &middot; {startDate} 至 {endDate}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="累计收益" value={`${result.totalReturn.toFixed(1)}%`} color="#00FF94" delay={0} />
                  <MetricCard label="年化收益" value={`${result.annualizedReturn.toFixed(1)}%`} color="#00FF94" delay={0.08} />
                  <MetricCard label="夏普比率" value={result.sharpeRatio.toFixed(2)} color="#D4AF37" delay={0.16} />
                  <MetricCard label="最大回撤" value={`${result.maxDrawdown.toFixed(1)}%`} color="#FF2A6D" delay={0.24} />
                  <MetricCard label="胜率" value={`${result.winRate.toFixed(1)}%`} color="#00FF94" delay={0.32} />
                  <MetricCard label="波动率" value={`${result.volatility.toFixed(1)}%`} delay={0.40} />
                  <MetricCard label="总交易" value={result.totalTrades} delay={0.48} />
                  <MetricCard label="盈利次数" value={result.winningTrades} color="#00FF94" delay={0.56} />
                </div>
                {/* ═══ 交易费用明细 ═══ */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <MetricCard label="总交易成本" value={`${(result as any).totalFeeCost?.toFixed?.(2) || '0.00'}元`} color="#F5A623" delay={0.6} />
                  <MetricCard label="平均费用/笔" value={`${((result as any).avgFeePerTrade * 100 || 0).toFixed(3)}%`} color="#F5A623" delay={0.64} />
                  <MetricCard label="净收益(扣费后)" value={`${(result.totalReturn - ((result as any).totalFeeCost || 0) * 100 / 10000).toFixed(1)}%`} color="#00FF94" delay={0.68} />
                </div>
              </div>
            </section>

            {/* Equity Curve & Drawdown */}
            <section className="bg-void py-12 lg:py-16">
              <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                {/* Equity Curve */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.2, ease: easeExpoOut() }}
                  className="data-card mb-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-apex-green" />
                      <h3 className="font-heading text-lg text-pure">权益曲线</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-[2px] bg-apex-green" />
                        <span className="font-mono text-[10px] text-ash/60">策略收益</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-apex-green" />
                        <span className="font-mono text-[10px] text-ash/60">买入</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-reversion-red" />
                        <span className="font-mono text-[10px] text-ash/60">卖出</span>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={380}>
                    <AreaChart data={equityWithMarkers} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00FF94" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#00FF94" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(206,209,213,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#CED1D5' }} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11, fill: '#CED1D5' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#15161A', border: '1px solid rgba(206,209,213,0.15)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: '#F4F4F4', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                        formatter={(value: number) => [formatCurrency(value), '']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#00FF94" strokeWidth={2} fill="url(#equityGrad)" name="策略净值" dot={false} />
                      <Scatter dataKey="buyMarker" fill="#00FF94" shape="triangle" legendType="triangle" name="买入" />
                      <Scatter dataKey="sellMarker" fill="#FF2A6D" shape="triangle" legendType="triangle" name="卖出" />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Drawdown Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.35, ease: easeExpoOut() }}
                  className="data-card"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingDown size={16} className="text-reversion-red" />
                    <h3 className="font-heading text-lg text-pure">回撤曲线</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={drawdownData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FF2A6D" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#FF2A6D" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(206,209,213,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#CED1D5' }} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11, fill: '#CED1D5' }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#15161A', border: '1px solid rgba(206,209,213,0.15)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: '#F4F4F4', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                        formatter={(value: number) => [`${(value as number).toFixed(2)}%`, '回撤']}
                      />
                      <ReferenceLine y={0} stroke="rgba(206,209,213,0.2)" strokeDasharray="2 2" />
                      <Area type="monotone" dataKey="drawdown" stroke="#FF2A6D" strokeWidth={1.5} fill="url(#ddGrad)" name="回撤" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              </div>
            </section>

            {/* Monthly Heatmap & Trade Stats */}
            <section className="bg-deep-space py-12 lg:py-16">
              <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2, ease: easeExpoOut() }}
                    className="lg:col-span-2"
                  >
                    <MonthlyHeatmap monthlyReturns={result.monthlyReturns} />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.35, ease: easeExpoOut() }}
                  >
                    <TradeStats result={result} />
                  </motion.div>
                </div>
              </div>
            </section>

            {/* Win/Loss Distribution & Backtest Info */}
            <section className="bg-void py-12 lg:py-16">
              <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2, ease: easeExpoOut() }}
                  >
                    <WinLossDistribution distribution={result.tradeDistribution} />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.35, ease: easeExpoOut() }}
                    className="data-card"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Shield size={16} className="text-gold-standard" />
                      <h3 className="font-heading text-lg text-pure">回测信息</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b border-[rgba(206,209,213,0.08)]">
                        <span className="font-mono text-[12px] text-ash/60">实际起始日</span>
                        <span className="font-mono text-[14px] text-pure">{result.actualStart}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-[rgba(206,209,213,0.08)]">
                        <span className="font-mono text-[12px] text-ash/60">实际结束日</span>
                        <span className="font-mono text-[14px] text-pure">{result.actualEnd}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-[rgba(206,209,213,0.08)]">
                        <span className="font-mono text-[12px] text-ash/60">总收益率</span>
                        <span className="font-mono text-[16px] font-bold text-apex-green">+{result.totalReturn.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-[rgba(206,209,213,0.08)]">
                        <span className="font-mono text-[12px] text-ash/60">年化收益率</span>
                        <span className="font-mono text-[16px] font-bold text-apex-green">+{result.annualizedReturn.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-[rgba(206,209,213,0.08)]">
                        <span className="font-mono text-[12px] text-ash/60">最大回撤</span>
                        <span className="font-mono text-[16px] text-reversion-red">{result.maxDrawdown.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-3">
                        <span className="font-mono text-[12px] text-ash/60">夏普比率</span>
                        <span className="font-mono text-[16px] font-bold text-gold-standard">{result.sharpeRatio.toFixed(2)}</span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </section>

            {/* Daily Returns Table */}
            <section className="bg-deep-space py-12 lg:py-16">
              <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease: easeExpoOut() }}
                >
                  <DailyReturnTable equityCurve={result.equityCurve} trades={result.trades} />
                </motion.div>
              </div>
            </section>

            {/* Trade Log */}
            <section className="bg-void py-12 lg:py-16">
              <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease: easeExpoOut() }}
                >
                  <TradeLog trades={result.trades} />
                </motion.div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
