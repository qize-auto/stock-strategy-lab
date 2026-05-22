import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  FlaskConical,
  Save,
  Play,
  Trash2,
  Wand2,
  Shield,
  Target,
  TrendingUp,
  Activity,
  CheckCircle2,
  X,
  Loader2,
  Sparkles,
  BarChart3,
  Dna,
  Layers,
  Star,
  Hash,
  LayoutTemplate,
  Settings2,
  Clock,
  PackageOpen,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  RotateCcw,
  Percent,
  DollarSign,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { generateKLines, queryStock, BUILT_IN_STOCKS } from '@/services/stockApi';
import type { KLineData } from '@/services/stockApi';
import {
  scoreCombination,
  exploreCombinations,
  ENTRY_SIGNALS,
  EXIT_SIGNALS,
  FILTERS,
  RISK_MANAGEMENT,
  POSITION_MANAGEMENT,
  STRATEGY_TEMPLATES,
  cloneElement,
  setElementLogic,
  applyTemplate,
  getStrategyLibraryStats,
} from '@/services/strategyEngine';
import type { BacktestConfig } from '@/services/strategyEngine';
import {
  runDetailedBacktest,
  type EvolutionConfig,
  type EvolutionResult,
  type BacktestMetrics,
} from '@/services/strategyEvolution';
import { useEvolutionWorker } from '@/hooks/useEvolutionWorker';
import { useApp } from '@/contexts/AppContext';
import type { StrategyElement, CustomStrategy } from '@/contexts/AppContext';

/* ──────────────────────── Types ──────────────────────── */

interface BuilderElement extends StrategyElement {
  uid: string;
}

interface ExploreResultItem {
  combo: {
    id: string;
    name: string;
    description: string;
    elements: StrategyElement[];
  };
  score: number;
}

interface FitnessChartPoint {
  generation: number;
  best: number;
  average: number;
  diversity: number;
}

/* ──────────────────────── Easing ──────────────────────── */

const easeExpoOut = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ──────────────────────── Signal Card ──────────────────────── */

function SignalCard({
  element,
  isSelected,
  onToggle,
}: {
  element: StrategyElement;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const typeColors: Record<string, string> = {
    entry: '#00FF94',
    exit: '#FF2A6D',
    filter: '#D4AF37',
    risk: '#4A6FA5',
    position: '#9B59B6',
  };
  const typeLabels: Record<string, string> = {
    entry: '入场信号',
    exit: '出场信号',
    filter: '过滤器',
    risk: '风控规则',
    position: '仓位管理',
  };

  return (
    <button
      onClick={onToggle}
      className={`relative w-full text-left p-4 border transition-all duration-200 ${
        isSelected
          ? 'border-opacity-60 bg-opacity-5'
          : 'border-[rgba(206,209,213,0.08)] bg-[rgba(11,12,16,0.4)] hover:border-[rgba(206,209,213,0.2)]'
      }`}
      style={
        isSelected
          ? {
              borderColor: typeColors[element.type],
              backgroundColor: `${typeColors[element.type]}08`,
            }
          : undefined
      }
    >
      {isSelected && (
        <div
          className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center"
          style={{ color: typeColors[element.type] }}
        >
          <CheckCircle2 size={14} />
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className="font-mono text-[10px] px-1.5 py-0.5"
          style={{
            color: typeColors[element.type],
            backgroundColor: `${typeColors[element.type]}15`,
          }}
        >
          {typeLabels[element.type]}
        </span>
        {element.logic && (
          <span
            className="font-mono text-[9px] px-1 py-0.5 uppercase"
            style={{
              color: element.logic === 'and' ? '#00FF94' : '#D4AF37',
              backgroundColor: element.logic === 'and' ? 'rgba(0,255,148,0.1)' : 'rgba(212,175,55,0.1)',
            }}
          >
            {element.logic.toUpperCase()}
          </span>
        )}
      </div>
      <p className="font-mono text-[13px] text-pure font-medium mb-1">{element.name}</p>
      <p className="font-mono text-[11px] text-ash/40 leading-relaxed">{element.description}</p>
    </button>
  );
}

/* ──────────────────────── Template Card ──────────────────────── */

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: typeof STRATEGY_TEMPLATES[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const categoryColors: Record<string, string> = {
    '趋势类': '#00FF94',
    '回归类': '#D4AF37',
    '突破类': '#FF6B35',
    '因子类': '#4A6FA5',
    '形态类': '#9B59B6',
    '波动类': '#1ABC9C',
  };

  return (
    <button
      onClick={onSelect}
      className={`relative w-full text-left p-4 border transition-all duration-200 ${
        isSelected
          ? 'border-[#D4AF37] bg-[rgba(212,175,55,0.05)]'
          : 'border-[rgba(206,209,213,0.08)] bg-[rgba(11,12,16,0.4)] hover:border-[rgba(206,209,213,0.2)]'
      }`}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center text-gold-standard">
          <CheckCircle2 size={14} />
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="font-mono text-[9px] px-1.5 py-0.5"
          style={{
            color: categoryColors[template.category] || '#D4AF37',
            backgroundColor: `${categoryColors[template.category] || '#D4AF37'}15`,
          }}
        >
          {template.category}
        </span>
        <span className="font-mono text-[9px] text-ash/30">
          建议持仓 {template.recommendedHoldingDays} 天
        </span>
      </div>
      <p className="font-mono text-[13px] text-pure font-medium mb-1">{template.name}</p>
      <p className="font-mono text-[11px] text-ash/40 leading-relaxed mb-3">{template.description}</p>
      <div className="flex flex-wrap gap-1">
        {template.elements.map((el) => {
          const tc: Record<string, string> = { entry: '#00FF94', exit: '#FF2A6D', filter: '#D4AF37', risk: '#4A6FA5', position: '#9B59B6' };
          return (
            <span
              key={el.id}
              className="inline-flex items-center px-1.5 py-0.5 font-mono text-[9px] border"
              style={{ color: tc[el.type], borderColor: `${tc[el.type]}25`, backgroundColor: `${tc[el.type]}08` }}
            >
              {el.name}
            </span>
          );
        })}
      </div>
    </button>
  );
}

/* ──────────────────────── Current Combo Display ──────────────────────── */

function CurrentCombo({ elements }: { elements: BuilderElement[] }) {
  const typeLabels: Record<string, string> = { entry: '入场', exit: '出场', filter: '过滤', risk: '风控', position: '仓位' };
  const typeColors: Record<string, string> = { entry: '#00FF94', exit: '#FF2A6D', filter: '#D4AF37', risk: '#4A6FA5', position: '#9B59B6' };

  const entryEls = elements.filter((e) => e.type === 'entry');
  const exitEls = elements.filter((e) => e.type === 'exit');
  const filterEls = elements.filter((e) => e.type === 'filter');
  const riskEls = elements.filter((e) => e.type === 'risk');
  const posEls = elements.filter((e) => e.type === 'position');

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {(['entry', 'exit', 'filter', 'risk', 'position'] as const).map((type) => {
        const typeEls = type === 'entry' ? entryEls : type === 'exit' ? exitEls : type === 'filter' ? filterEls : type === 'risk' ? riskEls : posEls;
        return (
          <div
            key={type}
            className="p-4 border border-[rgba(206,209,213,0.1)] bg-[rgba(11,12,16,0.5)] min-h-[80px]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px]" style={{ color: typeColors[type] }}>
                {typeLabels[type]}
              </span>
              <span className="font-mono text-[10px] text-ash/30">
                {typeEls.length > 0 ? `${typeEls.length}个` : '未选择'}
              </span>
            </div>
            {typeEls.length === 0 ? (
              <span className="font-mono text-[11px] text-ash/20">未选择</span>
            ) : (
              <div className="space-y-1">
                {typeEls.map((el) => (
                  <span key={el.uid} className="font-mono text-[11px] text-pure block truncate">
                    {el.name}
                    {el.logic && (
                      <span className="ml-1 text-[9px] opacity-50">[{el.logic.toUpperCase()}]</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────── Logic Toggle ──────────────────────── */

function LogicToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 'and' | 'or';
  onChange: (v: 'and' | 'or') => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-ash/40">{label}</span>
      <button
        onClick={() => onChange(value === 'and' ? 'or' : 'and')}
        className="flex items-center gap-1.5 px-2 py-1 border rounded transition-all"
        style={{
          borderColor: value === 'and' ? 'rgba(0,255,148,0.3)' : 'rgba(212,175,55,0.3)',
          backgroundColor: value === 'and' ? 'rgba(0,255,148,0.05)' : 'rgba(212,175,55,0.05)',
        }}
      >
        {value === 'and' ? (
          <ToggleRight size={14} className="text-apex-green" />
        ) : (
          <ToggleLeft size={14} className="text-gold-standard" />
        )}
        <span
          className="font-mono text-[10px]"
          style={{ color: value === 'and' ? '#00FF94' : '#D4AF37' }}
        >
          {value === 'and' ? '全部满足 (AND)' : '任一满足 (OR)'}
        </span>
      </button>
    </div>
  );
}

/* ──────────────────────── Builder Mode ──────────────────────── */

function BuilderMode() {
  const [elements, setElements] = useState<BuilderElement[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [strategyName, setStrategyName] = useState('');
  const [saved, setSaved] = useState(false);
  const [stockCode, setStockCode] = useState('600519');
  const [stockName, setStockName] = useState('贵州茅台');
  const [stockLoading, setStockLoading] = useState(false);

  // Signal logic state
  const [entryLogic, setEntryLogic] = useState<'and' | 'or'>('or');
  const [exitLogic, setExitLogic] = useState<'and' | 'or'>('or');

  // Holding period
  const [holdingPeriod, setHoldingPeriod] = useState(30);

  // Template selector
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Stats
  const [stats] = useState(() => getStrategyLibraryStats());

  const { addStrategy, refreshStrategies } = useApp();

  /* Fetch stock name when code changes */
  const handleStockCodeChange = useCallback(async (code: string) => {
    setStockCode(code);
    if (!/^\d{6}$/.test(code)) {
      setStockName('');
      return;
    }
    const builtIn = BUILT_IN_STOCKS[code];
    if (builtIn) {
      setStockName(builtIn.name);
      return;
    }
    setStockLoading(true);
    try {
      const info = await queryStock(code);
      setStockName(info?.name || '未知股票');
    } catch {
      setStockName('未知股票');
    } finally {
      setStockLoading(false);
    }
  }, []);

  /* Initial load for default code */
  useEffect(() => {
    handleStockCodeChange(stockCode);
  }, []);

  const isElementSelected = useCallback(
    (el: StrategyElement) => elements.some((e) => e.id === el.id),
    [elements],
  );

  const toggleElement = useCallback((el: StrategyElement) => {
    setElements((prev) => {
      const exists = prev.some((e) => e.id === el.id);
      if (exists) {
        return prev.filter((e) => e.id !== el.id);
      }
      return [...prev, { ...cloneElement(el), uid: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
    });
    setSaved(false);
  }, []);

  const removeElement = useCallback((uid: string) => {
    setElements((prev) => prev.filter((e) => e.uid !== uid));
    setSaved(false);
  }, []);

  const handleApplyTemplate = useCallback((template: typeof STRATEGY_TEMPLATES[0]) => {
    const strategy = applyTemplate(template);
    const newElements: BuilderElement[] = strategy.elements.map((el) => ({
      ...cloneElement(el),
      uid: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    }));
    setElements(newElements);
    setStrategyName(template.name);
    setSelectedTemplateId(template.id);
    setHoldingPeriod(template.recommendedHoldingDays);
    setSaved(false);
  }, []);

  const handleEntryLogicChange = useCallback((logic: 'and' | 'or') => {
    setEntryLogic(logic);
    setElements((prev) => {
      const updated = setElementLogic(prev, 'entry', logic);
      return updated.map((e) => ({ ...e, uid: (e as BuilderElement).uid || `el_${Date.now()}` }));
    });
  }, []);

  const handleExitLogicChange = useCallback((logic: 'and' | 'or') => {
    setExitLogic(logic);
    setElements((prev) => {
      const updated = setElementLogic(prev, 'exit', logic);
      return updated.map((e) => ({ ...e, uid: (e as BuilderElement).uid || `el_${Date.now()}` }));
    });
  }, []);

  const runBacktest = useCallback(async () => {
    if (elements.filter((e) => e.type === 'entry').length === 0) return;
    setIsRunning(true);

    let kline: any[];
    if (/^\d{6}$/.test(stockCode)) {
      try {
        const { generateKLines } = await import('@/services/stockApi');
        const builtIn = BUILT_IN_STOCKS[stockCode];
        kline = await generateKLines((builtIn as any)?.basePrice || 50, stockCode, 120);
      } catch {
        const { generateKLines } = await import('@/services/stockApi');
        kline = await generateKLines(50, stockCode, 120);
      }
    } else {
      const { generateKLines } = await import('@/services/stockApi');
      kline = await generateKLines(50, 'test_code', 120);
    }

    // 检查K线数据是否为空（科创板/北交所等可能无数据）
    if (!kline || kline.length === 0) {
      setScore(0);
      setIsRunning(false);
      return;
    }

    const plainElements = elements.map((e) => {
      const { uid: _uid, ...rest } = e;
      void _uid;
      return rest;
    });

    const config: Partial<BacktestConfig> = {
      holdingPeriodMax: holdingPeriod,
      entryLogic,
      exitLogic,
    };

    setTimeout(() => {
      const result = scoreCombination(kline, { elements: plainElements }, config);
      setScore(result);
      setIsRunning(false);
    }, 300);
  }, [elements, stockCode, holdingPeriod, entryLogic, exitLogic]);

  const handleSave = useCallback(() => {
    if (!strategyName.trim() || score === null) return;
    const plainElements = elements.map((e) => {
      const { uid: _uid, ...rest } = e;
      void _uid;
      return rest;
    });
    const strategy: CustomStrategy = {
      id: `custom_${Date.now()}`,
      name: strategyName.trim(),
      description: `标的:${stockCode} ${stockName} | 持仓:${holdingPeriod}天 | 入场逻辑:${entryLogic.toUpperCase()} | ` + plainElements.map((e) => `${e.type === 'entry' ? '入' : e.type === 'exit' ? '出' : e.type === 'filter' ? '滤' : e.type === 'risk' ? '控' : '仓'}:${e.name}`).join('; '),
      elements: plainElements,
      backtestScore: score,
      backtestReturn: 0,
      createdAt: new Date().toISOString(),
      isSystem: false,
    };
    addStrategy(strategy);
    refreshStrategies();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [strategyName, score, elements, stockCode, stockName, holdingPeriod, entryLogic, addStrategy, refreshStrategies]);

  return (
    <div>
      {/* Library Stats Bar */}
      <div className="mb-6 p-4 border border-[rgba(206,209,213,0.08)] bg-[rgba(11,12,16,0.4)]">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-gold-standard" />
          <span className="font-mono text-[11px] text-ash/50 tracking-wider">策略库统计</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: '入场信号', value: stats.entrySignals, color: '#00FF94' },
            { label: '出场信号', value: stats.exitSignals, color: '#FF2A6D' },
            { label: '过滤器', value: stats.filters, color: '#D4AF37' },
            { label: '风控规则', value: stats.riskRules, color: '#4A6FA5' },
            { label: '仓位规则', value: stats.positionRules, color: '#9B59B6' },
            { label: '策略模板', value: stats.templates, color: '#1ABC9C' },
          ].map((s) => (
            <div key={s.label} className="text-center p-2 border border-[rgba(206,209,213,0.06)] bg-[rgba(11,12,16,0.3)]">
              <p className="font-heading text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="font-mono text-[9px] text-ash/30">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Template Selector */}
      <div className="mb-6">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex items-center gap-2 mb-3 group"
        >
          <LayoutTemplate size={14} className="text-gold-standard" />
          <span className="font-mono text-[12px] text-pure">策略模板</span>
          <span className="font-mono text-[10px] text-ash/30">{STRATEGY_TEMPLATES.length}个预设策略</span>
          <ArrowRight size={12} className={`text-ash/30 transition-transform ${showTemplates ? 'rotate-90' : ''}`} />
        </button>

        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: easeExpoOut }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {STRATEGY_TEMPLATES.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    isSelected={selectedTemplateId === t.id}
                    onSelect={() => handleApplyTemplate(t)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stock Code Input */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Hash size={14} className="text-ash/40" />
          <span className="font-mono text-[12px] text-ash/60">回测标的</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={stockCode}
            onChange={(e) => handleStockCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="输入6位股票代码"
            maxLength={6}
            className="w-[120px] px-3 py-2 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50 transition-colors"
          />
          {stockLoading ? (
            <Loader2 size={14} className="text-ash/40 animate-spin" />
          ) : (
            <span className="font-mono text-[12px] text-ash/50">{stockName}</span>
          )}
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="mb-6 p-5 border border-[rgba(206,209,213,0.1)] bg-[rgba(11,12,16,0.5)]">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={14} className="text-apex-green" />
          <span className="font-mono text-[11px] text-ash/50 tracking-wider">策略配置</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Entry Logic */}
          <LogicToggle
            label="入场逻辑"
            value={entryLogic}
            onChange={handleEntryLogicChange}
          />

          {/* Exit Logic */}
          <LogicToggle
            label="出场逻辑"
            value={exitLogic}
            onChange={handleExitLogicChange}
          />

          {/* Holding Period */}
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-ash/40" />
            <span className="font-mono text-[10px] text-ash/40">持仓周期</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="range"
                min={5}
                max={60}
                step={1}
                value={holdingPeriod}
                onChange={(e) => setHoldingPeriod(Number(e.target.value))}
                className="flex-1 h-1 bg-deep-space accent-apex-green cursor-pointer"
              />
              <span className="font-mono text-[11px] text-pure w-10 text-right">{holdingPeriod}天</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Combo */}
      <div className="mb-6 p-5 border border-[rgba(206,209,213,0.1)] bg-[rgba(11,12,16,0.5)]">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={14} className="text-gold-standard" />
          <span className="font-mono text-[11px] text-ash/50 tracking-wider">当前组合</span>
          <span className="font-mono text-[10px] text-ash/30 ml-2">
            共{elements.length}个要素 | 标的:{stockCode} | 持仓:{holdingPeriod}天
          </span>
        </div>
        <CurrentCombo elements={elements} />
        {elements.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {elements.map((el) => (
              <span
                key={el.uid}
                className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] border cursor-pointer hover:opacity-70 transition-opacity"
                style={{
                  color: el.type === 'entry' ? '#00FF94' : el.type === 'exit' ? '#FF2A6D' : el.type === 'filter' ? '#D4AF37' : el.type === 'risk' ? '#4A6FA5' : '#9B59B6',
                  borderColor: el.type === 'entry' ? 'rgba(0,255,148,0.3)' : el.type === 'exit' ? 'rgba(255,42,109,0.3)' : el.type === 'filter' ? 'rgba(212,175,55,0.3)' : el.type === 'risk' ? 'rgba(74,111,165,0.3)' : 'rgba(155,89,182,0.3)',
                  backgroundColor: el.type === 'entry' ? 'rgba(0,255,148,0.05)' : el.type === 'exit' ? 'rgba(255,42,109,0.05)' : el.type === 'filter' ? 'rgba(212,175,55,0.05)' : el.type === 'risk' ? 'rgba(74,111,165,0.05)' : 'rgba(155,89,182,0.05)',
                }}
                onClick={() => removeElement(el.uid)}
                title="点击移除"
              >
                {el.name}
                {el.logic && <span className="opacity-50">[{el.logic.toUpperCase()}]</span>}
                <X size={10} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Strategy name + Run */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={strategyName}
          onChange={(e) => setStrategyName(e.target.value)}
          placeholder="输入策略名称..."
          className="flex-1 min-w-[200px] px-4 py-2.5 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 transition-colors"
        />
        <button
          onClick={runBacktest}
          disabled={isRunning || elements.filter((e) => e.type === 'entry').length === 0}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-apex-green text-void font-mono text-sm font-bold rounded hover:shadow-[0_0_20px_rgba(0,255,148,0.3)] transition-all disabled:opacity-50"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          运行回测
        </button>
        {score !== null && (
          <button
            onClick={handleSave}
            disabled={!strategyName.trim() || saved}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gold-standard text-void font-mono text-sm font-bold rounded hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all disabled:opacity-50"
          >
            {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? '已保存' : '保存策略'}
          </button>
        )}
      </div>

      {/* Score result */}
      {score !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 border border-[rgba(0,255,148,0.2)] bg-[rgba(0,255,148,0.05)]"
        >
          <div className="flex items-center gap-4">
            <div>
              <p className="font-mono text-[10px] text-ash/40 mb-1">综合评分</p>
              <p
                className="font-heading text-[32px] font-bold leading-none"
                style={{ color: score >= 60 ? '#00FF94' : score >= 40 ? '#D4AF37' : '#FF2A6D' }}
              >
                {score.toFixed(1)}
              </p>
            </div>
            <div className="flex-1">
              <p className="font-mono text-[11px] text-ash/50">
                {score >= 60 ? '优秀 - 策略表现良好，值得实盘测试' : score >= 40 ? '一般 - 可考虑优化参数' : '较差 - 建议调整策略要素'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Entry Signals Grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-apex-green" />
          <span className="font-mono text-[12px] text-pure">入场信号</span>
          <span className="font-mono text-[10px] text-ash/30">{ENTRY_SIGNALS.length}个</span>
          {elements.filter((e) => e.type === 'entry').length > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[rgba(0,255,148,0.1)] text-apex-green">
              已选 {elements.filter((e) => e.type === 'entry').length} 个
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {ENTRY_SIGNALS.map((el) => (
            <SignalCard
              key={el.id}
              element={el}
              isSelected={isElementSelected(el)}
              onToggle={() => toggleElement(el)}
            />
          ))}
        </div>
      </div>

      {/* Exit Signals Grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-reversion-red" />
          <span className="font-mono text-[12px] text-pure">出场信号</span>
          <span className="font-mono text-[10px] text-ash/30">{EXIT_SIGNALS.length}个</span>
          {elements.filter((e) => e.type === 'exit').length > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[rgba(255,42,109,0.1)] text-reversion-red">
              已选 {elements.filter((e) => e.type === 'exit').length} 个
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {EXIT_SIGNALS.map((el) => (
            <SignalCard
              key={el.id}
              element={el}
              isSelected={isElementSelected(el)}
              onToggle={() => toggleElement(el)}
            />
          ))}
        </div>
      </div>

      {/* Filters Grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={14} className="text-gold-standard" />
          <span className="font-mono text-[12px] text-pure">过滤器</span>
          <span className="font-mono text-[10px] text-ash/30">{FILTERS.length}个</span>
          {elements.filter((e) => e.type === 'filter').length > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[rgba(212,175,55,0.1)] text-gold-standard">
              已选 {elements.filter((e) => e.type === 'filter').length} 个
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {FILTERS.map((el) => (
            <SignalCard
              key={el.id}
              element={el}
              isSelected={isElementSelected(el)}
              onToggle={() => toggleElement(el)}
            />
          ))}
        </div>
      </div>

      {/* Risk Management Grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-[#4A6FA5]" />
          <span className="font-mono text-[12px] text-pure">风控规则</span>
          <span className="font-mono text-[10px] text-ash/30">{RISK_MANAGEMENT.length}个</span>
          {elements.filter((e) => e.type === 'risk').length > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[rgba(74,111,165,0.1)] text-[#4A6FA5]">
              已选 {elements.filter((e) => e.type === 'risk').length} 个
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {RISK_MANAGEMENT.map((el) => (
            <SignalCard
              key={el.id}
              element={el}
              isSelected={isElementSelected(el)}
              onToggle={() => toggleElement(el)}
            />
          ))}
        </div>
      </div>

      {/* Position Management Grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <PackageOpen size={14} className="text-[#9B59B6]" />
          <span className="font-mono text-[12px] text-pure">仓位管理</span>
          <span className="font-mono text-[10px] text-ash/30">{POSITION_MANAGEMENT.length}个</span>
          {elements.filter((e) => e.type === 'position').length > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[rgba(155,89,182,0.1)] text-[#9B59B6]">
              已选 {elements.filter((e) => e.type === 'position').length} 个
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {POSITION_MANAGEMENT.map((el) => (
            <SignalCard
              key={el.id}
              element={el}
              isSelected={isElementSelected(el)}
              onToggle={() => toggleElement(el)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── Evolution Deep Mode (GA) ──────────────────────── */

const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
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

function EvolutionDeepMode() {
  const { addStrategy, refreshStrategies } = useApp();
  const { startEvolution: startEvolutionWorker, stopEvolution } = useEvolutionWorker();

  // ─── Evolution State ───
  const [isRunning, setIsRunning] = useState(false);
  const [currentGen, setCurrentGen] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);
  const [avgFitness, setAvgFitness] = useState(0);
  const [evolutionResult, setEvolutionResult] = useState<EvolutionResult | null>(null);
  const [chartData, setChartData] = useState<FitnessChartPoint[]>([]);

  // ─── Config State ───
  const [config, setConfig] = useState<EvolutionConfig>({ ...DEFAULT_EVOLUTION_CONFIG });
  const [targetStockCode, setTargetStockCode] = useState('600519');
  const [showConfig, setShowConfig] = useState(false);

  // ─── Best Genome Details ───
  const [bestMetrics, setBestMetrics] = useState<BacktestMetrics | null>(null);
  const [showBestDetails, setShowBestDetails] = useState(false);

  // ─── Save State ───
  const [saved, setSaved] = useState(false);

  // ─── K-lines cache for detailed backtest after evolution ───
  const klinesRef = useRef<KLineData[] | null>(null);

  /* ─── Start Evolution ─── */
  const startEvolution = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setEvolutionResult(null);
    setChartData([]);
    setBestMetrics(null);
    setCurrentGen(0);
    setBestFitness(0);
    setAvgFitness(0);
    setSaved(false);

    const code = targetStockCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setIsRunning(false);
      return;
    }
    const basePrice = 50 + Math.random() * 150;
    const klines = await generateKLines(basePrice, code, 120);

    if (!klines || klines.length === 0) {
      setIsRunning(false);
      return;
    }

    klinesRef.current = klines;

    // Start evolution in Web Worker — UI stays responsive
    startEvolutionWorker(
      klines,
      config,
      // onProgress — called every generation
      (gen, best, avg) => {
        setCurrentGen(gen);
        setBestFitness(best);
        setAvgFitness(avg);
        setChartData((prev) => [
          ...prev,
          { generation: gen + 1, best: Math.round(best * 10) / 10, average: Math.round(avg * 10) / 10, diversity: 0 },
        ]);
      },
      // onComplete — evolution finished
      (result) => {
        setEvolutionResult(result);
        setBestFitness(result.bestGenome.fitness);
        setIsRunning(false);

        // Run detailed backtest on best genome (main thread, fast)
        const metrics = runDetailedBacktest(klines, result.bestGenome.elements);
        setBestMetrics(metrics);

        // Update chart with full diversity data
        setChartData(
          result.stats.bestFitnessPerGen.map((best, i) => ({
            generation: i + 1,
            best: Math.round(best * 10) / 10,
            average: Math.round(result.stats.avgFitnessPerGen[i] * 10) / 10,
            diversity: Math.round(result.stats.diversityPerGen[i] * 100) / 100,
          }))
        );
      },
      // onError
      (err) => {
        console.error('Evolution error:', err);
        setIsRunning(false);
      },
    );
  }, [isRunning, config, targetStockCode, startEvolutionWorker]);

  /* ─── Stop / Reset ─── */
  const resetEvolution = useCallback(() => {
    stopEvolution();
    setIsRunning(false);
    setEvolutionResult(null);
    setChartData([]);
    setBestMetrics(null);
    setCurrentGen(0);
    setBestFitness(0);
    setAvgFitness(0);
    setSaved(false);
    klinesRef.current = null;
  }, [stopEvolution]);

  /* ─── Save Best Strategy ─── */
  const handleSaveBest = useCallback(() => {
    if (!evolutionResult || !bestMetrics) return;
    const { bestGenome } = evolutionResult;
    const entryNames = bestGenome.elements.filter((e) => e.type === 'entry').map((e) => e.name).join('+');
    const exitNames = bestGenome.elements.filter((e) => e.type === 'exit').map((e) => e.name).join('+');

    const strategy: CustomStrategy = {
      id: `evo_${bestGenome.id}`,
      name: `进化策略 ${entryNames}→${exitNames}`,
      description: `遗传算法进化生成（第${bestGenome.generation}代，适应度${Math.round(bestGenome.fitness * 10) / 10}）`,
      elements: bestGenome.elements.map((e) => ({ ...e, params: e.params?.map((p) => ({ ...p })) })),
      backtestScore: bestGenome.fitness,
      backtestReturn: bestMetrics.totalReturn,
      createdAt: new Date().toISOString(),
      isSystem: false,
    };
    addStrategy(strategy);
    refreshStrategies();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [evolutionResult, bestMetrics, addStrategy, refreshStrategies]);

  return (
    <div className="mt-8">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-[rgba(206,209,213,0.08)]" />
        <Dna size={16} className="text-apex-green" />
        <h3 className="font-heading text-[15px] text-pure">深度进化</h3>
        <span className="font-mono text-[10px] text-ash/30">GENETIC_ALGORITHM</span>
        <div className="h-px flex-1 bg-[rgba(206,209,213,0.08)]" />
      </div>

      {/* ─── Config Panel ─── */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <SlidersHorizontal size={14} className="text-gold-standard" />
                <h3 className="font-mono text-[13px] font-semibold text-pure">进化参数配置</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: '种群大小', key: 'populationSize' as const, min: 10, max: 100 },
                  { label: '最大代数', key: 'maxGenerations' as const, min: 5, max: 100 },
                  { label: '精英保留', key: 'elitismCount' as const, min: 1, max: 10 },
                  { label: '目标适应度', key: 'targetFitness' as const, min: 50, max: 100 },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block font-mono text-[11px] text-ash/40 mb-1">{field.label}</label>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={config[field.key]}
                      onChange={(e) => setConfig((c) => ({ ...c, [field.key]: Math.max(field.min, Math.min(field.max, Number(e.target.value))) }))}
                      className="w-full bg-[rgba(11,12,16,0.8)] border border-[rgba(206,209,213,0.12)] rounded px-3 py-2 font-mono text-sm text-pure outline-none focus:border-gold-standard/50"
                    />
                  </div>
                ))}
                {[
                  { label: '交叉率', key: 'crossoverRate' as const, min: 0, max: 1, step: 0.05 },
                  { label: '变异率', key: 'mutationRate' as const, min: 0, max: 1, step: 0.05 },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block font-mono text-[11px] text-ash/40 mb-1">{field.label}: {config[field.key].toFixed(2)}</label>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={config[field.key]}
                      onChange={(e) => setConfig((c) => ({ ...c, [field.key]: Number(e.target.value) }))}
                      className="w-full accent-gold-standard"
                    />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Control Panel ─── */}
      <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Target Stock Code Input */}
            <div className="flex items-center gap-2">
              <Target size={14} className="text-ash/40" />
              <input
                type="text"
                value={targetStockCode}
                onChange={(e) => setTargetStockCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="股票代码"
                maxLength={6}
                disabled={isRunning}
                className="w-24 bg-[rgba(206,209,213,0.04)] border border-[rgba(206,209,213,0.08)] rounded-sm px-3 py-2 font-mono text-sm text-pure placeholder-ash/30 outline-none focus:border-apex-green/40 transition-colors text-center disabled:opacity-50"
              />
            </div>

            {/* Start / Stop Buttons */}
            {!isRunning ? (
              <button
                onClick={startEvolution}
                disabled={targetStockCode.replace(/\D/g, '').length !== 6}
                className="flex items-center gap-2 px-6 py-3 rounded-sm bg-apex-green text-void font-semibold text-sm hover:bg-[#33FFAA] transition-all disabled:opacity-50 shadow-lg shadow-[rgba(0,255,148,0.15)]"
              >
                <Play size={16} />
                开始进化
              </button>
            ) : (
              <button
                onClick={resetEvolution}
                className="flex items-center gap-2 px-4 py-3 rounded-sm bg-[rgba(255,42,109,0.06)] text-reversion-red border border-[rgba(255,42,109,0.2)] text-sm font-medium hover:bg-red-500/25 transition-all"
              >
                <RotateCcw size={16} />
                停止
              </button>
            )}

            {/* Config Toggle */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-sm font-mono text-[11px] transition-all ${
                showConfig ? 'bg-[rgba(245,166,35,0.08)] text-gold-standard border border-[rgba(245,166,35,0.2)]' : 'bg-[rgba(206,209,213,0.04)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure'
              }`}
            >
              <SlidersHorizontal size={13} />
              参数
            </button>

            {/* Save Button (when result ready) */}
            {evolutionResult && !isRunning && (
              <button
                onClick={handleSaveBest}
                disabled={saved}
                className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-[rgba(0,255,148,0.08)] text-apex-green border border-[rgba(0,255,148,0.2)] font-mono text-[11px] hover:bg-[rgba(0,255,148,0.12)] transition-all disabled:opacity-50"
              >
                {saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
                {saved ? '已保存' : '保存策略'}
              </button>
            )}
          </div>

          {/* Stats Display */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <StatBadge icon={<Activity size={14} />} label="当前代数" value={currentGen} active={isRunning} />
            <StatBadge icon={<TrendingUp size={14} />} label="最优适应度" value={`${bestFitness.toFixed(1)}`} color="emerald" />
            <StatBadge icon={<BarChart3 size={14} />} label="平均适应度" value={`${avgFitness.toFixed(1)}`} />
          </div>
        </div>

        {/* Progress Bar */}
        {isRunning && (
          <div className="mt-4">
            <div className="h-1.5 bg-[rgba(206,209,213,0.06)] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-apex-green rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (currentGen / config.maxGenerations) * 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="font-mono text-[11px] text-ash/40 mt-1.5">
              正在进化... 第 {currentGen + 1}/{config.maxGenerations} 代
              {evolutionResult && evolutionResult.elapsedMs > 0 ? ` · 耗时 ${(evolutionResult.elapsedMs / 1000).toFixed(1)}s` : ''}
            </p>
          </div>
        )}
      </div>

      {/* ─── Fitness Chart ─── */}
      {chartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 mb-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-apex-green" />
            <h3 className="font-mono text-[13px] font-semibold text-pure">适应度进化曲线</h3>
            <div className="ml-auto flex items-center gap-3 font-mono text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 最优</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> 平均</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="bestGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="generation" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0B0C10', border: '1px solid rgba(206,209,213,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area type="monotone" dataKey="best" stroke="#10b981" strokeWidth={2} fill="url(#bestGrad)" dot={false} name="最优适应度" />
                <Area type="monotone" dataKey="average" stroke="#0ea5e9" strokeWidth={1.5} fill="url(#avgGrad)" dot={false} name="平均适应度" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* ─── Best Strategy + Backtest Results ─── */}
      {evolutionResult && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Strategy Elements */}
          <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-gold-standard" />
              <h3 className="font-mono text-[13px] font-semibold text-pure">最优策略组成</h3>
              <span className="ml-auto font-mono text-[10px] text-ash/40">第{evolutionResult.bestGenome.generation}代 · 适应度 {evolutionResult.bestGenome.fitness.toFixed(1)}</span>
            </div>
            <div className="space-y-2">
              {evolutionResult.bestGenome.elements.map((el, idx) => (
                <EvolutionElementCard key={`${el.id}_${idx}`} element={el} index={idx} />
              ))}
            </div>
            {bestMetrics && (
              <button
                onClick={() => setShowBestDetails(!showBestDetails)}
                className="mt-4 flex items-center gap-1 font-mono text-[11px] text-ash/40 hover:text-ash transition-colors"
              >
                {showBestDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                详细回测指标
              </button>
            )}
          </div>

          {/* Backtest Metrics */}
          {bestMetrics && (
            <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={14} className="text-gold-standard" />
                <h3 className="font-mono text-[13px] font-semibold text-pure">回测表现</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="总收益率" value={`${bestMetrics.totalReturn}%`} color={bestMetrics.totalReturn >= 0 ? 'emerald' : 'red'} icon={<TrendingUp size={14} />} />
                <MetricCard label="年化收益率" value={`${bestMetrics.annualizedReturn}%`} color={bestMetrics.annualizedReturn >= 0 ? 'emerald' : 'red'} icon={<Clock size={14} />} />
                <MetricCard label="夏普比率" value={`${bestMetrics.sharpeRatio}`} color={bestMetrics.sharpeRatio > 1 ? 'emerald' : bestMetrics.sharpeRatio > 0 ? 'amber' : 'red'} icon={<Activity size={14} />} />
                <MetricCard label="最大回撤" value={`${bestMetrics.maxDrawdown}%`} color="red" icon={<AlertTriangle size={14} />} />
                <MetricCard label="胜率" value={`${bestMetrics.winRate}%`} color={bestMetrics.winRate > 50 ? 'emerald' : 'amber'} icon={<Percent size={14} />} />
                <MetricCard label="交易次数" value={`${bestMetrics.totalTrades}`} color="sky" icon={<Layers size={14} />} />
                <MetricCard label="最佳单次" value={`${bestMetrics.bestReturn}%`} color="emerald" icon={<DollarSign size={14} />} />
                <MetricCard label="最差单次" value={`${bestMetrics.worstReturn}%`} color="red" icon={<DollarSign size={14} />} />
              </div>
              {showBestDetails && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 pt-3 border-t border-[rgba(206,209,213,0.06)] grid grid-cols-2 gap-3">
                  <MetricCard label="盈利次数" value={`${bestMetrics.winningTrades}`} color="emerald" />
                  <MetricCard label="平均持仓" value={`${bestMetrics.avgHoldDays}天`} color="sky" />
                  <MetricCard label="波动率" value={`${bestMetrics.volatility}`} color="amber" />
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ─── Stat Badge ─── */

function StatBadge({ icon, label, value, color = 'gray', active = false }: {
  icon: ReactNode; label: string; value: string | number;
  color?: string; active?: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-apex-green',
    sky: 'text-gold-standard',
    amber: 'text-gold-standard',
    red: 'text-reversion-red',
    gray: 'text-ash/50',
  };
  return (
    <div className={`flex flex-col items-center ${active ? 'animate-pulse' : ''}`}>
      <span className="font-mono text-[10px] text-ash/40 uppercase tracking-wider">{label}</span>
      <span className={`text-lg font-bold ${colorMap[color] || colorMap.gray} flex items-center gap-1`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

/* ─── Evolution Element Card ─── */

function EvolutionElementCard({ element, index }: { element: StrategyElement; index: number }) {
  const typeColors: Record<StrategyElement['type'], { bg: string; border: string; text: string; icon: ReactNode; label: string }> = {
    entry: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-apex-green', icon: <ArrowRight size={14} />, label: '入场' },
    exit: { bg: 'bg-[rgba(255,42,109,0.04)]', border: 'border-red-500/25', text: 'text-reversion-red', icon: <X size={14} />, label: '出场' },
    filter: { bg: 'bg-sky-500/10', border: 'border-sky-500/25', text: 'text-gold-standard', icon: <Target size={14} />, label: '过滤' },
    risk: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', text: 'text-gold-standard', icon: <Shield size={14} />, label: '风控' },
    position: { bg: 'bg-violet-500/10', border: 'border-violet-500/25', text: 'text-gold-standard', icon: <Layers size={14} />, label: '仓位' },
  };
  const tc = typeColors[element.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm border ${tc.bg} ${tc.border}`}
    >
      <span className={tc.text}>{tc.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${tc.bg} ${tc.text}`}>{tc.label}</span>
          <span className="font-mono text-[13px] text-pure">{element.name}</span>
        </div>
        <p className="font-mono text-[11px] text-ash/40 truncate mt-0.5">{element.description}</p>
        {element.params && element.params.length > 0 && (
          <p className="font-mono text-[10px] text-ash/30 mt-0.5">
            {element.params.map((p) => `${p.name}=${p.value}`).join(', ')}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Metric Card ─── */

function MetricCard({ label, value, color, icon }: {
  label: string; value: string; color: string; icon?: ReactNode;
}) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-apex-green' },
    sky: { bg: 'bg-sky-500/10 border-sky-500/20', text: 'text-gold-standard' },
    amber: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-gold-standard' },
    red: { bg: 'bg-[rgba(255,42,109,0.04)] border-red-500/20', text: 'text-reversion-red' },
  };
  const c = colorMap[color] || colorMap.sky;
  return (
    <div className={`rounded-sm border ${c.bg} p-3`}>
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-ash/40 mb-1">
        {icon}
        {label}
      </div>
      <div className={`font-mono text-lg font-bold ${c.text}`}>{value}</div>
    </div>
  );
}

/* ──────────────────────── Explore Mode ──────────────────────── */

function ExploreMode() {
  const [results, setResults] = useState<ExploreResultItem[]>([]);
  const [isExploring, setIsExploring] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [exploreCode, setExploreCode] = useState('');
  const [holdingPeriod, setHoldingPeriod] = useState(30);

  const { refreshStrategies } = useApp();

  const handleExplore = useCallback(async () => {
    const code = exploreCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return;

    setIsExploring(true);
    setHasRun(true);

    const kline = await generateKLines(50, code, 120);

    const config: Partial<BacktestConfig> = {
      holdingPeriodMax: holdingPeriod,
    };

    setTimeout(() => {
      const combos = exploreCombinations(kline, 10, config);
      setResults(combos);
      setIsExploring(false);
    }, 800);
  }, [exploreCode, holdingPeriod]);

  const handleSaveResult = useCallback((r: ExploreResultItem) => {
    const strategy: CustomStrategy = {
      id: `custom_${Date.now()}`,
      name: r.combo.name,
      description: r.combo.description,
      elements: r.combo.elements.map((e) => cloneElement(e)),
      backtestScore: r.score,
      backtestReturn: 0,
      createdAt: new Date().toISOString(),
      isSystem: false,
    };
    const STORAGE_KEY = 'quant_lab_strategies';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as CustomStrategy[]) : [];
      const exists = list.some((s) => s.id === strategy.id);
      if (!exists) {
        list.push(strategy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
    } catch { /* ignore */ }
    refreshStrategies();
    setSavedIds((prev) => new Set(prev).add(r.combo.id));
  }, [refreshStrategies]);

  return (
    <div>
      {/* Header */}
      <div className="data-card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Wand2 size={18} className="text-gold-standard" />
          <h3 className="font-heading text-lg text-pure">批量策略探索</h3>
          <span className="font-mono text-[10px] text-ash/30">EXPLORE_MODE</span>
        </div>
        <p className="font-mono text-[12px] text-ash/60 mb-4 leading-relaxed">
          系统将自动组合多种入场信号、出场信号、过滤器和风控规则，生成最优策略组合。
          每个组合都会经过完整的回测验证，按综合评分排序。
        </p>

        {/* Stock Code Input */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="font-mono text-[11px] text-ash/40 shrink-0">标的股票</span>
          <input
            type="text"
            value={exploreCode}
            onChange={(e) => setExploreCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="输入6位股票代码"
            className="w-40 px-3 py-2 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50 placeholder:text-ash/20"
          />
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-ash/40" />
            <span className="font-mono text-[10px] text-ash/40">持仓周期</span>
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={holdingPeriod}
              onChange={(e) => setHoldingPeriod(Number(e.target.value))}
              className="w-24 h-1 bg-deep-space accent-gold-standard cursor-pointer"
            />
            <span className="font-mono text-[10px] text-pure w-8">{holdingPeriod}天</span>
          </div>
        </div>

        <button
          onClick={handleExplore}
          disabled={isExploring || exploreCode.replace(/\D/g, '').length !== 6}
          className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gold-standard text-void font-mono text-sm font-bold uppercase tracking-wider rounded overflow-hidden hover:shadow-[0_0_30px_rgba(212,175,55,0.3)] transition-all duration-300 disabled:opacity-50"
        >
          {isExploring ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              探索中...
            </>
          ) : (
            <>
              <Sparkles size={16} className="group-hover:scale-110 transition-transform" />
              开始批量探索
            </>
          )}
        </button>
      </div>

      {/* Results */}
      <AnimatePresence>
        {hasRun && !isExploring && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeExpoOut }}
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-apex-green" />
              <h3 className="font-heading text-lg text-pure">探索结果</h3>
              <span className="font-mono text-[10px] text-ash/30 ml-2">共 {results.length} 个组合</span>
            </div>

            <div className="space-y-3">
              {results.map((r, idx) => (
                <motion.div
                  key={r.combo.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.05, ease: easeExpoOut }}
                  className="data-card p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-[11px] text-ash/30 w-6">{String(idx + 1).padStart(2, '0')}</span>
                        <span
                          className="font-mono text-[13px] font-bold"
                          style={{ color: r.score >= 60 ? '#00FF94' : r.score >= 40 ? '#D4AF37' : '#FF2A6D' }}
                        >
                          {r.score.toFixed(1)}分
                        </span>
                        <span className="font-mono text-[12px] text-pure">{r.combo.name}</span>
                      </div>
                      <p className="font-mono text-[11px] text-ash/50 ml-8">{r.combo.description}</p>

                      {/* Element badges */}
                      <div className="flex flex-wrap gap-1.5 ml-8 mt-2">
                        {r.combo.elements.map((el) => {
                          const typeColors: Record<string, string> = {
                            entry: '#00FF94',
                            exit: '#FF2A6D',
                            filter: '#D4AF37',
                            risk: '#4A6FA5',
                            position: '#9B59B6',
                          };
                          const typeLabels: Record<string, string> = {
                            entry: '入',
                            exit: '出',
                            filter: '滤',
                            risk: '控',
                            position: '仓',
                          };
                          return (
                            <span
                              key={el.id}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] rounded border"
                              style={{
                                color: typeColors[el.type],
                                borderColor: `${typeColors[el.type]}30`,
                                backgroundColor: `${typeColors[el.type]}10`,
                              }}
                            >
                              <span style={{ opacity: 0.6 }}>{typeLabels[el.type]}</span>
                              {el.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveResult(r)}
                      disabled={savedIds.has(r.combo.id)}
                      className="flex items-center gap-1 px-3 py-2 font-mono text-[11px] rounded border border-[rgba(0,255,148,0.3)] text-apex-green hover:bg-[rgba(0,255,148,0.1)] transition-colors disabled:opacity-40 shrink-0"
                    >
                      {savedIds.has(r.combo.id) ? <CheckCircle2 size={12} /> : <Save size={12} />}
                      {savedIds.has(r.combo.id) ? '已保存' : '保存'}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasRun && !isExploring && results.length === 0 && (
        <div className="data-card py-12 text-center">
          <X size={32} className="mx-auto mb-3 text-ash/20" />
          <p className="font-mono text-[12px] text-ash/40">未找到有效策略组合</p>
          <p className="font-mono text-[10px] text-ash/30 mt-1">请尝试调整参数后重新探索</p>
        </div>
      )}

      {/* ─── Deep Evolution (GA) ─── */}
      <EvolutionDeepMode />
    </div>
  );
}

/* ──────────────────────── My Strategies Mode ──────────────────────── */

function MyStrategiesMode() {
  const [strategies, setStrategies] = useState<CustomStrategy[]>(() => {
    try {
      const raw = localStorage.getItem('quant_lab_strategies');
      return raw ? (JSON.parse(raw) as CustomStrategy[]).filter((s) => !s.isSystem) : [];
    } catch { return []; }
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStrategies = useCallback(() => {
    try {
      const raw = localStorage.getItem('quant_lab_strategies');
      setStrategies(raw ? (JSON.parse(raw) as CustomStrategy[]).filter((s) => !s.isSystem) : []);
    } catch { setStrategies([]); }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies, refreshKey]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDeleteId) return;
    try {
      const raw = localStorage.getItem('quant_lab_strategies');
      const list = raw ? (JSON.parse(raw) as CustomStrategy[]) : [];
      const filtered = list.filter((s) => s.id !== confirmDeleteId);
      localStorage.setItem('quant_lab_strategies', JSON.stringify(filtered));
      setRefreshKey((k) => k + 1);
    } catch { /* ignore */ }
    setConfirmDeleteId(null);
  }, [confirmDeleteId]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
  }, []);

  if (strategies.length === 0) {
    return (
      <div className="data-card py-16 text-center">
        <Star size={32} className="mx-auto mb-3 text-ash/20" />
        <p className="font-mono text-[12px] text-ash/40 mb-1">暂无保存的策略</p>
        <p className="font-mono text-[10px] text-ash/30">在组合构建中创建并保存策略后，将显示在这里</p>
      </div>
    );
  }

  const confirmStrategy = confirmDeleteId ? strategies.find((s) => s.id === confirmDeleteId) : null;

  return (
    <div>
      {/* ═══ 删除确认对话框 ═══ */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-[#0d0e12] border border-[rgba(206,209,213,0.12)] rounded-sm p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-reversion-red" />
              <h3 className="font-heading text-[16px] text-pure">确认删除策略</h3>
            </div>
            <p className="font-mono text-[12px] text-ash/60 mb-1">确定要删除以下策略吗？此操作不可撤销。</p>
            <p className="font-mono text-[14px] text-apex-green mb-6">{confirmStrategy?.name || ''}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 border border-[rgba(206,209,213,0.12)] text-ash/60 font-mono text-[12px] rounded-sm hover:border-[rgba(206,209,213,0.2)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-reversion-red/10 border border-reversion-red/30 text-reversion-red font-mono text-[12px] rounded-sm hover:bg-reversion-red/20 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-4">
        <Star size={16} className="text-[#4A6FA5]" />
        <h3 className="font-heading text-lg text-pure">我的策略</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">共 {strategies.length} 个</span>
      </div>
      <div className="space-y-3">
        {strategies.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="data-card p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-heading text-[14px] text-pure">{s.name}</span>
                  {s.backtestScore !== undefined && (
                    <span
                      className="font-mono text-[11px] font-bold"
                      style={{
                        color: s.backtestScore >= 60 ? '#00FF94' : s.backtestScore >= 40 ? '#D4AF37' : '#FF2A6D',
                      }}
                    >
                      {s.backtestScore.toFixed(1)}分
                    </span>
                  )}
                </div>
                <p className="font-mono text-[11px] text-ash/50 mb-2 truncate">{s.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.elements?.map((el) => {
                    const tc: Record<string, string> = { entry: '#00FF94', exit: '#FF2A6D', filter: '#D4AF37', risk: '#4A6FA5', position: '#9B59B6' };
                    const tl: Record<string, string> = { entry: '入', exit: '出', filter: '滤', risk: '控', position: '仓' };
                    return (
                      <span
                        key={el.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] border"
                        style={{ color: tc[el.type], borderColor: `${tc[el.type]}30`, backgroundColor: `${tc[el.type]}10` }}
                      >
                        <span style={{ opacity: 0.6 }}>{tl[el.type]}</span>
                        {el.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-ash/20 hover:text-reversion-red transition-colors shrink-0"
                title="删除策略"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────── Main Page ──────────────────────── */

export default function StrategyLab() {
  const [mode, setMode] = useState<'builder' | 'explore' | 'my'>('builder');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="min-h-[100dvh] bg-void pt-16">
      {/* Hero */}
      <section className="relative bg-void border-b border-[rgba(206,209,213,0.08)]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: easeExpoOut }}
          >
            <div className="flex items-center gap-3 mb-2">
              <FlaskConical size={24} className="text-apex-green" />
              <h1 className="font-heading text-h2 text-pure">策略实验室</h1>
            </div>
            <p className="font-mono text-caption text-ash/60 mb-8">
              STRATEGY_LAB v2.0 — 构建、回测、探索与进化量化策略组合
            </p>
          </motion.div>

          {/* Mode switcher */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15, ease: easeExpoOut }}
            className="flex flex-wrap gap-2"
          >
            <button
              onClick={() => setMode('builder')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded font-mono text-sm font-medium transition-all ${
                mode === 'builder'
                  ? 'bg-apex-green text-void'
                  : 'bg-deep-space/60 text-ash/60 border border-[rgba(206,209,213,0.12)] hover:text-pure hover:border-apex-green/40'
              }`}
            >
              <Layers size={14} />
              组合构建
            </button>
            <button
              onClick={() => setMode('explore')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded font-mono text-sm font-medium transition-all ${
                mode === 'explore'
                  ? 'bg-gold-standard text-void'
                  : 'bg-deep-space/60 text-ash/60 border border-[rgba(206,209,213,0.12)] hover:text-pure hover:border-gold-standard/40'
              }`}
            >
              <Wand2 size={14} />
              批量探索
            </button>
            <button
              onClick={() => setMode('my')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded font-mono text-sm font-medium transition-all ${
                mode === 'my'
                  ? 'bg-[#4A6FA5] text-pure'
                  : 'bg-deep-space/60 text-ash/60 border border-[rgba(206,209,213,0.12)] hover:text-pure hover:border-[#4A6FA5]/40'
              }`}
            >
              <Star size={14} />
              我的策略
            </button>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-void py-8 lg:py-12">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <AnimatePresence mode="wait">
            {mode === 'builder' && (
              <motion.div
                key="builder"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.35, ease: easeExpoOut }}
              >
                <BuilderMode />
              </motion.div>
            )}
            {mode === 'explore' && (
              <motion.div
                key="explore"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35, ease: easeExpoOut }}
              >
                <ExploreMode />
              </motion.div>
            )}
            {mode === 'my' && (
              <motion.div
                key="my"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35, ease: easeExpoOut }}
              >
                <MyStrategiesMode />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
