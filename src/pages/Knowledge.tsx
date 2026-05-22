import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  BookOpen, Brain, Layers, AlertTriangle, Globe,
  ChevronRight, Lightbulb, Cpu, GitBranch, Network, Shield,
  TrendingUp, TrendingDown, Target, BarChart3
} from 'lucide-react';

/* ──────────────────────── easing ──────────────────────── */
function easeExpoOut() {
  return [0.16, 1, 0.3, 1] as [number, number, number, number];
}

/* ──────────────────────── mock data ──────────────────────── */

const PBO_DATA = [
  { n: 1, return: 15 },
  { n: 5, return: 12 },
  { n: 10, return: 8 },
  { n: 20, return: 5 },
  { n: 50, return: 1 },
  { n: 100, return: -5 },
  { n: 200, return: -12 },
  { n: 500, return: -18 },
];

const EFFICIENCY_TIMELINE = [
  { year: 2005, efficiency: 45, strategy: '趋势跟踪', event: '股权分置改革' },
  { year: 2007, efficiency: 75, strategy: '趋势跟踪', event: '牛市顶峰' },
  { year: 2008, efficiency: 30, strategy: '均值回归', event: '金融危机' },
  { year: 2010, efficiency: 42, strategy: '突破交易', event: '四万亿刺激' },
  { year: 2012, efficiency: 50, strategy: '突破交易', event: '震荡市' },
  { year: 2015, efficiency: 65, strategy: '因子选股', event: '创业板泡沫' },
  { year: 2018, efficiency: 40, strategy: '均值回归', event: '贸易摩擦' },
  { year: 2020, efficiency: 55, strategy: '趋势跟踪', event: '疫情后复苏' },
  { year: 2022, efficiency: 48, strategy: '多策略协同', event: '量化内卷' },
  { year: 2024, efficiency: 60, strategy: 'AI自适应', event: '智能匹配' },
];

const MATCH_MATRIX = [
  { feature: '市值规模', trend: 60, revert: 90, breakout: 50, factor: 85 },
  { feature: '流动性', trend: 75, revert: 80, breakout: 65, factor: 90 },
  { feature: '波动率', trend: 95, revert: 40, breakout: 90, factor: 55 },
  { feature: '动量', trend: 95, revert: 30, breakout: 85, factor: 70 },
  { feature: '估值', trend: 50, revert: 85, breakout: 45, factor: 80 },
  { feature: '行业属性', trend: 70, revert: 75, breakout: 60, factor: 85 },
];

const STRATEGY_LABELS: Record<string, { name: string; color: string }> = {
  trend: { name: '趋势跟踪', color: '#00FF94' },
  revert: { name: '均值回归', color: '#FF2A6D' },
  breakout: { name: '突破交易', color: '#D4AF37' },
  factor: { name: '因子选股', color: '#00FF94' },
};

const ML_RESULTS = [
  {
    key: 'rl',
    label: 'REINFORCEMENT_LEARNING',
    badge: 'RL Ensemble',
    metric: '1.30',
    metricLabel: '夏普比率',
    color: '#00FF94',
    desc: 'PPO + SAC 集成，10,000 episodes 训练',
    details: ['方法: PPO + SAC 集成', '训练周期: 10,000 episodes', '学习率: 3e-4, 折扣因子 0.99', '回测周期: 2015-2024'],
    chart: [
      { x: 0, y: 0.6 }, { x: 1, y: 0.72 }, { x: 2, y: 0.80 }, { x: 3, y: 0.88 },
      { x: 4, y: 0.95 }, { x: 5, y: 1.02 }, { x: 6, y: 1.08 }, { x: 7, y: 1.15 },
      { x: 8, y: 1.22 }, { x: 9, y: 1.25 }, { x: 10, y: 1.30 },
    ],
  },
  {
    key: 'hmm',
    label: 'HIDDEN_MARKOV_MODEL',
    badge: 'HMM',
    metric: '80%',
    metricLabel: '状态识别准确率',
    color: '#D4AF37',
    desc: '4隐藏状态，EM算法200次收敛',
    details: ['隐藏状态数: 4 (S1-S4)', '观测变量: 收益率/波动率/成交量', 'EM算法迭代: 200次收敛', '前向-后向平滑'],
    chart: [
      { x: 0, y: 45 }, { x: 1, y: 52 }, { x: 2, y: 58 }, { x: 3, y: 63 },
      { x: 4, y: 68 }, { x: 5, y: 72 }, { x: 6, y: 74 }, { x: 7, y: 76 },
      { x: 8, y: 78 }, { x: 9, y: 79 }, { x: 10, y: 80 },
    ],
  },
  {
    key: 'maml',
    label: 'MODEL_AGNOSTIC_META_LEARNING',
    badge: 'MAML',
    metric: '+200%',
    metricLabel: '回报提升',
    color: '#FF2A6D',
    desc: '50个元训练任务，5-shot快速适应',
    details: ['元训练任务数: 50个股票-策略对', '内循环步数: 5', '外循环学习率: 1e-3', '适应样本: 仅20个交易日'],
    chart: [
      { x: 0, y: 100 }, { x: 1, y: 120 }, { x: 2, y: 135 }, { x: 3, y: 148 },
      { x: 4, y: 158 }, { x: 5, y: 168 }, { x: 6, y: 178 }, { x: 7, y: 185 },
      { x: 8, y: 192 }, { x: 9, y: 196 }, { x: 10, y: 200 },
    ],
  },
];

const CRISIS_2024 = [
  { date: '2024-01', event: '微盘股流动性危机爆发', impact: 'high' },
  { date: '2024-02', event: 'DMA策略集体回撤>30%', impact: 'high' },
  { date: '2024-03', event: '监管收紧量化交易申报', impact: 'medium' },
  { date: '2024-04', event: '中性策略基差扩大', impact: 'high' },
  { date: '2024-06', event: '行业洗牌，小作坊出清', impact: 'medium' },
  { date: '2024-09', event: '央行组合拳，市场反弹', impact: 'low' },
  { date: '2024-12', event: '头部机构规模逆势增长', impact: 'low' },
];

const BENCHMARKS = [
  {
    name: 'Renaissance Technologies',
    year: '1988',
    tag: 'Medallion Fund',
    metric: '66.1%',
    metricLabel: '年均回报',
    color: '#00FF94',
    desc: '量化之王。纯统计套利，几乎不受市场方向影响。',
    lesson: '数据质量与信号独立性是核心壁垒',
  },
  {
    name: 'DE Shaw',
    year: '1989',
    tag: 'DE Shaw Group',
    metric: '$600亿',
    metricLabel: 'AUM',
    color: '#CED1D5',
    desc: '计算机驱动投资的先驱。融合基本面与量化模型。',
    lesson: '基本面与量化的融合能产生稳定Alpha',
  },
  {
    name: 'Two Sigma',
    year: '2001',
    tag: 'Two Sigma',
    metric: '$640亿',
    metricLabel: 'AUM',
    color: '#D4AF37',
    desc: '数据科学的极致。100+ 数据源，10,000+ 信号。',
    lesson: '数据多样性比模型复杂度更重要',
  },
  {
    name: 'AQR Capital',
    year: '1998',
    tag: 'AQR',
    metric: '-40%',
    metricLabel: '2007-08回撤',
    color: '#FF2A6D',
    desc: '价值因子的信徒。量化寒冬的深刻教训：因子拥挤可致命。',
    lesson: '因子分散化优于因子择时',
  },
];

const AMH_PRINCIPLES = [
  {
    num: '01',
    title: '适应性原则',
    desc: '市场参与者不断调整策略以适应环境变化，如生物进化般优胜劣汰。',
    icon: <Brain size={20} />,
  },
  {
    num: '02',
    title: '生态位竞争',
    desc: '不同策略争夺有限的市场Alpha资源，形成动态平衡的策略生态系统。',
    icon: <Network size={20} />,
  },
  {
    num: '03',
    title: '时变效率',
    desc: '市场效率不是恒定的，而是在不同时间尺度上波动变化的。',
    icon: <GitBranch size={20} />,
  },
  {
    num: '04',
    title: '路径依赖',
    desc: '历史事件和市场结构演变对未来策略有效性产生深远影响。',
    icon: <Layers size={20} />,
  },
  {
    num: '05',
    title: '复杂适应',
    desc: '市场作为复杂系统涌现出自组织行为，简单的线性模型必然失效。',
    icon: <Cpu size={20} />,
  },
];

/* ──────────────────────── sub-components ──────────────────────── */

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: easeExpoOut() }}
      className="mb-8"
    >
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <h2 className="font-heading text-h2 text-pure">{title}</h2>
      </div>
      {subtitle && <p className="font-mono text-caption text-ash/50 ml-8">{subtitle}</p>}
    </motion.div>
  );
}



/* ─── EMH vs AMH comparison ─── */

function EMHvsAMH() {
  const [activeSide, setActiveSide] = useState<'emh' | 'amh' | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-[rgba(206,209,213,0.12)] rounded overflow-hidden">
      {/* EMH */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: easeExpoOut() }}
        className={`p-8 lg:p-10 transition-all duration-500 cursor-pointer ${
          activeSide === 'amh' ? 'opacity-40' : 'opacity-100'
        }`}
        style={{ backgroundColor: activeSide === 'emh' ? '#1a1a1e' : '#15161A' }}
        onClick={() => setActiveSide(activeSide === 'emh' ? null : 'emh')}
      >
        <h3 className="font-heading text-[clamp(40px,6vw,80px)] font-bold text-ash/30 leading-none mb-3">EMH</h3>
        <h4 className="font-heading text-xl text-ash mb-4">有效市场假说</h4>
        <p className="text-body text-ash/70 leading-relaxed max-w-[400px] mb-6">
          市场是完全理性的。价格即时反映所有信息。超额收益不可能持续存在。
        </p>
        <div className="space-y-2">
          {['价格服从随机游走', '无套利机会', '投资者完全理性', '信息瞬时传导'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-ash/40" />
              <span className="font-mono text-[12px] text-ash/60">{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-full border border-ash/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-ash/30" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[1px] w-8 bg-ash/20" />
          ))}
        </div>
      </motion.div>

      {/* AMH */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: easeExpoOut() }}
        className={`p-8 lg:p-10 transition-all duration-500 cursor-pointer border-l border-[rgba(206,209,213,0.08)] ${
          activeSide === 'emh' ? 'opacity-40' : 'opacity-100'
        }`}
        style={{ backgroundColor: activeSide === 'amh' ? '#0f1a14' : '#0B0C10' }}
        onClick={() => setActiveSide(activeSide === 'amh' ? null : 'amh')}
      >
        <h3 className="font-heading text-[clamp(40px,6vw,80px)] font-bold text-pure leading-none mb-3">AMH</h3>
        <h4 className="font-heading text-xl text-apex-green mb-4">自适应市场假说</h4>
        <p className="text-body text-ash/70 leading-relaxed max-w-[400px] mb-6">
          市场如生态系统般进化。策略争夺生态位，适应者生存。效率是时变的，Alpha 在动态中涌现。
        </p>
        <div className="space-y-2">
          {['市场持续演化', '策略生态位竞争', '适应性决定生存', '效率动态波动'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-apex-green" />
              <span className="font-mono text-[12px] text-ash/80">{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2 flex-wrap">
          {['趋势', '回归', '突破', '因子', 'AI'].map((label, i) => (
            <motion.div
              key={label}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }}
              className="px-3 py-1.5 rounded text-[10px] font-mono border"
              style={{
                borderColor: i % 2 === 0 ? 'rgba(0,255,148,0.3)' : 'rgba(255,42,109,0.3)',
                color: i % 2 === 0 ? '#00FF94' : '#FF2A6D',
                backgroundColor: i % 2 === 0 ? 'rgba(0,255,148,0.08)' : 'rgba(255,42,109,0.08)',
              }}
            >
              {label}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ─── AMH Principles ─── */

function AMHPrinciples() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {AMH_PRINCIPLES.map((p, i) => (
        <motion.div
          key={p.num}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: i * 0.1, ease: easeExpoOut() }}
          onClick={() => setExpanded(expanded === i ? null : i)}
          className="data-card cursor-pointer hover:border-apex-green/30 transition-all duration-300 group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[11px] text-ash/40">{p.num}</span>
            <div className="text-ash/50 group-hover:text-apex-green transition-colors">
              {p.icon}
            </div>
          </div>
          <h4 className="font-heading text-[15px] text-pure mb-2">{p.title}</h4>
          <AnimatePresence>
            {expanded === i && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[13px] text-ash/60 leading-relaxed overflow-hidden"
              >
                {p.desc}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="mt-2 flex items-center gap-1 text-ash/40">
            <ChevronRight size={12} className={`transition-transform ${expanded === i ? 'rotate-90' : ''}`} />
            <span className="font-mono text-[10px]">{expanded === i ? '收起' : '展开'}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Strategy Niche ─── */

function StrategyNiche() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: easeExpoOut() }}
      className="data-card"
    >
      <h3 className="font-heading text-lg text-pure mb-4 flex items-center gap-2">
        <Lightbulb size={16} className="text-gold-standard" />
        策略生态位
      </h3>
      <div className="relative">
        {/* Niche diagram */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 py-6">
          {/* Center: Market */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-2 border-gold-standard/50 flex flex-col items-center justify-center bg-[rgba(212,175,55,0.08)] animate-pulse-glow">
              <span className="font-heading text-[12px] text-gold-standard text-center block">市场</span>
              <span className="font-heading text-[12px] text-gold-standard text-center block">状态</span>
            </div>
          </div>
          {/* Arrows */}
          <div className="flex lg:flex-col items-center gap-1">
            <div className="w-8 h-[1px] lg:w-[1px] lg:h-8 bg-ash/20" />
            <ChevronRight size={12} className="text-ash/30 lg:rotate-90" />
            <div className="w-8 h-[1px] lg:w-[1px] lg:h-8 bg-ash/20" />
          </div>
          {/* Strategies */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: '趋势跟踪', color: '#00FF94', icon: <TrendingUp size={14} /> },
              { name: '均值回归', color: '#FF2A6D', icon: <TrendingDown size={14} /> },
              { name: '突破交易', color: '#D4AF37', icon: <Target size={14} /> },
              { name: '因子选股', color: '#00FF94', icon: <BarChart3 size={14} /> },
            ].map((s, i) => (
              <motion.div
                key={s.name}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, ease: easeExpoOut() }}
                className="px-4 py-3 rounded border flex items-center gap-2"
                style={{ borderColor: `${s.color}30`, backgroundColor: `${s.color}08` }}
              >
                <span style={{ color: s.color }}>{s.icon}</span>
                <span className="font-mono text-[12px]" style={{ color: s.color }}>{s.name}</span>
              </motion.div>
            ))}
          </div>
        </div>
        <p className="text-[14px] text-ash/60 leading-relaxed text-center max-w-[600px] mx-auto mt-4">
          策略生态位概念：不同的策略在不同的市场状态下各有优势，
          如同生态系统中的物种占据不同的生态位。智能匹配系统识别当前市场状态，
          将资金动态分配至最优策略组合。
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Three Layer Architecture ─── */

function ThreeLayerArch() {
  const [activeLayer, setActiveLayer] = useState(1);

  const layers = [
    {
      num: 1,
      title: '规则匹配',
      subtitle: 'Rule-based Matching',
      color: '#CED1D5',
      desc: '基于专家知识和经验规则的硬编码匹配逻辑。通过预定义的条件规则（如"高波动率+上涨趋势→趋势跟踪"）进行策略推荐。',
      features: ['硬编码规则', '专家经验', '低延迟执行', '可解释性强'],
    },
    {
      num: 2,
      title: '机器学习',
      subtitle: 'ML-based Matching',
      color: '#D4AF37',
      desc: '利用监督学习和无监督学习模型从历史数据中学习匹配模式。包括随机森林、梯度提升、神经网络等算法。',
      features: ['随机森林', '梯度提升', '特征工程', '模式识别'],
    },
    {
      num: 3,
      title: '元学习自适应',
      subtitle: 'Meta-learning Adaptive',
      color: '#00FF94',
      desc: '最高层级的匹配引擎。MAML算法使模型能够快速适应新的市场环境，仅需少量样本即可完成策略适配。',
      features: ['MAML快速适应', '少样本学习', '持续进化', '动态权重'],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Layer Stack */}
      <div className="space-y-3">
        {layers.map((layer) => (
          <motion.div
            key={layer.num}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: layer.num * 0.1, ease: easeExpoOut() }}
            onClick={() => setActiveLayer(layer.num)}
            className={`relative p-5 rounded border cursor-pointer transition-all duration-300 ${
              activeLayer === layer.num ? 'border-opacity-60' : 'border-opacity-10'
            }`}
            style={{
              borderColor: activeLayer === layer.num ? layer.color : 'rgba(206,209,213,0.1)',
              backgroundColor: activeLayer === layer.num ? `${layer.color}10` : '#15161A',
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded flex items-center justify-center font-heading text-lg font-bold"
                style={{ backgroundColor: `${layer.color}15`, color: layer.color }}
              >
                {layer.num}
              </div>
              <div className="flex-1">
                <h4 className="font-heading text-[16px] text-pure">{layer.title}</h4>
                <p className="font-mono text-[11px] text-ash/50">{layer.subtitle}</p>
              </div>
              <ChevronRight
                size={16}
                className="transition-transform"
                style={{ color: layer.color, transform: activeLayer === layer.num ? 'rotate(90deg)' : 'none' }}
              />
            </div>
            <AnimatePresence>
              {activeLayer === layer.num && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-[13px] text-ash/60 leading-relaxed mt-3 pl-14">{layer.desc}</p>
                  <div className="flex flex-wrap gap-2 mt-3 pl-14">
                    {layer.features.map((f) => (
                      <span
                        key={f}
                        className="px-2 py-1 rounded text-[10px] font-mono"
                        style={{ backgroundColor: `${layer.color}12`, color: layer.color, border: `1px solid ${layer.color}25` }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Flow Diagram */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: easeExpoOut() }}
        className="data-card"
      >
        <h4 className="font-heading text-[15px] text-pure mb-4">匹配流程</h4>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-4">
          {[
            { label: '股票特征', sub: '六维分析', color: '#FF2A6D' },
            { label: '→', sub: '', color: '#CED1D5' },
            { label: '市场状态', sub: '状态识别', color: '#D4AF37' },
            { label: '→', sub: '', color: '#CED1D5' },
            { label: '策略推荐', sub: '最优匹配', color: '#00FF94' },
          ].map((step, i) => (
            <div key={i} className="flex items-center">
              {step.label === '→' ? (
                <ChevronRight size={16} className="text-ash/30 hidden sm:block" />
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="px-4 py-3 rounded border text-center min-w-[100px]"
                  style={{ borderColor: `${step.color}40`, backgroundColor: `${step.color}08` }}
                >
                  <div className="font-heading text-[13px]" style={{ color: step.color }}>{step.label}</div>
                  <div className="font-mono text-[10px] text-ash/50">{step.sub}</div>
                </motion.div>
              )}
              {step.label !== '→' && i < 4 && (
                <ChevronRight size={16} className="text-ash/30 mx-1 sm:hidden" />
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Match Matrix ─── */

function MatchMatrix() {
  const getBgColor = (val: number) => {
    if (val >= 80) return 'rgba(0, 255, 148, 0.25)';
    if (val >= 60) return 'rgba(0, 255, 148, 0.1)';
    if (val >= 40) return 'rgba(206, 209, 213, 0.06)';
    return 'rgba(255, 42, 109, 0.12)';
  };
  const getTextColor = (val: number) => {
    if (val >= 80) return '#00FF94';
    if (val >= 60) return '#8BFFA8';
    if (val >= 40) return '#CED1D5';
    return '#FF6B8A';
  };

  return (
    <div className="data-card overflow-x-auto">
      <h4 className="font-heading text-[15px] text-pure mb-4">特征 × 策略 匹配矩阵</h4>
      <div className="min-w-[500px]">
        <div className="grid grid-cols-[100px_repeat(4,1fr)] gap-1">
          <div />
          {Object.values(STRATEGY_LABELS).map((s) => (
            <div key={s.name} className="text-center font-mono text-[11px] py-2" style={{ color: s.color }}>
              {s.name}
            </div>
          ))}
          {MATCH_MATRIX.map((row) => (
            <div key={row.feature} className="contents">
              <div className="font-mono text-[12px] text-ash/70 flex items-center px-2">{row.feature}</div>
              {(['trend', 'revert', 'breakout', 'factor'] as const).map((key) => {
                const val = row[key];
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="h-10 rounded flex items-center justify-center font-mono text-[13px] font-bold"
                    style={{ backgroundColor: getBgColor(val), color: getTextColor(val) }}
                  >
                    {val}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── ML Results ─── */

function MLResults() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {ML_RESULTS.map((ml, i) => (
        <motion.div
          key={ml.key}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, delay: i * 0.15, ease: easeExpoOut() }}
          className="data-card"
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="px-2 py-1 rounded text-[10px] font-mono uppercase border"
              style={{ borderColor: `${ml.color}40`, color: ml.color, backgroundColor: `${ml.color}10` }}
            >
              {ml.badge}
            </span>
          </div>
          <div className="mb-2">
            <span className="font-heading text-[32px] font-bold" style={{ color: ml.color }}>{ml.metric}</span>
            <span className="font-mono text-[11px] text-ash/50 ml-2">{ml.metricLabel}</span>
          </div>
          <p className="text-[12px] text-ash/50 mb-4">{ml.desc}</p>
          {/* Mini chart */}
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={ml.chart}>
              <Line
                type="monotone"
                dataKey="y"
                stroke={ml.color}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1">
            {ml.details.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: ml.color }} />
                <span className="font-mono text-[11px] text-ash/60">{d}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Overfitting Warning ─── */

function OverfittingWarning() {
  return (
    <section className="py-16 lg:py-20" style={{ backgroundColor: '#000000' }}>
      <div className="max-w-[800px] mx-auto px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, filter: 'blur(20px)' }}
          whileInView={{ opacity: 1, filter: 'blur(0px)' }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: easeExpoOut() }}
          className="text-center mb-10"
        >
          <h2
            className="font-heading text-[clamp(28px,5vw,56px)] font-bold leading-tight mb-4"
            style={{
              color: '#FF2A6D',
              textShadow: '0 0 20px rgba(255, 42, 109, 0.8), 0 0 40px rgba(255, 42, 109, 0.4)',
            }}
          >
            THE_BACKTEST_LIE
          </h2>
          <p className="font-mono text-[12px] text-ash/50 uppercase tracking-widest">回测之谎 — 过拟合警示</p>
        </motion.div>

        {/* PBO Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2, ease: easeExpoOut() }}
          className="data-card mb-8"
        >
          <h4 className="font-heading text-[14px] text-pure mb-4 text-center">回测优化次数 vs 实盘超额收益</h4>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={PBO_DATA}>
              <defs>
                <linearGradient id="pboGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00FF94" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FF2A6D" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(206,209,213,0.06)" />
              <XAxis dataKey="n" tick={{ fontSize: 11, fill: '#CED1D5' }} label={{ value: '优化次数', position: 'insideBottom', offset: -5, style: { fontSize: 10, fill: '#CED1D550' } }} />
              <YAxis tick={{ fontSize: 11, fill: '#CED1D5' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#15161A', border: '1px solid rgba(206,209,213,0.15)', fontSize: 12 }}
                formatter={(value: number) => [`${value}%`, '实盘超额收益']}
              />
              <ReferenceLine y={0} stroke="rgba(206,209,213,0.3)" strokeDasharray="4 4" label={{ value: '零Alpha线', position: 'right', style: { fontSize: 10, fill: '#CED1D560' } }} />
              <Area type="monotone" dataKey="return" stroke="url(#pboGrad)" strokeWidth={2} fill="url(#pboGrad)" dot={{ r: 3, fill: '#FF2A6D' }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-center mt-2">
            <span className="font-mono text-[11px] text-reversion-red bg-reversion-red/10 px-3 py-1 rounded border border-reversion-red/20">
              PBO &gt; 0.5 时策略失效
            </span>
          </div>
        </motion.div>

        {/* Warning Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'PBO > 0.5 时', value: '78%', sub: 'OOS 收益为负', delay: 0 },
            { label: '回测-实盘衰减', value: '30-65%', sub: '性能落差', delay: 0.15 },
            { label: '最优策略池规模', value: '5-10个', sub: '反个性化核心', delay: 0.3 },
          ].map((card) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: card.delay, ease: easeExpoOut() }}
              className="data-card text-center"
            >
              <p className="font-mono text-[11px] text-ash/50 mb-2">{card.label}</p>
              <p className="font-heading text-[28px] font-bold text-reversion-red mb-1">{card.value}</p>
              <p className="font-mono text-[11px] text-ash/40">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Warning Text */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-[15px] text-ash/60 leading-[1.8] text-center max-w-[600px] mx-auto"
        >
          过度优化的策略是对历史数据的精确拟合，而非对未来的有效预测。
          当概率回测过拟合 (PBO) 超过 0.5 时，78% 的策略在样本外表现为负收益。
          真正的 Alpha 来自 5-10 个核心策略的动态权重分配，而非数百个参数的过度调优。
        </motion.p>
      </div>
    </section>
  );
}

/* ─── 2024 Crisis Timeline ─── */

function Crisis2024() {
  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-6">
        <AlertTriangle size={16} className="text-reversion-red" />
        <h3 className="font-heading text-lg text-pure">2024 量化危机时间线</h3>
      </div>
      <div className="relative pl-6 border-l-2 border-[rgba(255,42,109,0.2)] space-y-5">
        {CRISIS_2024.map((item, i) => (
          <motion.div
            key={item.date}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, ease: easeExpoOut() }}
            className="relative"
          >
            <div
              className="absolute -left-[31px] top-1 w-3 h-3 rounded-full border-2"
              style={{
                borderColor: item.impact === 'high' ? '#FF2A6D' : item.impact === 'medium' ? '#D4AF37' : '#00FF94',
                backgroundColor: '#0B0C10',
              }}
            />
            <span className="font-mono text-[11px] text-ash/40">{item.date}</span>
            <p className="text-[14px] text-ash/80 mt-0.5">{item.event}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Anti-individualization ─── */

function AntiIndividualization() {
  return (
    <div className="data-card">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">反个性化洞察</h3>
      </div>
      <p className="text-[14px] text-ash/60 leading-relaxed mb-5">
        量化投资的核心悖论：越是&ldquo;个性化&rdquo;的策略，越容易过拟合。
        真正稳健的收益来自有限的核心策略池 + 动态权重调整。
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded border border-apex-green/20 bg-apex-green/5 text-center">
          <p className="font-heading text-[28px] font-bold text-apex-green mb-1">5-10</p>
          <p className="font-mono text-[11px] text-ash/50">核心策略数量</p>
        </div>
        <div className="p-4 rounded border border-gold-standard/20 bg-gold-standard/5 text-center">
          <p className="font-heading text-[28px] font-bold text-gold-standard mb-1">动态</p>
          <p className="font-mono text-[11px] text-ash/50">权重分配机制</p>
        </div>
      </div>
      <div className="mt-4 p-3 rounded bg-[rgba(0,255,148,0.05)] border border-apex-green/10">
        <p className="font-mono text-[12px] text-apex-green/80 leading-relaxed">
          &ldquo;不要在策略上追求独特性，要在执行和风控上建立壁垒。&rdquo;
        </p>
      </div>
    </div>
  );
}

/* ─── Global Benchmarks ─── */

function GlobalBenchmarks() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {BENCHMARKS.map((b, i) => (
        <motion.div
          key={b.name}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: i * 0.1, ease: easeExpoOut() }}
          className="data-card"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <span
                className="inline-block px-2 py-0.5 rounded text-[10px] font-mono mb-2"
                style={{ backgroundColor: `${b.color}15`, color: b.color, border: `1px solid ${b.color}30` }}
              >
                {b.tag}
              </span>
              <h4 className="font-heading text-[16px] text-pure">{b.name}</h4>
            </div>
            <span className="font-mono text-[11px] text-ash/40">{b.year}</span>
          </div>
          <div className="mb-3">
            <span className="font-heading text-[28px] font-bold" style={{ color: b.color }}>{b.metric}</span>
            <span className="font-mono text-[11px] text-ash/50 ml-2">{b.metricLabel}</span>
          </div>
          <p className="text-[13px] text-ash/60 leading-relaxed mb-3">{b.desc}</p>
          <div className="pt-3 border-t border-[rgba(206,209,213,0.08)]">
            <span className="font-mono text-[10px] text-ash/40 uppercase tracking-wider">核心教训</span>
            <p className="text-[12px] text-ash/70 mt-1">{b.lesson}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ──────────────────────── MAIN PAGE ──────────────────────── */

export default function Knowledge() {
  return (
    <div className="min-h-[100dvh] bg-void pt-16">
      {/* ─── Section 1: Theory Framework ─── */}
      <section className="py-12 lg:py-16 border-b border-[rgba(206,209,213,0.06)]">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <SectionTitle
            icon={<BookOpen size={20} className="text-apex-green" />}
            title="理论框架"
            subtitle="THEORY_FRAMEWORK — 从EMH到AMH的范式革命"
          />

          <div className="mb-10">
            <EMHvsAMH />
          </div>

          <div className="mb-10">
            <motion.h3
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: easeExpoOut() }}
              className="font-heading text-lg text-pure mb-4"
            >
              AMH 五大核心原则
            </motion.h3>
            <AMHPrinciples />
          </div>

          <StrategyNiche />
        </div>
      </section>

      {/* ─── Section 2: Matching Methodology ─── */}
      <section className="py-12 lg:py-16 border-b border-[rgba(206,209,213,0.06)]" style={{ backgroundColor: '#15161A' }}>
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <SectionTitle
            icon={<Layers size={20} className="text-gold-standard" />}
            title="匹配方法论"
            subtitle="MATCHING_METHODOLOGY — 三层架构与匹配流程"
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              <ThreeLayerArch />
            </div>
            <div className="lg:col-span-2">
              <MatchMatrix />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 3: ML Results ─── */}
      <section className="py-12 lg:py-16 border-b border-[rgba(206,209,213,0.06)]">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <SectionTitle
            icon={<Cpu size={20} className="text-apex-green" />}
            title="ML 实证成果"
            subtitle="ML_EMPRICAL_RESULTS — 机器学习匹配性能验证"
          />
          <MLResults />
        </div>
      </section>

      {/* ─── Section 4: Overfitting Warning ─── */}
      <OverfittingWarning />

      {/* ─── Section 5: Research Findings ─── */}
      <section className="py-12 lg:py-16 border-b border-[rgba(206,209,213,0.06)]" style={{ backgroundColor: '#15161A' }}>
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <SectionTitle
            icon={<AlertTriangle size={20} className="text-reversion-red" />}
            title="关键研究发现"
            subtitle="KEY_RESEARCH_FINDINGS — 危机、教训与洞察"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Crisis2024 />
            <AntiIndividualization />
          </div>

          {/* Efficiency Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: easeExpoOut() }}
            className="data-card mt-6"
          >
            <h4 className="font-heading text-[15px] text-pure mb-4">AMH 市场效率演化时间线 (2005-2024)</h4>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={EFFICIENCY_TIMELINE}>
                <defs>
                  <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(206,209,213,0.06)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#CED1D5' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#CED1D5' }} tickFormatter={(v) => `${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#15161A', border: '1px solid rgba(206,209,213,0.15)', fontSize: 12 }}
                  formatter={(value: number) => [`${value}`, '效率指数']}
                />
                <Area type="monotone" dataKey="efficiency" stroke="#D4AF37" strokeWidth={2} fill="url(#effGrad)" dot={{ r: 4, fill: '#D4AF37' }} name="效率指数" />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </section>

      {/* ─── Section 6: International Benchmarks ─── */}
      <section className="py-12 lg:py-16">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <SectionTitle
            icon={<Globe size={20} className="text-gold-standard" />}
            title="国际标杆"
            subtitle="GLOBAL_BENCHMARKS — 顶尖量化基金的业绩与教训"
          />
          <GlobalBenchmarks />
        </div>
      </section>
    </div>
  );
}
