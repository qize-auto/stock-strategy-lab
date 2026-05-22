import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import MacroFlow from '../components/MacroFlow';
import {
  Activity, Eye, AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const radarData = [
  { dim: '动量', value: 55, fullMark: 100 },
  { dim: '波动率', value: 30, fullMark: 100 },
  { dim: '估值', value: 65, fullMark: 100 },
  { dim: '流动性', value: 80, fullMark: 100 },
  { dim: '市值', value: 70, fullMark: 100 },
  { dim: '情绪', value: 45, fullMark: 100 },
];

interface WatchlistItem {
  name: string;
  price: string;
  change: string;
  up: boolean;
  strategy: string;
}

const fallbackWatchlistData: WatchlistItem[] = [
  { name: '沪深300', price: '4,120.55', change: '+0.42%', up: true, strategy: '因子选股' },
  { name: '创业板指', price: '2,150.12', change: '-1.15%', up: false, strategy: '趋势跟踪' },
  { name: '中证1000', price: '6,880.30', change: '+0.88%', up: true, strategy: '突破交易' },
  { name: '科创50', price: '1,050.22', change: '-0.65%', up: false, strategy: '均值回归' },
  { name: '恒生科技', price: '3,420.18', change: '+1.20%', up: true, strategy: '趋势跟踪' },
];

function parseIndexData(text: string): WatchlistItem[] {
  const items: WatchlistItem[] = [];
  const indexMap: Record<string, { name: string; strategy: string }> = {
    '000300': { name: '沪深300', strategy: '因子选股' },
    '399006': { name: '创业板指', strategy: '趋势跟踪' },
    '000852': { name: '中证1000', strategy: '突破交易' },
    '000688': { name: '科创50', strategy: '均值回归' },
    'HSTECH': { name: '恒生科技', strategy: '趋势跟踪' },
  };

  const stockBlocks = text.split(';').filter(Boolean);
  for (const block of stockBlocks) {
    const match = block.match(/v_\w+="([^"]*)"/);
    if (!match) continue;
    const parts = match[1].split('~');
    if (parts.length < 40) continue;

    const code = parts[2];
    const name = indexMap[code]?.name || parts[1];
    const price = parseFloat(parts[3]) || 0;
    const prevClose = parseFloat(parts[4]) || 0;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;

    items.push({
      name,
      price: price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      change: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      up: changePct >= 0,
      strategy: indexMap[code]?.strategy || '因子选股',
    });
  }
  return items;
}

const sparklineData = [
  { v: 22 }, { v: 21 }, { v: 20.5 }, { v: 19.8 }, { v: 19.2 },
  { v: 18.8 }, { v: 18.6 }, { v: 18.4 }, { v: 18.2 }, { v: 18.0 },
  { v: 17.8 }, { v: 17.6 }, { v: 17.4 }, { v: 17.2 }, { v: 17.0 },
];

const strategyCards = [
  {
    title: '趋势跟踪',
    subtitle: 'TREND FOLLOWING',
    desc: '追踪市场动量，顺势而为。在强趋势环境中捕获超额收益。',
    color: '#00FF94',
    image: '/trend-track-bg.jpg',
  },
  {
    title: '均值回归',
    subtitle: 'MEAN REVERSION',
    desc: '利用价格振荡的统计特性，在偏离均值时反向布局。',
    color: '#FF2A6D',
    image: '/mean-revert-bg.jpg',
  },
  {
    title: '突破交易',
    subtitle: 'BREAKOUT',
    desc: '识别关键阻力位的爆发性突破，捕捉动能释放的瞬间。',
    color: '#D4AF37',
    image: '/breakout-bg.jpg',
  },
  {
    title: '因子选股',
    subtitle: 'FACTOR',
    desc: '基于多因子模型的系统性选股，挖掘alpha的来源。',
    color: '#CED1D5',
    image: '/factor-bg.jpg',
  },
];

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                 */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.2 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

/* ------------------------------------------------------------------ */
/*  K-Line Matrices Component                                          */
/* ------------------------------------------------------------------ */

function KLineMatrices() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let offset = 0;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const barWidth = 3;
    const gap = 2;

    const animate = () => {
      offset += 0.5;
      if (offset > barWidth + gap) offset = 0;

      ctx.clearRect(0, 0, w, h);

      // Draw K-line texture as background pattern
      const cols = Math.ceil(w / (barWidth + gap));
      const rows = Math.ceil(h / 8);

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const isGreen = Math.sin(c * 0.3 + r * 0.7 + Date.now() * 0.001) > 0;
          const barH = Math.abs(Math.sin(c * 0.5 + r * 0.3)) * 6 + 2;
          const x = c * (barWidth + gap) - offset;
          const y = r * 8;

          ctx.fillStyle = isGreen ? 'rgba(0, 255, 148, 0.25)' : 'rgba(255, 42, 109, 0.25)';
          ctx.fillRect(x, y + (8 - barH) / 2, barWidth, barH);
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.4 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        {['S', 'T', 'R', 'A', 'T', 'E', 'G', 'Y'].map((letter, i) => (
          <span
            key={i}
            className="font-heading font-bold text-pure select-none"
            style={{
              fontSize: 'clamp(80px, 12vw, 200px)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              opacity: 0.06,
              marginRight: '0.02em',
            }}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  3D Strategy Carousel                                               */
/* ------------------------------------------------------------------ */

function StrategyCarousel() {
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) {
      // Auto rotation + mouse influence
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const centerX = rect.left + rect.width / 2;
        const delta = (e.clientX - centerX) / rect.width;
        setRotation((prev) => prev + delta * 0.5);
      }
    }
  }, []);

  useEffect(() => {
    let animId: number;
    const autoRotate = () => {
      if (!isDragging.current) {
        setRotation((prev) => prev + 0.15);
      }
      animId = requestAnimationFrame(autoRotate);
    };
    animId = requestAnimationFrame(autoRotate);
    return () => cancelAnimationFrame(animId);
  }, []);

  const cards = strategyCards;
  const radius = 280;
  const angleStep = 360 / cards.length;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center"
      style={{
        perspective: '900px',
        transformStyle: 'preserve-3d',
        height: '400px',
        width: '100%',
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 49px, rgba(85,85,85,0.3) 49px, rgba(85,85,85,0.3) 50px),
            repeating-linear-gradient(-90deg, transparent, transparent 49px, rgba(85,85,85,0.3) 49px, rgba(85,85,85,0.3) 50px)
          `,
          backgroundSize: '50px 50px',
          maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(11,12,16,0.8) 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(11,12,16,0.8) 80%)',
        }}
      />

      {/* Orbiting cards */}
      <div
        className="relative"
        style={{
          transformStyle: 'preserve-3d',
          width: '200px',
          height: '280px',
        }}
      >
        {cards.map((card, i) => {
          const angle = (angleStep * i + rotation) * (Math.PI / 180);
          const x = Math.sin(angle) * radius;
          const z = Math.cos(angle) * radius;
          const opacity = (z + radius) / (2 * radius) * 0.7 + 0.3;
          const scale = (z + radius) / (2 * radius) * 0.3 + 0.7;

          return (
            <div
              key={i}
              className="absolute top-0 left-0 w-full h-full rounded overflow-hidden"
              style={{
                transform: `translateX(${x}px) translateZ(${z}px) scale(${scale})`,
                opacity,
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'hidden',
                border: `1px solid ${card.color}40`,
                boxShadow: `0 0 30px ${card.color}20`,
              }}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${card.image})` }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle at 50% 50%, ${card.color}40, rgba(0,0,0,0.6) 60%)`,
                  mixBlendMode: 'color-dodge',
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                <span
                  className="font-mono text-[10px] uppercase tracking-widest mb-2"
                  style={{ color: card.color }}
                >
                  {card.subtitle}
                </span>
                <h3 className="text-xl font-heading font-bold text-pure mb-2">
                  {card.title}
                </h3>
                <p className="text-xs text-ash/70 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(0,255,148,0.08) 0%, rgba(255,42,109,0.05) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 1: Hero                                                    */
/* ------------------------------------------------------------------ */

function HeroSection() {
  return (
    <section className="relative min-h-[100dvh] overflow-hidden flex flex-col justify-center">
      {/* Background layers */}
      <div className="absolute inset-0 z-0">
        <MacroFlow />
      </div>

      {/* K-Line Matrices — Background decoration only */}
      <div className="absolute inset-0 z-[1] pointer-events-none">
        <KLineMatrices />
      </div>

      {/* Hero statue overlay */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          backgroundImage: 'url(/hero-statue.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.12,
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 80%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 80%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full px-[8vw] py-16 flex-1 flex flex-col justify-center">
        {/* Main content area */}
        <motion.div
          className="max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        >
          {/* Big Title */}
          <h1 className="font-heading text-5xl lg:text-6xl text-pure mb-2 leading-tight">
            洞察市场脉搏
          </h1>
          <h1 className="font-heading text-5xl lg:text-6xl mb-6 leading-tight">
            <span style={{ color: '#00FF94' }}>匹配</span>
            <span style={{ color: '#D4AF37' }}>最优策略</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base text-ash/80 leading-relaxed mb-6" style={{ maxWidth: '580px' }}>
            基于自适应市场假说的智能策略匹配引擎。三层级联架构 — 环境感知、股票画像、策略适配 — 为每一只股票找到当下最适合的交易策略。
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-8">
            {['自适应', '数据驱动', '策略进化', '实时决策'].map((tag, i) => (
              <span
                key={tag}
                className="font-mono text-[11px] px-3 py-1.5 border border-[rgba(206,209,213,0.15)] text-ash/60"
                style={{
                  color: i === 2 ? '#00FF94' : i === 0 ? '#D4AF37' : '#CED1D5',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Link
              to="/match"
              className="inline-flex items-center gap-2 px-5 py-3 bg-apex-green/10 border border-apex-green/30 text-apex-green font-mono text-sm hover:bg-apex-green/20 transition-colors"
            >
              <Activity size={14} />
              启动匹配引擎
            </Link>
            <Link
              to="/monitor"
              className="inline-flex items-center gap-2 px-5 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] text-ash font-mono text-sm hover:border-apex-green/40 transition-colors"
            >
              <Eye size={14} className="text-gold-standard" />
              实时盯盘
            </Link>
          </div>
        </motion.div>

        {/* Risk Warning */}
        <motion.div
          className="mb-8 px-6 py-5 border border-[rgba(255,42,109,0.25)] bg-[rgba(255,42,109,0.06)] max-w-3xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <AlertTriangle size={18} style={{ color: '#FF2A6D' }} />
            <span className="font-heading text-base font-bold" style={{ color: '#FF2A6D' }}>风险提示</span>
          </div>
          <p className="font-mono text-[13px] text-ash/50 leading-relaxed">
            本系统仅供学习研究使用，不构成任何投资建议。股市有风险，投资需谨慎。所有策略信号和回测结果均基于历史数据分析，不代表未来表现。用户应独立判断并承担全部投资风险。
          </p>
        </motion.div>

        {/* Dashboard Widgets — below main content */}
        <motion.div
          className="mt-16 flex flex-wrap gap-4 lg:gap-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        >
          {/* Card 1: Market Status */}
          <div className="px-5 py-4 border border-[rgba(206,209,213,0.2)] bg-[rgba(11,12,16,0.6)] backdrop-blur-sm min-w-[150px]">
            <p className="text-caption text-ash/60 mb-1">市场状态</p>
            <p className="text-data-point" style={{ color: '#FF2A6D' }}>S2: 震荡积聚</p>
            <p className="text-caption text-ash/40 mt-1">切换概率: 34.2%</p>
          </div>

          {/* Card 2: Dominant Strategy */}
          <div className="px-5 py-4 border border-[rgba(206,209,213,0.2)] bg-[rgba(11,12,16,0.6)] backdrop-blur-sm min-w-[150px]">
            <p className="text-caption text-ash/60 mb-1">主导策略</p>
            <p className="text-data-point" style={{ color: '#00FF94' }}>均值回归</p>
            <p className="text-caption text-ash/40 mt-1">R²: 0.91</p>
          </div>

          {/* Card 3: Volatility Index */}
          <div className="px-5 py-4 border border-[rgba(206,209,213,0.2)] bg-[rgba(11,12,16,0.6)] backdrop-blur-sm min-w-[200px]">
            <p className="text-caption text-ash/60 mb-1">波动率指数</p>
            <div className="flex items-center gap-3">
              <p className="text-data-point" style={{ color: '#D4AF37' }}>18.4</p>
              <div className="w-16 h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#D4AF37"
                      strokeWidth={1.5}
                      fill="none"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-caption text-ash/40 mt-1">Z-Score: -1.2 (低)</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 2: Adaptive Niche                                          */
/* ------------------------------------------------------------------ */

function AdaptiveNicheSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      ref={ref}
      className="relative min-h-[120vh] bg-void flex flex-col items-center justify-center overflow-hidden py-20"
    >
      {/* Theory text */}
      <motion.div
        className="text-center mb-16 px-6"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 1 }}
      >
        <motion.h2
          className="text-h2 text-pure mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        >
          THE ADAPTIVE NICHE
        </motion.h2>
        <motion.p
          className="text-base text-ash leading-relaxed mx-auto"
          style={{ maxWidth: '600px' }}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        >
          达尔文主义与量化交易的残酷交叉点。没有永远有效的圣杯，只有随环境迭代进化的策略。市场在变，适应者永生。
        </motion.p>
      </motion.div>

      {/* 3D Carousel */}
      <motion.div
        className="w-full max-w-4xl"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        <StrategyCarousel />
      </motion.div>

      {/* Ambient color lighting */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: '80%',
          height: '60%',
          background: 'radial-gradient(ellipse at 30% 50%, rgba(0,255,148,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 50%, rgba(255,42,109,0.06) 0%, transparent 50%)',
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 3: Market Matrix                                           */
/* ------------------------------------------------------------------ */

function MarketMatrixSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [lastUpdate, setLastUpdate] = useState('14:30:05');
  const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
  const [watchLoading, setWatchLoading] = useState(true);

  useEffect(() => {
    async function fetchWatchlist() {
      try {
        const res = await fetch('https://qt.gtimg.cn/q=sh000300,sz399006,sh000852,sh000688,hkHSTECH');
        if (!res.ok) throw new Error('Network error');
        const text = await res.text();
        const data = parseIndexData(text);
        if (data.length > 0) {
          setWatchlistData(data);
          const now = new Date();
          setLastUpdate(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
        } else {
          setWatchlistData(fallbackWatchlistData);
        }
      } catch {
        setWatchlistData(fallbackWatchlistData);
      } finally {
        setWatchLoading(false);
      }
    }
    fetchWatchlist();
  }, []);

  const displayData = watchlistData.length > 0 ? watchlistData : fallbackWatchlistData;

  return (
    <section
      ref={ref}
      className="relative bg-deep-space py-20 lg:py-24"
      style={{
        backgroundImage: `
          linear-gradient(rgba(206,209,213,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(206,209,213,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
      }}
    >
      <div className="px-[6vw]">
        {/* Section Header */}
        <motion.div
          className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-12 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-h2 text-pure">MARKET_MATRIX</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-apex-green animate-pulse" />
            <span className="text-caption text-apex-green">
              {watchLoading ? 'LOADING...' : `LAST UPDATE: ${lastUpdate} [LIVE]`}
            </span>
          </div>
        </motion.div>

        {/* Data Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Radar Chart - Left 8 columns */}
          <motion.div
            className="lg:col-span-8 data-card"
            style={{ height: '500px' }}
            variants={staggerItem}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-caption text-ash/70 uppercase tracking-widest">
                六维市场特征雷达
              </h3>
              <span className="strategy-badge-factor">MARKET OVERVIEW</span>
            </div>
            <div className="flex-1" style={{ height: '420px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                  <PolarGrid
                    stroke="rgba(206, 209, 213, 0.2)"
                    strokeWidth={0.5}
                  />
                  <PolarAngleAxis
                    dataKey="dim"
                    tick={{ fill: '#CED1D5', fontSize: 13, fontFamily: 'JetBrains Mono' }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: 'rgba(206,209,213,0.4)', fontSize: 11 }}
                    axisLine={false}
                  />
                  <Radar
                    name="当前市场"
                    dataKey="value"
                    stroke="#D4AF37"
                    strokeWidth={2}
                    fill="#D4AF37"
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Watchlist - Right 4 columns */}
          <motion.div
            className="lg:col-span-4 data-card"
            variants={staggerItem}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-caption text-ash/70 uppercase tracking-widest">
                监控列表
              </h3>
              <span className="text-caption text-ash/40">WATCHLIST</span>
            </div>

            <div className="flex flex-col">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 pb-3 border-b border-[rgba(206,209,213,0.1)]">
                <span className="text-caption text-ash/50">名称</span>
                <span className="text-caption text-ash/50 text-right">现价</span>
                <span className="text-caption text-ash/50 text-right">涨跌幅</span>
                <span className="text-caption text-ash/50 text-right">匹配策略</span>
              </div>

              {/* Rows */}
              <AnimatePresence>
                {displayData.map((item, i) => (
                  <motion.div
                    key={item.name}
                    className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 py-3 border-b border-[rgba(206,209,213,0.05)] last:border-0"
                    initial={{ opacity: 0, x: -10 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.4 + i * 0.08, duration: 0.5 }}
                  >
                    <span className="text-caption text-pure">{item.name}</span>
                    <span className="text-caption text-pure text-right font-mono">
                      {item.price}
                    </span>
                    <span
                      className={`text-caption text-right font-mono ${
                        item.up ? 'text-apex-green' : 'text-reversion-red'
                      }`}
                    >
                      {item.change}
                    </span>
                    <div className="text-right">
                      <span
                        className="inline-block px-2 py-0.5 text-[10px] font-mono border"
                        style={{
                          color:
                            item.strategy === '因子选股'
                              ? '#CED1D5'
                              : item.strategy === '趋势跟踪'
                              ? '#00FF94'
                              : item.strategy === '突破交易'
                              ? '#D4AF37'
                              : '#FF2A6D',
                          borderColor:
                            item.strategy === '因子选股'
                              ? 'rgba(206,209,213,0.3)'
                              : item.strategy === '趋势跟踪'
                              ? 'rgba(0,255,148,0.3)'
                              : item.strategy === '突破交易'
                              ? 'rgba(212,175,55,0.3)'
                              : 'rgba(255,42,109,0.3)',
                        }}
                      >
                        {item.strategy}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Strategy Performance Summary Cards */}
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6"
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          {[
            { label: '趋势跟踪', return: '+12.4%', sharpe: '1.85', color: '#00FF94' },
            { label: '均值回归', return: '+8.7%', sharpe: '2.14', color: '#FF2A6D' },
            { label: '突破交易', return: '+15.2%', sharpe: '1.62', color: '#D4AF37' },
            { label: '因子选股', return: '+9.3%', sharpe: '1.98', color: '#CED1D5' },
          ].map((s) => (
            <motion.div
              key={s.label}
              className="data-card"
              variants={staggerItem}
              style={{
                boxShadow: `inset 0 0 30px ${s.color}08`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-caption text-ash/60">{s.label}</span>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
              </div>
              <p className="text-data-point text-pure mb-1">{s.return}</p>
              <p className="text-caption text-ash/50">
                Sharpe: <span className="text-pure">{s.sharpe}</span>
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Home Page                                                          */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <div className="bg-void">
      <HeroSection />
      <AdaptiveNicheSection />
      <MarketMatrixSection />
    </div>
  );
}
