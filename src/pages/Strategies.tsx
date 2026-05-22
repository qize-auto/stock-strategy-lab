import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView, useMotionValue, useTransform } from 'framer-motion';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  RotateCcw,
  Zap,
  BarChart3,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Activity,
  Target,
  Shield,
  Layers,
  Sparkles,
  AlertTriangle,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StrategyData {
  id: string;
  name: string;
  englishName: string;
  color: string;
  colorRgb: string;
  glowClass: string;
  badgeClass: string;
  icon: React.ReactNode;
  description: string;
  metrics: { label: string; value: string; subtitle?: string }[];
  bestStocks: string;
  failureConditions: string;
  equityCurve: { value: number }[];
  tags: string[];
  sharpe: number;
  cagr: number;
  detail: {
    principle: string;
    entryConditions: string;
    exitConditions: string;
    applicableStocks: string;
    bestMarket: string;
    operationExample: string;
  };
}

interface ComparisonRow {
  label: string;
  key: keyof StrategyData | string;
  values: string[];
}

/* ------------------------------------------------------------------ */
/*  Mock equity curve data                                             */
/* ------------------------------------------------------------------ */

const trendCurve = [
  { value: 100 }, { value: 102 }, { value: 99 }, { value: 105 },
  { value: 108 }, { value: 115 }, { value: 112 }, { value: 125 },
  { value: 130 }, { value: 128 }, { value: 145 }, { value: 155 },
  { value: 150 }, { value: 168 }, { value: 175 }, { value: 190 },
  { value: 185 }, { value: 205 }, { value: 215 }, { value: 230 },
  { value: 225 }, { value: 248 }, { value: 260 }, { value: 275 },
];

const revertCurve = [
  { value: 100 }, { value: 103 }, { value: 101 }, { value: 104 },
  { value: 102 }, { value: 106 }, { value: 104 }, { value: 108 },
  { value: 106 }, { value: 110 }, { value: 108 }, { value: 113 },
  { value: 111 }, { value: 116 }, { value: 114 }, { value: 119 },
  { value: 117 }, { value: 122 }, { value: 120 }, { value: 125 },
  { value: 123 }, { value: 128 }, { value: 126 }, { value: 132 },
];

const breakoutCurve = [
  { value: 100 }, { value: 98 }, { value: 96 }, { value: 97 },
  { value: 95 }, { value: 94 }, { value: 96 }, { value: 95 },
  { value: 93 }, { value: 94 }, { value: 110 }, { value: 125 },
  { value: 120 }, { value: 118 }, { value: 135 }, { value: 148 },
  { value: 142 }, { value: 138 }, { value: 155 }, { value: 168 },
  { value: 162 }, { value: 178 }, { value: 188 }, { value: 198 },
];

const factorCurve = [
  { value: 100 }, { value: 101 }, { value: 103 }, { value: 102 },
  { value: 104 }, { value: 106 }, { value: 105 }, { value: 108 },
  { value: 107 }, { value: 110 }, { value: 112 }, { value: 111 },
  { value: 114 }, { value: 116 }, { value: 115 }, { value: 119 },
  { value: 121 }, { value: 120 }, { value: 124 }, { value: 127 },
  { value: 126 }, { value: 130 }, { value: 133 }, { value: 136 },
];

/* ------------------------------------------------------------------ */
/*  Strategy data                                                     */
/* ------------------------------------------------------------------ */

const strategies: StrategyData[] = [
  {
    id: 'trend',
    name: '趋势跟踪',
    englishName: 'TREND_FOLLOWING',
    color: '#00FF94',
    colorRgb: '0, 255, 148',
    glowClass: 'shadow-[0_0_30px_rgba(0,255,148,0.15)]',
    badgeClass: 'strategy-badge-momentum',
    icon: <TrendingUp size={20} />,
    description: '顺势而为，截断亏损，让利润奔跑。在强趋势市场中，利用均线排列与突破确认，顺势而为。适用于高波动、高动量的成长型标的。',
    metrics: [
      { label: 'CAGR (BTC海龟)', value: '48.2%', subtitle: '年化收益' },
      { label: '市场正收益', value: '24/24', subtitle: '全市场覆盖' },
      { label: '夏普比率', value: '1.15', subtitle: '风险调整后收益' },
      { label: '最大回撤', value: '-32%', subtitle: '历史极值' },
    ],
    bestStocks: '高波动、强趋势性标的',
    failureConditions: '震荡市频繁假信号 (Whipsaw)',
    equityCurve: trendCurve,
    tags: ['高波动', '动量驱动', '右侧交易'],
    sharpe: 1.15,
    cagr: 48.2,
    detail: {
      principle: '识别并跟随已确立的价格趋势',
      entryConditions: '价格突破N日新高/均线多头排列',
      exitConditions: '价格跌破N日新低/均线空头排列',
      applicableStocks: '高波动率、强趋势性标的（宁德时代、比亚迪）',
      bestMarket: '单边上涨或下跌市场',
      operationExample: '当股价站上20日均线且成交量放大时买入，跌破20日均线时卖出',
    },
  },
  {
    id: 'revert',
    name: '均值回归',
    englishName: 'MEAN_REVERSION',
    color: '#FF2A6D',
    colorRgb: '255, 42, 109',
    glowClass: 'shadow-[0_0_30px_rgba(255,42,109,0.15)]',
    badgeClass: 'strategy-badge-reversion',
    icon: <RotateCcw size={20} />,
    description: '价格围绕均值波动，极端偏离终将修复。RSI(2) 超短线模型在蓝筹大盘股上胜率可达 75-79%。盈亏比 > 2.0，依赖严格止损纪律。',
    metrics: [
      { label: 'RSI(2) 胜率', value: '75-79%', subtitle: '超短线模型' },
      { label: '盈亏比', value: '> 2.0', subtitle: '风险回报比' },
      { label: '夏普比率', value: '1.80', subtitle: '风险调整后收益' },
      { label: 'CAGR', value: '18.5%', subtitle: '年化收益' },
    ],
    bestStocks: '低波动大盘蓝筹',
    failureConditions: '趋势突破持续偏离（价值陷阱）',
    equityCurve: revertCurve,
    tags: ['低波动', '反转信号', '左侧交易'],
    sharpe: 1.80,
    cagr: 18.5,
    detail: {
      principle: '价格围绕均值波动，极端偏离终将修复',
      entryConditions: 'RSI<30/价格触及布林下轨/偏离均线过远',
      exitConditions: 'RSI>50/价格回归均线/达到止盈位',
      applicableStocks: '低波动大盘蓝筹（贵州茅台、招商银行）',
      bestMarket: '震荡整理市场',
      operationExample: '当RSI跌至25以下且出现阳线反弹时买入，RSI回升至55时卖出',
    },
  },
  {
    id: 'breakout',
    name: '突破交易',
    englishName: 'BREAKOUT_TRADING',
    color: '#D4AF37',
    colorRgb: '212, 175, 55',
    glowClass: 'shadow-[0_0_30px_rgba(212,175,55,0.15)]',
    badgeClass: 'strategy-badge-breakout',
    icon: <Zap size={20} />,
    description: '波动率收缩后的方向性爆发。识别长期盘整后的放量启动，捕捉趋势的第一波加速。盈亏比极高 (2.8-3.5x)，但胜率较低，依赖严格止损。',
    metrics: [
      { label: '盈亏比', value: '2.8-3.5x', subtitle: '平均回报/风险' },
      { label: '信号系统', value: '三信号共振', subtitle: '量/价/波动率' },
      { label: '夏普比率', value: '1.40', subtitle: '风险调整后收益' },
      { label: 'CAGR', value: '35.0%', subtitle: '年化收益' },
    ],
    bestStocks: '盘整后放量启动标的',
    failureConditions: '假突破与流动性不足 (Fakeout)',
    equityCurve: breakoutCurve,
    tags: ['放量突破', '高盈亏比', '事件驱动'],
    sharpe: 1.40,
    cagr: 35.0,
    detail: {
      principle: '价格突破关键阻力/支撑位后 momentum 延续',
      entryConditions: '突破平台整理区间/成交量放大3倍以上',
      exitConditions: '假突破回落/达到目标价位',
      applicableStocks: '盘整后放量启动标的（东方财富、中信证券）',
      bestMarket: '盘整后方向选择市场',
      operationExample: '股价放量突破前期高点时跟进，回落跌破突破位时止损',
    },
  },
  {
    id: 'factor',
    name: '因子选股',
    englishName: 'FACTOR_INVESTING',
    color: '#4A6FA5',
    colorRgb: '74, 111, 165',
    glowClass: 'shadow-[0_0_30px_rgba(74,111,165,0.15)]',
    badgeClass: 'strategy-badge-factor',
    icon: <BarChart3 size={20} />,
    description: 'Smart Beta 多因子系统化构建。不预测市场，只暴露于经过长期验证的风险溢价因子（价值、质量、规模、动量）。信息比率 (IR) 高达 3.01。',
    metrics: [
      { label: '信息比率 IR', value: '3.01', subtitle: '超额收益稳定性' },
      { label: 'Barra CNE6', value: '46因子', subtitle: '多因子模型' },
      { label: '夏普比率', value: '1.60', subtitle: '风险调整后收益' },
      { label: 'CAGR', value: '22.0%', subtitle: '年化收益' },
    ],
    bestStocks: '全市场覆盖、中低频调仓',
    failureConditions: '因子拥挤与 Alpha Decay',
    equityCurve: factorCurve,
    tags: ['Smart Beta', '系统化', '分散化'],
    sharpe: 1.60,
    cagr: 22.0,
    detail: {
      principle: '通过多因子模型系统筛选优质股票',
      entryConditions: '估值（PE/PB）、质量（ROE）、动量（涨跌幅）、波动率',
      exitConditions: '月度/季度调仓，淘汰排名靠后标的',
      applicableStocks: '全市场覆盖',
      bestMarket: '结构性行情',
      operationExample: '每月初筛选PE<20且ROE>15%的股票，等权重构建组合',
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Comparison table data                                              */
/* ------------------------------------------------------------------ */

const comparisonRows: ComparisonRow[] = [
  {
    label: '年化收益 (CAGR)',
    key: 'cagr',
    values: ['48.2%', '18.5%', '35.0%', '22.0%'],
  },
  {
    label: '夏普比率',
    key: 'sharpe',
    values: ['1.15', '1.80', '1.40', '1.60'],
  },
  {
    label: '最大回撤',
    key: 'maxDD',
    values: ['-32%', '-12%', '-28%', '-15%'],
  },
  {
    label: '胜率区间',
    key: 'winRate',
    values: ['35-45%', '75-79%', '40-50%', '55-65%'],
  },
  {
    label: '盈亏比',
    key: 'pfratio',
    values: ['2.5-3.0x', '> 2.0x', '2.8-3.5x', '1.5-2.0x'],
  },
  {
    label: '最佳市场',
    key: 'bestMarket',
    values: ['强趋势/高波动', '震荡/均值回归', '盘整突破/放量', '全周期/分散'],
  },
  {
    label: '理想标的特征',
    key: 'idealStock',
    values: ['高波动成长股', '低波动蓝筹股', '盘整后放量标的', '全市场中大盘'],
  },
  {
    label: '调仓频率',
    key: 'turnover',
    values: ['中频 (周线)', '高频 (日线)', '中频 (日线)', '低频 (月/季)'],
  },
  {
    label: '核心风险',
    key: 'coreRisk',
    values: ['震荡磨损', '趋势陷阱', '假突破', '因子衰退'],
  },
];

/* ------------------------------------------------------------------ */
/*  Risk topology data                                                 */
/* ------------------------------------------------------------------ */

const riskMatrix = [
  { strategy: '趋势跟踪', bull: 35, shakeout: -12, blackswan: 15, liquidity: -5 },
  { strategy: '均值回归', bull: 10, shakeout: 22, blackswan: -35, liquidity: -18 },
  { strategy: '突破交易', bull: 40, shakeout: -20, blackswan: -25, liquidity: -10 },
  { strategy: '因子选股', bull: 25, shakeout: 5, blackswan: -15, liquidity: -8 },
];

const marketLabels = ['强牛市', '剧烈震荡', '黑天鹅崩盘', '流动性枯竭'];

/* ------------------------------------------------------------------ */
/*  Easing                                                             */
/* ------------------------------------------------------------------ */

const easeExpoOut = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Animated Gradient BG (Hero)                                      */
/* ------------------------------------------------------------------ */

function AnimatedGradientBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-20"
        style={{
          background: `
            radial-gradient(ellipse 600px 400px at 30% 40%, rgba(0,255,148,0.15), transparent 60%),
            radial-gradient(ellipse 500px 350px at 70% 60%, rgba(255,42,109,0.10), transparent 60%),
            radial-gradient(ellipse 400px 300px at 50% 30%, rgba(212,175,55,0.08), transparent 60%)
          `,
          animation: 'gradientShift 12s ease-in-out infinite alternate',
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(206,209,213,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(206,209,213,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mini Equity Curve Chart                                            */
/* ------------------------------------------------------------------ */

function MiniEquityCurve({ data, color }: { data: { value: number }[]; color: string }) {
  return (
    <div className="w-full h-[80px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={['auto', 'auto']} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${color.replace('#', '')})`}
            dot={false}
            animationDuration={2000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Strategy Card                                                      */
/* ------------------------------------------------------------------ */

function StrategyCard({ strategy, index }: { strategy: StrategyData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [showDetail, setShowDetail] = useState(false);

  const rotateX = useTransform(mouseY, [-150, 150], [3, -3]);
  const rotateY = useTransform(mouseX, [-150, 150], [-3, 3]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    mouseX.set(e.clientX - centerX);
    mouseY.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.7, delay: index * 0.15, ease: easeExpoOut }}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group relative"
    >
      <div
        className={`
          relative overflow-hidden rounded-lg
          bg-[rgba(21,22,26,0.7)]
          border border-[rgba(206,209,213,0.1)]
          transition-all duration-500 ease-expo-out
          hover:border-[rgba(${strategy.colorRgb},0.35)]
          ${strategy.glowClass} hover:shadow-[0_0_50px_rgba(${strategy.colorRgb},0.25)]
          hover:-translate-y-2
        `}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
          style={{ backgroundColor: strategy.color }}
        />

        {/* Corner decorations */}
        <div
          className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 opacity-20 transition-opacity duration-300 group-hover:opacity-50"
          style={{ borderColor: strategy.color }}
        />
        <div
          className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 opacity-20 transition-opacity duration-300 group-hover:opacity-50"
          style={{ borderColor: strategy.color }}
        />

        {/* Content */}
        <div className="p-6 lg:p-7">
          {/* Header row */}
          <div className="flex items-start justify-between mb-5">
            <div>
              {/* Badge & number */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-caption text-ash/40">0{index + 1} / 04</span>
                <span className={strategy.badgeClass}>{strategy.name}</span>
              </div>
              {/* Strategy name with glow */}
              <h3
                className="text-h2 font-heading transition-all duration-300 group-hover:drop-shadow-lg"
                style={{ color: strategy.color }}
              >
                {strategy.name}
              </h3>
            </div>
            {/* Icon */}
            <div
              className="flex items-center justify-center w-11 h-11 rounded-md border transition-all duration-300 group-hover:scale-110"
              style={{
                borderColor: `rgba(${strategy.colorRgb}, 0.3)`,
                color: strategy.color,
                backgroundColor: `rgba(${strategy.colorRgb}, 0.08)`,
              }}
            >
              {strategy.icon}
            </div>
          </div>

          {/* Description */}
          <p className="text-body text-ash/80 leading-relaxed mb-5 text-[15px]">
            {strategy.description}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-5">
            {strategy.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-0.5 text-[11px] font-mono tracking-wider rounded border"
                style={{
                  borderColor: `rgba(${strategy.colorRgb}, 0.25)`,
                  color: `rgba(${strategy.colorRgb}, 0.9)`,
                  backgroundColor: `rgba(${strategy.colorRgb}, 0.06)`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {strategy.metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-md p-3 transition-all duration-300 hover:bg-[rgba(206,209,213,0.04)]"
                style={{ borderLeft: `2px solid rgba(${strategy.colorRgb}, 0.3)` }}
              >
                <p className="text-caption text-ash/40 mb-1">{m.label}</p>
                <p className="text-data-point" style={{ color: strategy.color }}>
                  {m.value}
                </p>
                {m.subtitle && (
                  <p className="text-[11px] font-mono text-ash/35 mt-0.5 tracking-wide">{m.subtitle}</p>
                )}
              </div>
            ))}
          </div>

          {/* Mini equity curve */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-caption text-ash/35">模拟净值曲线</span>
              <Activity size={13} className="text-ash/25" />
            </div>
            <MiniEquityCurve data={strategy.equityCurve} color={strategy.color} />
          </div>

          {/* Best / Failure conditions */}
          <div className="space-y-2.5 mb-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-[#00FF94] mt-0.5 shrink-0" />
              <div>
                <span className="text-caption text-ash/50">最佳匹配标的: </span>
                <span className="text-caption text-ash/80">{strategy.bestStocks}</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <XCircle size={15} className="text-[#FF2A6D] mt-0.5 shrink-0" />
              <div>
                <span className="text-caption text-ash/50">失效条件: </span>
                <span className="text-caption text-ash/80">{strategy.failureConditions}</span>
              </div>
            </div>
          </div>

          {/* Detail Toggle Button */}
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded border border-[rgba(206,209,213,0.1)] bg-[rgba(206,209,213,0.03)] hover:bg-[rgba(206,209,213,0.06)] transition-colors group/detail"
          >
            <BookOpen size={14} style={{ color: strategy.color }} />
            <span className="font-mono text-[12px]" style={{ color: strategy.color }}>
              {showDetail ? '收起详情' : '详细说明'}
            </span>
            <ChevronDown
              size={12}
              className="transition-transform duration-300"
              style={{ color: strategy.color, transform: showDetail ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Detail Panel */}
          <AnimatePresence>
            {showDetail && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: easeExpoOut }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-4 rounded border border-[rgba(206,209,213,0.08)] bg-[rgba(11,12,16,0.4)] space-y-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: strategy.color }}>原理</span>
                    <p className="text-[13px] text-ash/70 mt-1 leading-relaxed">{strategy.detail.principle}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="flex items-start gap-2">
                      <ArrowRight size={12} className="mt-1 shrink-0" style={{ color: strategy.color }} />
                      <div>
                        <span className="text-[11px] font-mono text-ash/40">入场条件: </span>
                        <span className="text-[13px] text-ash/70">{strategy.detail.entryConditions}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight size={12} className="mt-1 shrink-0" style={{ color: strategy.color }} />
                      <div>
                        <span className="text-[11px] font-mono text-ash/40">出场条件: </span>
                        <span className="text-[13px] text-ash/70">{strategy.detail.exitConditions}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight size={12} className="mt-1 shrink-0" style={{ color: strategy.color }} />
                      <div>
                        <span className="text-[11px] font-mono text-ash/40">适用股票: </span>
                        <span className="text-[13px] text-ash/70">{strategy.detail.applicableStocks}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight size={12} className="mt-1 shrink-0" style={{ color: strategy.color }} />
                      <div>
                        <span className="text-[11px] font-mono text-ash/40">最佳市场: </span>
                        <span className="text-[13px] text-ash/70">{strategy.detail.bestMarket}</span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[rgba(206,209,213,0.06)]">
                    <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: strategy.color }}>操作示例</span>
                    <p className="text-[13px] text-ash/70 mt-1 leading-relaxed">{strategy.detail.operationExample}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk Topology Heatmap Cell                                         */
/* ------------------------------------------------------------------ */

function HeatmapCell({
  value,
}: {
  value: number;
}) {
  const isPositive = value >= 0;
  const intensity = Math.abs(value) / 45;

  const bgColor = isPositive
    ? `rgba(0, 255, 148, ${Math.max(0.08, intensity * 0.7)})`
    : `rgba(255, 42, 109, ${Math.max(0.08, intensity * 0.7)})`;

  const textColor = isPositive
    ? `rgba(0, 255, 148, ${Math.max(0.6, 0.5 + intensity * 0.5)})`
    : `rgba(255, 42, 109, ${Math.max(0.6, 0.5 + intensity * 0.5)})`;

  return (
    <motion.div
      whileHover={{ scale: 1.08, zIndex: 10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="relative flex items-center justify-center h-14 rounded-md cursor-default"
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${isPositive ? 'rgba(0,255,148,0.15)' : 'rgba(255,42,109,0.15)'}`,
      }}
    >
      <span className="text-data-point" style={{ color: textColor, fontSize: '18px' }}>
        {value > 0 ? '+' : ''}{value}%
      </span>
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-md opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `0 0 20px ${isPositive ? 'rgba(0,255,148,0.25)' : 'rgba(255,42,109,0.25)'}`,
        }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero Section                                                       */
/* ------------------------------------------------------------------ */

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <section
      ref={ref}
      className="relative min-h-[85dvh] flex flex-col items-center justify-center overflow-hidden pt-16"
      style={{ backgroundColor: '#0B0C10' }}
    >
      <AnimatedGradientBg />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 2 + i * 1.5,
              height: 2 + i * 1.5,
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 20}%`,
              backgroundColor: strategies[i % 4].color,
              opacity: 0.15,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.1, 0.25, 0.1],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.6,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: easeExpoOut }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[rgba(206,209,213,0.15)] bg-[rgba(21,22,26,0.6)] text-caption text-ash/50">
            <Layers size={13} className="text-ash/40" />
            策略生态库 / STRATEGY_ARCHIVE
          </span>
        </motion.div>

        {/* Main title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1, ease: easeExpoOut }}
          className="text-h1 font-heading text-pure mb-6 tracking-tight"
        >
          策略生态库
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.25, ease: easeExpoOut }}
          className="text-body text-ash/70 leading-relaxed max-w-2xl mx-auto mb-10 text-base"
        >
          动态演化的策略生态系统。在适应性市场假说 (AMH) 的框架下，策略如物种般争夺生态位。
          深度解剖四大核心策略——从趋势跟踪到因子选股，揭示每一种策略的盈利逻辑、风险暴露与最佳生态位。
        </motion.p>

        {/* Strategy summary bars */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4, ease: easeExpoOut }}
          className="flex flex-col sm:flex-row gap-2 sm:gap-0 w-full max-w-3xl mx-auto"
        >
          {strategies.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.12, ease: easeExpoOut }}
              className="group/bar flex-1 relative py-4 px-4 border border-[rgba(206,209,213,0.08)] rounded-md sm:rounded-none sm:first:rounded-l-md sm:last:rounded-r-md cursor-default transition-all duration-500 hover:flex-[1.3] hover:bg-[rgba(21,22,26,0.8)]"
              style={{ backgroundColor: 'rgba(21,22,26,0.4)' }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-caption text-ash/40 font-mono">{s.name}</span>
                <span className="text-data-point font-heading" style={{ color: s.color, fontSize: '20px' }}>
                  {s.cagr}%
                </span>
                <span className="text-[11px] font-mono text-ash/30">夏普 {s.sharpe}</span>
              </div>
              {/* Mini sparkline */}
              <div className="absolute bottom-0 left-1 right-1 h-[2px] opacity-30 group-hover/bar:opacity-60 transition-opacity">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`,
                  }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="mt-16 flex flex-col items-center gap-2"
        >
          <span className="text-caption text-ash/25">向下滚动探索</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ArrowRight size={16} className="text-ash/20 rotate-90" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Comparison Table Section                                           */
/* ------------------------------------------------------------------ */

function ComparisonTable() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      className="relative py-24 lg:py-32"
      style={{ backgroundColor: '#15161A' }}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: easeExpoOut }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[rgba(206,209,213,0.1)] bg-[rgba(11,12,16,0.5)] text-caption text-ash/40 mb-4">
            <BarChart3 size={13} className="text-ash/30" />
            策略对比
          </span>
          <h2 className="text-h2 font-heading text-pure mb-3">STRATEGY_COMPARISON</h2>
          <p className="text-body text-ash/50 max-w-lg mx-auto">
            四大策略的核心维度横向对比，找到适合你的生态位
          </p>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.15, ease: easeExpoOut }}
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse">
            {/* Header */}
            <thead>
              <tr>
                <th className="text-left p-4 text-caption text-ash/30 font-mono border-b border-[rgba(206,209,213,0.1)] min-w-[140px]">
                  对比维度
                </th>
                {strategies.map((s) => (
                  <th
                    key={s.id}
                    className="text-center p-4 border-b border-[rgba(206,209,213,0.1)] min-w-[130px]"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className={s.badgeClass}>{s.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {/* Body */}
            <tbody>
              {comparisonRows.map((row, rowIdx) => (
                <motion.tr
                  key={row.key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.25 + rowIdx * 0.06, ease: easeExpoOut }}
                  className="border-b border-[rgba(206,209,213,0.06)] hover:bg-[rgba(206,209,213,0.02)] transition-colors"
                >
                  <td className="p-4 text-caption text-ash/50 font-mono">{row.label}</td>
                  {row.values.map((val, colIdx) => (
                    <td key={colIdx} className="p-4 text-center">
                      <span
                        className="text-sm font-mono font-medium"
                        style={{ color: strategies[colIdx].color }}
                      >
                        {val}
                      </span>
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mt-8 flex flex-wrap justify-center gap-6"
        >
          {strategies.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-caption text-ash/40">{s.englishName}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk Topology Section                                              */
/* ------------------------------------------------------------------ */

function RiskTopology() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      className="relative py-24 lg:py-32"
      style={{ backgroundColor: '#0B0C10' }}
    >
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: easeExpoOut }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[rgba(206,209,213,0.1)] bg-[rgba(21,22,26,0.5)] text-caption text-ash/40 mb-4">
            <AlertTriangle size={13} className="text-ash/30" />
            风险暴露矩阵
          </span>
          <h2 className="text-h2 font-heading text-pure mb-3">RISK_TOPOLOGY</h2>
          <p className="text-body text-ash/50 max-w-lg mx-auto">
            四大策略在不同市场环境下的预期表现热力图
          </p>
        </motion.div>

        {/* Heatmap grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.15, ease: easeExpoOut }}
          className="overflow-x-auto"
        >
          {/* Column headers */}
          <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-2 mb-3 min-w-[500px]">
            <div />
            {marketLabels.map((label) => (
              <div key={label} className="text-center text-caption text-ash/40 font-mono py-2">
                {label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {riskMatrix.map((row, rowIdx) => (
            <div key={row.strategy} className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-2 mb-2 min-w-[500px]">
              <div className="flex items-center">
                <span
                  className="text-sm font-mono font-medium"
                  style={{ color: strategies[rowIdx].color }}
                >
                  {row.strategy}
                </span>
              </div>
              {[
                { key: 'bull', val: row.bull },
                { key: 'shakeout', val: row.shakeout },
                { key: 'blackswan', val: row.blackswan },
                { key: 'liquidity', val: row.liquidity },
              ].map(({ key, val }) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: -20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{
                    duration: 0.5,
                    delay: 0.3 + rowIdx * 0.08 + ['bull', 'shakeout', 'blackswan', 'liquidity'].indexOf(key) * 0.05,
                    ease: easeExpoOut,
                  }}
                >
                  <HeatmapCell value={val} />
                </motion.div>
              ))}
            </div>
          ))}
        </motion.div>

        {/* Legend */}
        <div className="mt-8 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[rgba(0,255,148,0.5)]" />
            <span className="text-caption text-ash/35">大赚</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[rgba(255,42,109,0.5)]" />
            <span className="text-caption text-ash/35">大亏</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[rgba(206,209,213,0.05)] border border-[rgba(206,209,213,0.1)]" />
            <span className="text-caption text-ash/35">持平</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA Section                                                        */
/* ------------------------------------------------------------------ */

function CTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      ref={ref}
      className="relative min-h-[50vh] flex items-center justify-center"
      style={{ backgroundColor: '#0B0C10' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, rgba(212,175,55,0.3) 0%, transparent 50%)`,
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: easeExpoOut }}
        className="relative z-10 text-center px-6"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Sparkles size={16} className="text-[#D4AF37]/50" />
          <span className="text-caption text-ash/35">READY TO EXPLORE?</span>
          <Sparkles size={16} className="text-[#D4AF37]/50" />
        </div>

        <h2 className="text-h2 font-heading text-pure mb-6">进入匹配引擎</h2>
        <p className="text-body text-ash/50 mb-10 max-w-md mx-auto">
          基于你的股票特征与市场状态，寻找最优策略生态位
        </p>

        <Link
          to="/match"
          className="group inline-flex items-center gap-3 font-mono text-lg text-ash hover:text-[#D4AF37] transition-colors duration-500"
        >
          <span className="relative">
            [ 进入匹配引擎 · 寻找你的最优生态位 ]
            <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#D4AF37] transition-all duration-500 group-hover:w-full" />
          </span>
          <ArrowRight
            size={18}
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </Link>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Strategy Cards Grid Section                                        */
/* ------------------------------------------------------------------ */

function StrategyCardsSection() {
  return (
    <section className="relative py-24 lg:py-32" style={{ backgroundColor: '#15161A' }}>
      {/* Subtle grid bg */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(206,209,213,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(206,209,213,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10">
        {/* Section header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: easeExpoOut }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[rgba(206,209,213,0.1)] bg-[rgba(11,12,16,0.5)] text-caption text-ash/40 mb-4">
              <Target size={13} className="text-ash/30" />
              四大核心策略
            </span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1, ease: easeExpoOut }}
            className="text-h2 font-heading text-pure mb-3"
          >
            策略全息画像
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2, ease: easeExpoOut }}
            className="text-body text-ash/50 max-w-2xl mx-auto"
          >
            每一种策略都是一个完整的生态系统——包含独特的盈利逻辑、风险特征与最佳适配标的
          </motion.p>
        </div>

        {/* Cards grid - 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {strategies.map((strategy, index) => (
            <StrategyCard key={strategy.id} strategy={strategy} index={index} />
          ))}
        </div>

        {/* Bottom note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-14 flex items-center justify-center gap-2"
        >
          <Shield size={14} className="text-ash/20" />
          <span className="text-caption text-ash/25">
            所有数据基于历史回测，仅供参考，不构成投资建议
          </span>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Strategies Page                                               */
/* ------------------------------------------------------------------ */

export default function Strategies() {
  return (
    <div className="min-h-[100dvh]">
      {/* Inject keyframe animation for gradient */}
      <style>{`
        @keyframes gradientShift {
          0% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(2%, 2%) rotate(1deg); }
          66% { transform: translate(-1%, 1%) rotate(-0.5deg); }
          100% { transform: translate(1%, -1%) rotate(0.5deg); }
        }
      `}</style>

      <HeroSection />
      <StrategyCardsSection />
      <ComparisonTable />
      <RiskTopology />
      <CTASection />
    </div>
  );
}