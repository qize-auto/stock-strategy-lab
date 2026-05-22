import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { TrendingUp, Activity, BarChart3, Zap, Globe, Percent, Loader2 } from 'lucide-react';
import { queryStock, BUILT_IN_STOCKS, inferIndustry } from '@/services/stockApi';
import type { StockInfo } from '@/services/stockApi';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface StockData {
  code: string;
  name: string;
  sector: string;
  marketCap: string;
  price: number;
  change: number;
  pe: number;
  pb: number;
  high52: number;
  low52: number;
  radar: {
    marketCap: number;
    liquidity: number;
    volatility: number;
    momentum: number;
    valuation: number;
    sectorAlpha: number;
  };
  history: { date: string; price: number }[];
}

// ─────────────────────────────────────────────
// Hot Stocks for quick select
// ─────────────────────────────────────────────

const HOT_STOCK_CODES = ['600519', '600036', '002594', '300750', '601318', '000858', '000333', '300059', '600030', '002475'];

// ─────────────────────────────────────────────
// Helpers: Data generation
// ─────────────────────────────────────────────

function formatMarketCap(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(1) + '万亿';
  if (value >= 1e8) return Math.round(value / 1e8) + '亿';
  if (value >= 1e4) return Math.round(value / 1e4) + '万';
  return Math.round(value).toString();
}

function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateRadar(code: string, _rng: () => number) {
  const seed = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = createRng(seed);
  // Consume some random values to desynchronize
  for (let i = 0; i < 5; i++) r();
  return {
    marketCap: Math.round(30 + r() * 65),
    liquidity: Math.round(40 + r() * 55),
    volatility: Math.round(20 + r() * 75),
    momentum: Math.round(25 + r() * 70),
    valuation: Math.round(20 + r() * 75),
    sectorAlpha: Math.round(30 + r() * 65),
  };
}

function generateHistory(_code: string, price: number, rng: () => number) {
  const history: { date: string; price: number }[] = [];
  let current = price * (0.85 + rng() * 0.15);
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    const change = (rng() - 0.48) * 0.04;
    current = current * (1 + change);
    history.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
      price: Math.round(current * 100) / 100,
    });
  }
  // Ensure the last point matches current price
  if (history.length > 0) {
    history[history.length - 1].price = price;
  }
  return history;
}

function generateRadarFromReal(realData: StockInfo) {
  const capScore = Math.min(100, realData.marketCap > 0 ? Math.log10(realData.marketCap) * 15 : 50);
  const peScore = realData.pe > 0 ? Math.min(100, Math.max(10, 100 - realData.pe)) : 50;
  const pbScore = realData.pb > 0 ? Math.min(100, Math.max(10, 100 - realData.pb * 10)) : 50;
  const changeScore = Math.min(100, Math.max(10, 50 + realData.changePercent));
  return {
    marketCap: Math.round(capScore),
    liquidity: Math.round(50 + (realData.turnover / 1e9) * 5),
    volatility: Math.round(30 + Math.abs(realData.changePercent) * 3),
    momentum: Math.round(changeScore),
    valuation: Math.round((peScore + pbScore) / 2),
    sectorAlpha: Math.round(40 + Math.abs(realData.changePercent) * 2),
  };
}

function generateHistoryFromPrice(price: number, code: string) {
  const seed = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = createRng(seed);
  return generateHistory(code, price, rng);
}

/** Build StockData from real API data */
function buildStockDataFromReal(realData: StockInfo): StockData {
  return {
    code: realData.code,
    name: realData.name,
    sector: realData.industry,
    marketCap: formatMarketCap(realData.marketCap * 1e8),
    price: realData.price,
    change: realData.changePercent,
    pe: realData.pe || 0,
    pb: realData.pb || 0,
    high52: realData.high52w || realData.price * 1.15,
    low52: realData.low52w || realData.price * 0.85,
    radar: generateRadarFromReal(realData),
    history: generateHistoryFromPrice(realData.price, realData.code),
  };
}

/** Build StockData from generated fallback */
function buildStockDataFromGenerated(code: string): StockData {
  const builtIn = BUILT_IN_STOCKS[code];
  const name = builtIn?.name || `股票(${code})`;
  const sector = builtIn?.industry || inferIndustry(code);
  let seed = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = createRng(seed);
  // Burn a few to desync
  for (let i = 0; i < 3; i++) rng();
  const price = 5 + rng() * 195;
  return {
    code,
    name,
    sector,
    marketCap: formatMarketCap(price * 1e9),
    price: Math.round(price * 100) / 100,
    change: Math.round((rng() - 0.45) * 6 * 100) / 100,
    pe: Math.round((10 + rng() * 60) * 100) / 100,
    pb: Math.round((1 + rng() * 8) * 100) / 100,
    high52: Math.round(price * (1.2 + rng() * 0.5) * 100) / 100,
    low52: Math.round(price * (0.5 + rng() * 3) * 100) / 100,
    radar: generateRadar(code, rng),
    history: generateHistory(code, price, rng),
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getRadarData(stock: StockData) {
  return [
    { subject: '市值规模', key: 'marketCap', fullMark: 100, value: stock.radar.marketCap },
    { subject: '流动性', key: 'liquidity', fullMark: 100, value: stock.radar.liquidity },
    { subject: '波动率', key: 'volatility', fullMark: 100, value: stock.radar.volatility },
    { subject: '动量', key: 'momentum', fullMark: 100, value: stock.radar.momentum },
    { subject: '估值水平', key: 'valuation', fullMark: 100, value: stock.radar.valuation },
    { subject: '行业景气度', key: 'sectorAlpha', fullMark: 100, value: stock.radar.sectorAlpha },
  ];
}

const DIMENSIONS = [
  { key: 'marketCap', label: '市值规模', icon: BarChart3, desc: '大盘股标杆，机构核心持仓。' },
  { key: 'liquidity', label: '流动性', icon: Activity, desc: '日均成交额充足，滑点控制良好。' },
  { key: 'volatility', label: '波动率', icon: Zap, desc: '价格波动幅度，影响风险收益比。' },
  { key: 'momentum', label: '动量', icon: TrendingUp, desc: '近期价格趋势强度与方向。' },
  { key: 'valuation', label: '估值水平', icon: Percent, desc: 'PE/PB相对历史分位评估。' },
  { key: 'sectorAlpha', label: '行业景气度', icon: Globe, desc: '行业龙头地位与成长空间。' },
];

function getStatusText(score: number): string {
  if (score >= 90) return '极高';
  if (score >= 80) return '高';
  if (score >= 60) return '中等';
  if (score >= 40) return '偏低';
  return '低';
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#00FF94';
  if (score >= 60) return '#D4AF37';
  if (score >= 40) return '#CED1D5';
  return '#FF2A6D';
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function TerminalPrompt() {
  const [text, setText] = useState('');
  const fullText = '$ ENTER_TICKER_SYMBOL:';

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i <= fullText.length) {
        setText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 60);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="font-mono text-[13px] tracking-wider text-ash mb-6"
      style={{ textShadow: '0 0 5px rgba(206,209,213,0.5)' }}
    >
      {text}
      <span className="inline-block w-[2px] h-[14px] bg-apex-green ml-0.5 animate-caret-blink align-middle" />
    </motion.p>
  );
}

function MetricCard({
  label,
  score,
  desc,
  index,
  icon: Icon,
}: {
  label: string;
  score: number;
  desc: string;
  index: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const color = getScoreColor(score);
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: 0.3 + index * 0.1,
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      }}
      className="data-card flex flex-col gap-3"
      style={{
        boxShadow: `0 0 20px ${color}08`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-ash/60" />
          <span className="font-sans text-sm text-ash/80">{label}</span>
        </div>
        <span
          className="font-mono text-[11px] px-2 py-0.5 rounded-sm"
          style={{
            color,
            backgroundColor: `${color}15`,
            border: `1px solid ${color}30`,
          }}
        >
          {getStatusText(score)}
        </span>
      </div>
      <div className="font-heading text-3xl font-medium" style={{ color, letterSpacing: '-0.5px' }}>
        {score}
        <span className="text-sm text-ash/40 ml-1">/100</span>
      </div>
      <p className="text-caption text-ash/50 leading-relaxed text-xs">{desc}</p>
      <div className="w-full h-1 bg-ash/10 rounded-full overflow-hidden mt-1">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{
            delay: 0.6 + index * 0.1,
            duration: 0.8,
            ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
          }}
          style={{
            background: `linear-gradient(90deg, #FF2A6D 0%, #D4AF37 50%, #00FF94 100%)`,
            backgroundSize: '100px 100%',
          }}
        />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function StockProfile() {
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<StockData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [shake, setShake] = useState(false);
  const [filtered, setFiltered] = useState<{ code: string; name: string; sector: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRealData, setIsRealData] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadStock = useCallback(async (code: string) => {
    setLoading(true);
    setShake(true);
    setTimeout(() => setShake(false), 150);

    const realData = await queryStock(code);

    if (realData) {
      setSelected(buildStockDataFromReal(realData));
      setIsRealData(true);
    } else {
      setSelected(buildStockDataFromGenerated(code));
      setIsRealData(false);
    }

    setLoading(false);
    setShowPreview(true);
    setFiltered([]);
  }, []);

  const handleInputChange = useCallback(
    (val: string) => {
      const v = val.replace(/\D/g, '').slice(0, 6);
      setInput(v);

      if (v.length >= 2) {
        const matches = Object.entries(BUILT_IN_STOCKS)
          .filter(([code, info]) => code.includes(v) || info.name.includes(v))
          .map(([code, info]) => ({
            code,
            name: info.name,
            sector: info.industry,
          }));
        setFiltered(matches);
      } else {
        setFiltered([]);
      }

      if (v.length === 6) {
        setFiltered([]);
        loadStock(v);
      }
    },
    [loadStock]
  );

  const handleSelect = useCallback((item: { code: string; name: string; sector: string }) => {
    setInput(item.code);
    loadStock(item.code);
  }, [loadStock]);

  const radarData = useMemo(
    () => (selected ? getRadarData(selected) : []),
    [selected]
  );

  return (
    <div className="min-h-[100dvh] bg-void pt-16">
      {/* ════════════════════════════════════════
          Section 1: Input Terminal
      ════════════════════════════════════════ */}
      <section className="relative flex flex-col items-center justify-center px-6" style={{ minHeight: '50vh' }}>
        <TerminalPrompt />

        <motion.div
          animate={shake ? { scale: [1, 0.98, 1] } : {}}
          transition={{ duration: 0.15 }}
          className="relative"
        >
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="______"
              disabled={loading}
              className="w-[280px] sm:w-[400px] h-[60px] sm:h-[80px] bg-transparent text-center font-mono text-[32px] sm:text-[48px] font-bold text-pure tracking-wider outline-none placeholder:text-ash/20 disabled:opacity-50"
              style={{
                borderBottom: '2px solid #CED1D5',
                boxShadow: '0 4px 12px rgba(0,255,148,0.15)',
                textShadow: '0 0 10px rgba(244,244,244,0.3)',
              }}
            />
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <Loader2 size={20} className="text-apex-green animate-spin" />
              </motion.div>
            )}
          </div>

          {/* Search dropdown */}
          <AnimatePresence>
            {filtered.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 z-30"
                style={{
                  background: 'rgba(21, 22, 26, 0.95)',
                  border: '1px solid rgba(206, 209, 213, 0.1)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {filtered.map((stock) => (
                  <button
                    key={stock.code}
                    onClick={() => handleSelect(stock)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-ash/5 transition-colors border-b border-ash/5 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-pure">{stock.name}</span>
                      <span className="font-mono text-xs text-ash/50">{stock.code}</span>
                    </div>
                    <span className="font-mono text-xs text-ash/40">{stock.sector}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="mt-4 font-mono text-[11px] text-ash/30 tracking-wider">
          输入 6 位股票代码
        </p>

        {/* Holographic Preview Card */}
        <AnimatePresence>
          {showPreview && selected && (
            <motion.div
              initial={{ opacity: 0, y: 50, rotateX: 45 }}
              animate={{ opacity: 1, y: 0, rotateX: 10 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{
                duration: 0.8,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
              className="mt-8 w-[300px] h-[180px] relative"
              style={{
                perspective: '1000px',
                transform: 'perspective(1000px) rotateX(10deg) rotateY(-5deg)',
              }}
            >
              <div
                className="w-full h-full p-5 flex flex-col justify-between relative overflow-hidden"
                style={{
                  background: 'rgba(21, 22, 26, 0.8)',
                  border: '1px solid rgba(206, 209, 213, 0.12)',
                  boxShadow: '0 0 30px rgba(212, 175, 55, 0.1), inset 0 0 30px rgba(0,0,0,0.3)',
                }}
              >
                {/* Scanline effect */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
                  }}
                />
                {/* Corner accents */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-ash/20" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-ash/20" />

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-lg font-medium text-pure">{selected.name}</h3>
                    {isRealData && <span className="text-apex-green text-xs">【实时行情】</span>}
                    {!isRealData && <span className="text-ash/40 text-xs">【模拟数据】</span>}
                  </div>
                  <p className="font-mono text-[11px] text-ash/50 mt-1">{selected.code} | {selected.sector}</p>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[42px] font-bold leading-none" style={{
                    color: selected.change >= 0 ? '#00FF94' : '#FF2A6D',
                    textShadow: selected.change >= 0
                      ? '0 0 20px rgba(0,255,148,0.3)'
                      : '0 0 20px rgba(255,42,109,0.3)',
                  }}>
                    {selected.price.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className="font-mono text-sm font-medium"
                    style={{ color: selected.change >= 0 ? '#00FF94' : '#FF2A6D' }}
                  >
                    {selected.change >= 0 ? '+' : ''}{selected.change}%
                  </span>
                </div>

                <p className="font-mono text-[11px] text-ash/50">
                  市值 {selected.marketCap}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ════════════════════════════════════════
          Section 2: Gene Analysis
      ════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative py-20 px-6"
            style={{
              background: '#15161A',
              backgroundImage:
                'linear-gradient(rgba(206,209,213,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(206,209,213,0.03) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          >
            <div className="max-w-7xl mx-auto">
              {/* Section title */}
              <motion.h2
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                className="text-h2 font-heading text-pure mb-12"
                style={{ letterSpacing: '-0.5px' }}
              >
                GENE_ANALYSIS: <span className="text-gold-standard">{selected.code}</span>
              </motion.h2>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
                {/* Radar Chart */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="lg:col-span-5 h-[400px] sm:h-[500px] data-card flex items-center justify-center"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid
                        stroke="rgba(206,209,213,0.2)"
                        strokeWidth={1}
                      />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{
                          fill: '#CED1D5',
                          fontSize: 13,
                          fontFamily: '"Noto Sans SC", sans-serif',
                        }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        name={selected.name}
                        dataKey="value"
                        stroke="#D4AF37"
                        strokeWidth={2}
                        fill="rgba(212, 175, 55, 0.25)"
                        dot={{ r: 5, fill: '#F4F4F4', stroke: '#D4AF37', strokeWidth: 2 }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Metric Cards */}
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DIMENSIONS.map((dim, i) => {
                    const score = selected.radar[dim.key as keyof typeof selected.radar];
                    return (
                      <MetricCard
                        key={dim.key}
                        label={dim.label}
                        score={score}
                        desc={dim.desc}
                        index={i}
                        icon={dim.icon}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════
          Section 3: Historical Echo
      ════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative py-20 px-6"
            style={{ background: '#15161A' }}
          >
            <div className="max-w-7xl mx-auto">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mb-10"
              >
                <h2 className="text-h2 font-heading text-pure mb-2" style={{ letterSpacing: '-0.5px' }}>
                  HISTORICAL_ECHO
                </h2>
                <p className="font-mono text-[13px] text-ash/50">
                  30日价格走势 | {selected.name} ({selected.code})
                </p>
              </motion.div>

              {/* Price Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { label: '当前价', value: `¥${selected.price.toFixed(2)}`, color: selected.change >= 0 ? '#00FF94' : '#FF2A6D' },
                  { label: '涨跌幅', value: `${selected.change >= 0 ? '+' : ''}${selected.change}%`, color: selected.change >= 0 ? '#00FF94' : '#FF2A6D' },
                  { label: '52周最高', value: `¥${selected.high52.toFixed(2)}`, color: '#D4AF37' },
                  { label: '52周最低', value: `¥${selected.low52.toFixed(2)}`, color: '#CED1D5' },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                    className="data-card text-center"
                  >
                    <p className="font-mono text-[11px] text-ash/50 mb-2">{item.label}</p>
                    <p className="font-mono text-xl font-bold" style={{ color: item.color }}>
                      {item.value}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { label: '市盈率 (PE)', value: selected.pe.toFixed(1) },
                  { label: '市净率 (PB)', value: selected.pb.toFixed(2) },
                  { label: '总市值', value: selected.marketCap },
                  { label: '行业', value: selected.sector.split(' / ')[1] || selected.sector },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                    className="data-card text-center"
                  >
                    <p className="font-mono text-[11px] text-ash/50 mb-2">{item.label}</p>
                    <p className="font-mono text-lg font-bold text-pure">{item.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Area Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="data-card h-[350px] sm:h-[400px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selected.history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={selected.change >= 0 ? '#00FF94' : '#FF2A6D'} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={selected.change >= 0 ? '#00FF94' : '#FF2A6D'} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#CED1D5', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}
                      axisLine={{ stroke: 'rgba(206,209,213,0.1)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fill: '#CED1D5', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tickFormatter={(v: number) => v.toFixed(0)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(21, 22, 26, 0.95)',
                        border: '1px solid rgba(206, 209, 213, 0.15)',
                        borderRadius: '4px',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: '12px',
                        color: '#F4F4F4',
                      }}
                      labelStyle={{ color: '#CED1D5' }}
                      formatter={(value: number) => [`¥${value.toFixed(2)}`, '价格']}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={selected.change >= 0 ? '#00FF94' : '#FF2A6D'}
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#F4F4F4', stroke: selected.change >= 0 ? '#00FF94' : '#FF2A6D', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Default state: Quick select chips */}
      {!selected && (
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-center font-mono text-[11px] text-ash/30 tracking-widest uppercase mb-8">
              热门股票 Quick Select
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {HOT_STOCK_CODES.slice(0, 6).map((code, i) => (
                <motion.button
                  key={code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                  onClick={() => handleSelect({ code, name: BUILT_IN_STOCKS[code]?.name || code, sector: BUILT_IN_STOCKS[code]?.industry || '' })}
                  className="group flex items-center gap-2 px-4 py-2.5 border border-ash/10 hover:border-gold-standard/40 transition-all duration-300"
                  style={{ background: 'rgba(21, 22, 26, 0.6)' }}
                >
                  <span className="font-mono text-sm text-pure group-hover:text-gold-standard transition-colors">
                    {BUILT_IN_STOCKS[code]?.name || code}
                  </span>
                  <span className="font-mono text-[11px] text-ash/40">{code}</span>
                </motion.button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-3">
              {HOT_STOCK_CODES.slice(6).map((code, i) => (
                <motion.button
                  key={code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + i * 0.08, duration: 0.4 }}
                  onClick={() => handleSelect({ code, name: BUILT_IN_STOCKS[code]?.name || code, sector: BUILT_IN_STOCKS[code]?.industry || '' })}
                  className="group flex items-center gap-2 px-4 py-2.5 border border-ash/10 hover:border-gold-standard/40 transition-all duration-300"
                  style={{ background: 'rgba(21, 22, 26, 0.6)' }}
                >
                  <span className="font-mono text-sm text-pure group-hover:text-gold-standard transition-colors">
                    {BUILT_IN_STOCKS[code]?.name || code}
                  </span>
                  <span className="font-mono text-[11px] text-ash/40">{code}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
