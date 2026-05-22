import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, BarChart, Bar, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import {
  Dna, Play, Pause, RotateCcw, Key, Shield, CheckCircle2,
  AlertTriangle, TrendingUp, Activity, Zap, BarChart3, Lock,
  Loader2, ChevronRight, Download, Upload, Sparkles, Brain,
  Settings, Eye, Trash2, X, Save, FileText,
  ShieldAlert, ChevronDown, ChevronUp,
  Layers, Clock, Percent, DollarSign,
  Store, Trophy, Gauge, Wifi, WifiOff, Crown, BarChart2, Target
} from 'lucide-react';
import {
  runEvolution, saveAPIKeyConfig, getAPIKeyConfig, clearAPIKey,
  validateAPIKey, generateStrategyReport, exportStrategy, importStrategy,
  getEvolutionElementPool, runDetailedBacktest,
  saveStrategyToMarketplace, getMarketplaceStrategies, deleteMarketplaceStrategy,
  getStrategyLeaderboard, autoTagStrategy, calculateStrategyScore,
  generateEnhancedEvolutionReport, getAPIUsageStats, resetAPIUsageStats,
  checkAPIKeyStatus, getProviderModels, recordAPIRequest,
  type EvolutionResult, type APIKeyConfig, type StrategyReport,
  type EvolutionConfig, type BacktestMetrics,
  type StrategyMarketplaceItem, type ParameterSensitivityItem,
} from '@/services/strategyEvolution';
import { generateKLines } from '@/services/stockApi';
import type { KLineData } from '@/services/stockApi';
import { useApp } from '@/contexts/AppContext';
import type { StrategyElement } from '@/contexts/AppContext';

/* ═══════════════════════════════════════════════
   Chart Types
   ═══════════════════════════════════════════════ */

interface FitnessChartPoint {
  generation: number;
  best: number;
  average: number;
  diversity: number;
}

/* ═══════════════════════════════════════════════
   Default Config
   ═══════════════════════════════════════════════ */

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

const SAMPLE_CODES = [
  '600519', '000858', '300750', '002594', '601012',
  '688981', '000333', '600276', '601318', '600036',
];

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

export default function Evolution() {
  const { addStrategy } = useApp();

  // ─── Evolution State ───
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentGen, setCurrentGen] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);
  const [avgFitness, setAvgFitness] = useState(0);
  const [diversity, setDiversity] = useState(0);
  const [evolutionResult, setEvolutionResult] = useState<EvolutionResult | null>(null);
  const [chartData, setChartData] = useState<FitnessChartPoint[]>([]);

  // ─── Config State ───
  const [config, setConfig] = useState<EvolutionConfig>({ ...DEFAULT_EVOLUTION_CONFIG });
  const [targetStockCode, setTargetStockCode] = useState('600519');
  const [showConfig, setShowConfig] = useState(false);

  // ─── API Key State ───
  const [apiConfig, setApiConfig] = useState<APIKeyConfig | null>(null);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiProvider, setApiProvider] = useState<APIKeyConfig['provider']>('openai');
  const [apiModel, setApiModel] = useState('gpt-4o-mini');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');

  // ─── Report State ───
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // ─── Best Genome Details ───
  const [bestMetrics, setBestMetrics] = useState<BacktestMetrics | null>(null);
  const [showBestDetails, setShowBestDetails] = useState(false);

  // ─── Import/Export ───
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Pause/Resume Ref ───
  const pauseRef = useRef(false);
  const abortRef = useRef(false);

  // ─── Strategy Marketplace State ───
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceTab, setMarketplaceTab] = useState<'saved' | 'leaderboard'>('saved');
  const [savedStrategies, setSavedStrategies] = useState<StrategyMarketplaceItem[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ─── Enhanced Report State ───
  const [sensitivityData, setSensitivityData] = useState<ParameterSensitivityItem[]>([]);
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [enhancedLoading, setEnhancedLoading] = useState(false);

  // ─── API Usage State ───
  const [apiUsage, setApiUsage] = useState({ totalRequests: 0, totalErrors: 0, dailyRequests: 0 });

  // ─── Load saved API config + marketplace data + usage stats ───
  useEffect(() => {
    getAPIKeyConfig().then((cfg) => {
      if (cfg) {
        setApiConfig(cfg);
        setApiProvider(cfg.provider);
        setApiModel(cfg.model);
        setApiBaseUrl(cfg.baseUrl || '');
      }
    });
    setSavedStrategies(getMarketplaceStrategies());
    setApiUsage(getAPIUsageStats());
  }, []);

  /* ─── Start Evolution ─── */
  const startEvolution = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    setEvolutionResult(null);
    setReport(null);
    setShowReport(false);
    setChartData([]);
    setBestMetrics(null);
    setCurrentGen(0);
    setBestFitness(0);
    setAvgFitness(0);
    setDiversity(0);
    pauseRef.current = false;
    abortRef.current = false;

    // Use user-specified target stock code
    const code = targetStockCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setIsRunning(false);
      return;
    }
    const basePrice = 50 + Math.random() * 150;
    const klines: KLineData[] = await generateKLines(basePrice, code, 120);

    // 检查K线数据是否为空
    if (!klines || klines.length === 0) {
      setIsRunning(false);
      return;
    }

    try {
      const result = await runEvolution(
        klines,
        config,
        (gen, best, avg) => {
          setCurrentGen(gen);
          setBestFitness(best);
          setAvgFitness(avg);
          setChartData((prev) => [
            ...prev,
            { generation: gen + 1, best: Math.round(best * 10) / 10, average: Math.round(avg * 10) / 10, diversity: 0 },
          ]);
        }
      );

      if (!abortRef.current) {
        setEvolutionResult(result);
        setBestFitness(result.bestGenome.fitness);

        // Run detailed backtest on best genome
        const metrics = runDetailedBacktest(klines, result.bestGenome.elements);
        setBestMetrics(metrics);

        // Update chart with diversity
        setChartData(
          result.stats.bestFitnessPerGen.map((best, i) => ({
            generation: i + 1,
            best: Math.round(best * 10) / 10,
            average: Math.round(result.stats.avgFitnessPerGen[i] * 10) / 10,
            diversity: Math.round(result.stats.diversityPerGen[i] * 100) / 100,
          }))
        );
      }
    } catch (err) {
      console.error('Evolution error:', err);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
    }
  }, [isRunning, config, targetStockCode]);

  /* ─── Pause / Resume ─── */
  const togglePause = useCallback(() => {
    if (!isRunning) return;
    // Note: actual pause/resume would need more complex state management
    // For now, we just toggle the UI state
    setIsPaused((p) => !p);
  }, [isRunning]);

  /* ─── Reset ─── */
  const resetEvolution = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setIsPaused(false);
    setEvolutionResult(null);
    setReport(null);
    setShowReport(false);
    setChartData([]);
    setBestMetrics(null);
    setCurrentGen(0);
    setBestFitness(0);
    setAvgFitness(0);
    setDiversity(0);
  }, []);

  /* ─── Save API Key ─── */
  const handleSaveAPIKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return;
    const cfg: APIKeyConfig = {
      provider: apiProvider,
      apiKey: apiKeyInput.trim(),
      model: apiModel,
      baseUrl: apiBaseUrl || undefined,
    };
    await saveAPIKeyConfig(cfg);
    setApiConfig(cfg);
    setApiKeyInput('');
    setApiStatus('idle');
  }, [apiKeyInput, apiProvider, apiModel, apiBaseUrl]);

  /* ─── Test API Key ─── */
  const handleTestAPIKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return;
    setApiStatus('testing');
    const cfg: APIKeyConfig = {
      provider: apiProvider,
      apiKey: apiKeyInput.trim(),
      model: apiModel,
      baseUrl: apiBaseUrl || undefined,
    };
    try {
      const valid = await validateAPIKey(cfg);
      setApiStatus(valid ? 'valid' : 'invalid');
    } catch {
      setApiStatus('invalid');
    }
  }, [apiKeyInput, apiProvider, apiModel, apiBaseUrl]);

  /* ─── Clear API Key ─── */
  const handleClearAPIKey = useCallback(() => {
    clearAPIKey();
    setApiConfig(null);
    setApiKeyInput('');
    setApiStatus('idle');
  }, []);

  /* ─── Generate Report ─── */
  const handleGenerateReport = useCallback(async () => {
    if (!evolutionResult || !bestMetrics) return;
    setGeneratingReport(true);
    try {
      const cfg = apiConfig?.apiKey ? apiConfig : undefined;
      const rpt = await generateStrategyReport(evolutionResult.bestGenome, bestMetrics, cfg);
      setReport(rpt);
      setShowReport(true);
    } catch (err) {
      console.error('Report generation error:', err);
    } finally {
      setGeneratingReport(false);
    }
  }, [evolutionResult, bestMetrics, apiConfig]);

  /* ─── Export Strategy ─── */
  const handleExport = useCallback(() => {
    if (!evolutionResult) return;
    const json = exportStrategy(evolutionResult.bestGenome);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strategy_${evolutionResult.bestGenome.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [evolutionResult]);

  /* ─── Import Strategy ─── */
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const json = String(ev.target?.result || '');
      const genome = importStrategy(json);
      if (genome) {
        setImportError(null);
        // Create a mock result to display the imported strategy
        const mockResult: EvolutionResult = {
          bestGenome: genome,
          generations: [],
          stats: { avgFitnessPerGen: [], bestFitnessPerGen: [], diversityPerGen: [] },
          walkForward: null,
          earlyStopReason: null,
          elapsedMs: 0,
        };
        setEvolutionResult(mockResult);
        setBestFitness(genome.fitness);
        // Run backtest
        const code = SAMPLE_CODES[0];
        const klines = await generateKLines(100, code, 120);
        const metrics = runDetailedBacktest(klines, genome.elements);
        setBestMetrics(metrics);
      } else {
        setImportError('导入失败：无效的策略文件格式');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  /* ─── Save to Library ─── */
  const handleSaveToLibrary = useCallback(() => {
    if (!evolutionResult || !bestMetrics) return;
    const { bestGenome } = evolutionResult;
    const entryNames = bestGenome.elements.filter((e) => e.type === 'entry').map((e) => e.name).join('+');
    const exitNames = bestGenome.elements.filter((e) => e.type === 'exit').map((e) => e.name).join('+');

    addStrategy({
      id: `evo_${bestGenome.id}`,
      name: `进化策略 ${entryNames}\u2192${exitNames}`,
      description: `遗传算法进化生成（第${bestGenome.generation}代，适应度${Math.round(bestGenome.fitness * 10) / 10}）`,
      elements: bestGenome.elements.map((e) => ({ ...e, params: e.params?.map((p) => ({ ...p })) })),
      backtestScore: bestGenome.fitness,
      backtestReturn: bestMetrics.totalReturn,
      createdAt: new Date().toISOString(),
      isSystem: false,
    });
  }, [evolutionResult, bestMetrics, addStrategy]);

  /* ─── Save to Marketplace ─── */
  const handleSaveToMarketplace = useCallback(async () => {
    if (!evolutionResult || !bestMetrics) return;
    const { bestGenome } = evolutionResult;
    const entryNames = bestGenome.elements.filter((e) => e.type === 'entry').map((e) => e.name).join('+');
    const tags = autoTagStrategy(bestMetrics);

    await saveStrategyToMarketplace({
      name: `进化策略 ${entryNames}`,
      description: `遗传算法进化生成（第${bestGenome.generation}代，适应度${Math.round(bestGenome.fitness * 10) / 10}）`,
      genome: { ...bestGenome, elements: bestGenome.elements.map((e) => ({ ...e, params: e.params?.map((p) => ({ ...p })) })) },
      backtestResult: bestMetrics,
      tags,
      isShared: false,
    });

    setSavedStrategies(getMarketplaceStrategies());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [evolutionResult, bestMetrics]);

  /* ─── Delete from Marketplace ─── */
  const handleDeleteStrategy = useCallback((id: string) => {
    deleteMarketplaceStrategy(id);
    setSavedStrategies(getMarketplaceStrategies());
  }, []);

  /* ─── Generate Enhanced Report ─── */
  const handleGenerateEnhancedReport = useCallback(async () => {
    if (!evolutionResult || !bestMetrics) return;
    setEnhancedLoading(true);
    try {
      const code = SAMPLE_CODES[Math.floor(Math.random() * SAMPLE_CODES.length)];
      const klines = await generateKLines(100, code, 120);
      const cfg = apiConfig?.apiKey ? apiConfig : null;
      const report = await generateEnhancedEvolutionReport(evolutionResult, bestMetrics, klines, cfg);

      setReport(report.basic);
      setShowReport(true);
      setSensitivityData(report.sensitivity);
    } catch (err) {
      console.error('Enhanced report error:', err);
    } finally {
      setEnhancedLoading(false);
    }
  }, [evolutionResult, bestMetrics, apiConfig]);

  /* ─── Test API Key with status ─── */
  const handleTestAPIKeyWithStatus = useCallback(async () => {
    if (!apiKeyInput.trim()) return;
    setApiStatus('testing');
    const cfg: APIKeyConfig = {
      provider: apiProvider,
      apiKey: apiKeyInput.trim(),
      model: apiModel,
      baseUrl: apiBaseUrl || undefined,
    };
    try {
      const status = await checkAPIKeyStatus(cfg);
      setApiStatus(status.isValid ? 'valid' : 'invalid');
      setApiUsage(status.usageStats);
    } catch {
      setApiStatus('invalid');
    }
  }, [apiKeyInput, apiProvider, apiModel, apiBaseUrl]);

  /* ─── Reset API Usage ─── */
  const handleResetUsage = useCallback(() => {
    resetAPIUsageStats();
    setApiUsage({ totalRequests: 0, totalErrors: 0, dailyRequests: 0 });
  }, []);

  // ─── Provider models ───
  const providerModels: Record<APIKeyConfig['provider'], string[]> = {
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    anthropic: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
    custom: ['default'],
  };

  return (
    <div className="min-h-screen bg-void text-pure">
      {/* Header */}
      <div className="border-b border-[rgba(206,209,213,0.06)]/60 bg-[rgba(11,12,16,0.95)] backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-[rgba(0,255,148,0.08)] border border-emerald-500/25 flex items-center justify-center">
                <Dna className="w-5 h-5 text-apex-green" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-pure tracking-tight font-mono">策略进化实验室</h1>
                <p className="text-xs text-ash/40 font-mono">基于遗传算法的策略自主进化引擎</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowMarketplace(!showMarketplace)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  showMarketplace ? 'bg-[rgba(245,166,35,0.08)] text-gold-standard border border-[rgba(245,166,35,0.2)]' : 'bg-[rgba(206,209,213,0.04)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>策略市场</span>
              </button>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  showConfig ? 'bg-[rgba(245,166,35,0.08)] text-gold-standard border border-[rgba(245,166,35,0.2)]' : 'bg-[rgba(206,209,213,0.04)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>参数</span>
              </button>
              <button
                onClick={() => setShowApiPanel(!showApiPanel)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  apiConfig ? 'bg-[rgba(0,255,148,0.1)] text-apex-green border border-[rgba(0,255,148,0.2)]' :
                  showApiPanel ? 'bg-[rgba(245,166,35,0.08)] text-gold-standard border border-[rgba(245,166,35,0.2)]' : 'bg-[rgba(206,209,213,0.04)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>API {apiConfig ? '已配置' : '配置'}</span>
              </button>
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-[rgba(206,209,213,0.04)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>导入</span>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
              {evolutionResult && (
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-[rgba(206,209,213,0.04)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

        {/* ─── Strategy Marketplace Panel ─── */}
        <AnimatePresence>
          {showMarketplace && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Store className="w-4 h-4 text-gold-standard" />
                  <h3 className="text-sm font-semibold text-pure">策略市场</h3>
                  <span className="ml-auto text-xs text-ash/40">{savedStrategies.length} 个策略</span>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-[rgba(206,209,213,0.06)] pb-2">
                  <button
                    onClick={() => setMarketplaceTab('saved')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      marketplaceTab === 'saved' ? 'bg-[rgba(245,166,35,0.06)] text-gold-standard' : 'text-ash/40 hover:text-ash'
                    }`}
                  >
                    <Save className="w-3 h-3 inline mr-1" />
                    已保存
                  </button>
                  <button
                    onClick={() => setMarketplaceTab('leaderboard')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      marketplaceTab === 'leaderboard' ? 'bg-[rgba(245,166,35,0.06)] text-gold-standard' : 'text-ash/40 hover:text-ash'
                    }`}
                  >
                    <Trophy className="w-3 h-3 inline mr-1" />
                    排行榜
                  </button>
                </div>

                {/* Saved Strategies Tab */}
                {marketplaceTab === 'saved' && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {savedStrategies.length === 0 ? (
                      <p className="text-xs text-ash/40 text-center py-4">暂无保存的策略，点击"存到市场"按钮保存</p>
                    ) : (
                      savedStrategies.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(11,12,16,0.5)] border border-[rgba(206,209,213,0.06)] hover:border-gray-700 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-pure truncate">{s.name}</span>
                              <span className="text-xs font-semibold text-gold-standard">{s.score}分</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {s.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(206,209,213,0.06)] text-ash/50">{tag}</span>
                              ))}
                              <span className="text-[10px] text-ash/30">
                                收益{s.backtestResult.totalReturn.toFixed(1)}% · 夏普{s.backtestResult.sharpeRatio.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteStrategy(s.id)}
                            className="p-1.5 rounded-lg text-ash/30 hover:text-reversion-red hover:bg-[rgba(255,42,109,0.04)] transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Leaderboard Tab */}
                {marketplaceTab === 'leaderboard' && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {getStrategyLeaderboard().length === 0 ? (
                      <p className="text-xs text-ash/40 text-center py-4">暂无排行数据，保存策略后自动生成</p>
                    ) : (
                      getStrategyLeaderboard().map((item) => (
                        <div key={item.strategyId} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          item.rank <= 3 ? 'bg-[rgba(11,12,16,0.8)] border-amber-500/20' : 'bg-[rgba(11,12,16,0.5)] border-[rgba(206,209,213,0.06)]'
                        }`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            item.rank === 1 ? 'bg-[rgba(245,166,35,0.08)] text-gold-standard' :
                            item.rank === 2 ? 'bg-gray-400/20 text-ash' :
                            item.rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                            'bg-[rgba(206,209,213,0.06)] text-ash/40'
                          }`}>
                            {item.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-pure truncate">{item.name}</div>
                            <div className="text-[10px] text-ash/40">
                              收益{item.totalReturn.toFixed(1)}% · 夏普{item.sharpeRatio.toFixed(2)} · 回撤{item.maxDrawdown.toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-gold-standard">{item.score}</div>
                            <div className="text-[10px] text-ash/40">综合评分</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Import Error */}
      <AnimatePresence>
        {importError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl mx-auto px-4 sm:px-6 mt-4"
          >
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[rgba(255,42,109,0.04)] border border-[rgba(255,42,109,0.2)] text-reversion-red text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {importError}
              <button onClick={() => setImportError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ─── Config Panel ─── */}
        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="w-4 h-4 text-gold-standard" />
                  <h3 className="text-sm font-semibold text-pure">进化参数配置</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <ConfigField
                    label="种群大小"
                    value={config.populationSize}
                    min={10}
                    max={100}
                    onChange={(v) => setConfig((c) => ({ ...c, populationSize: v }))}
                  />
                  <ConfigField
                    label="最大代数"
                    value={config.maxGenerations}
                    min={5}
                    max={100}
                    onChange={(v) => setConfig((c) => ({ ...c, maxGenerations: v }))}
                  />
                  <ConfigSlider
                    label="交叉率"
                    value={config.crossoverRate}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setConfig((c) => ({ ...c, crossoverRate: v }))}
                  />
                  <ConfigSlider
                    label="变异率"
                    value={config.mutationRate}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setConfig((c) => ({ ...c, mutationRate: v }))}
                  />
                  <ConfigField
                    label="精英保留"
                    value={config.elitismCount}
                    min={1}
                    max={10}
                    onChange={(v) => setConfig((c) => ({ ...c, elitismCount: v }))}
                  />
                  <ConfigField
                    label="目标适应度"
                    value={config.targetFitness}
                    min={50}
                    max={100}
                    onChange={(v) => setConfig((c) => ({ ...c, targetFitness: v }))}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── API Key Panel ─── */}
        <AnimatePresence>
          {showApiPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="w-4 h-4 text-gold-standard" />
                  <h3 className="text-sm font-semibold text-pure">AI API 配置</h3>
                  {apiConfig && (
                    <span className="ml-auto text-xs text-apex-green flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> 已保存
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-ash/40 mb-1.5">提供商</label>
                    <select
                      value={apiProvider}
                      onChange={(e) => {
                        setApiProvider(e.target.value as APIKeyConfig['provider']);
                        setApiModel(providerModels[e.target.value as APIKeyConfig['provider']][0]);
                        setApiStatus('idle');
                      }}
                      className="w-full bg-[rgba(11,12,16,0.8)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-pure focus:outline-none focus:ring-1 focus:ring-gold-standard"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-ash/40 mb-1.5">模型</label>
                    <select
                      value={apiModel}
                      onChange={(e) => { setApiModel(e.target.value); setApiStatus('idle'); }}
                      className="w-full bg-[rgba(11,12,16,0.8)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-pure focus:outline-none focus:ring-1 focus:ring-gold-standard"
                    >
                      {providerModels[apiProvider].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className={apiProvider === 'custom' ? '' : 'sm:col-span-2'}>
                    <label className="block text-xs text-ash/40 mb-1.5">API Key</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => { setApiKeyInput(e.target.value); setApiStatus('idle'); }}
                        placeholder={apiConfig ? '•••••••• 已保存' : '输入 API Key'}
                        className="w-full bg-[rgba(11,12,16,0.8)] border border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm text-pure placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gold-standard"
                      />
                      <Lock className="absolute right-3 top-2.5 w-4 h-4 text-ash/30" />
                    </div>
                  </div>
                  {apiProvider === 'custom' && (
                    <div>
                      <label className="block text-xs text-ash/40 mb-1.5">Base URL</label>
                      <input
                        type="text"
                        value={apiBaseUrl}
                        onChange={(e) => { setApiBaseUrl(e.target.value); setApiStatus('idle'); }}
                        placeholder="https://api.example.com/v1"
                        className="w-full bg-[rgba(11,12,16,0.8)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-pure placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gold-standard"
                      />
                    </div>
                  )}
                </div>

                {/* Usage Stats */}
                {apiConfig && (
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-[rgba(11,12,16,0.5)] border border-[rgba(206,209,213,0.06)]">
                    <div className="text-center">
                      <div className="text-[10px] text-ash/40">总请求</div>
                      <div className="text-sm font-semibold text-pure">{apiUsage.totalRequests}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-ash/40">今日请求</div>
                      <div className="text-sm font-semibold text-pure">{apiUsage.dailyRequests}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-ash/40">错误</div>
                      <div className="text-sm font-semibold text-reversion-red">{apiUsage.totalErrors}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleTestAPIKeyWithStatus}
                    disabled={!apiKeyInput.trim() || apiStatus === 'testing'}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-[rgba(245,166,35,0.06)] text-gold-standard border border-[rgba(245,166,35,0.2)] hover:bg-[rgba(245,166,35,0.1)] transition-all disabled:opacity-40"
                  >
                    {apiStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                    测试连接
                  </button>
                  <button
                    onClick={handleSaveAPIKey}
                    disabled={!apiKeyInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-[rgba(0,255,148,0.08)] text-apex-green border border-[rgba(0,255,148,0.2)] hover:bg-[rgba(0,255,148,0.12)] transition-all disabled:opacity-40"
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存配置
                  </button>
                  {apiConfig && (
                    <>
                      <button
                        onClick={handleClearAPIKey}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-[rgba(255,42,109,0.04)] text-reversion-red border border-[rgba(255,42,109,0.2)] hover:bg-[rgba(255,42,109,0.08)] transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        清除
                      </button>
                      <button
                        onClick={handleResetUsage}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-[rgba(206,209,213,0.03)] text-ash/50 border border-[rgba(206,209,213,0.08)] hover:text-pure transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                        重置统计
                      </button>
                    </>
                  )}
                  {apiStatus === 'valid' && (
                    <span className="text-xs text-apex-green flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> 连接成功</span>
                  )}
                  {apiStatus === 'invalid' && (
                    <span className="text-xs text-reversion-red flex items-center gap-1"><WifiOff className="w-3.5 h-3.5" /> 连接失败</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Control Panel ─── */}
        <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Target Stock Code Input */}
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-ash/40" />
                <input
                  type="text"
                  value={targetStockCode}
                  onChange={(e) => setTargetStockCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="股票代码"
                  maxLength={6}
                  className="w-24 bg-[rgba(206,209,213,0.04)] border border-[rgba(206,209,213,0.08)] rounded-sm px-3 py-2 text-sm font-mono text-pure placeholder-ash/30 focus:outline-none focus:border-apex-green/40 transition-colors text-center"
                />
              </div>
              {!isRunning ? (
                <button
                  onClick={startEvolution}
                  disabled={isRunning}
                  className="flex items-center gap-2 px-6 py-3 rounded-sm bg-apex-green text-void font-semibold text-sm hover:bg-[#33FFAA] transition-all disabled:opacity-50 shadow-lg shadow-[rgba(0,255,148,0.15)]"
                >
                  <Play className="w-4 h-4" />
                  开始进化
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePause}
                    className="flex items-center gap-2 px-5 py-3 rounded-sm bg-gold-standard text-void font-semibold text-sm hover:bg-[#FFD44D] transition-all shadow-lg shadow-[rgba(245,166,35,0.15)]"
                  >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    {isPaused ? '继续' : '暂停'}
                  </button>
                  <button
                    onClick={resetEvolution}
                    className="flex items-center gap-2 px-4 py-3 rounded-sm bg-[rgba(255,42,109,0.06)] text-reversion-red border border-[rgba(255,42,109,0.2)] text-sm font-medium hover:bg-red-500/25 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    停止
                  </button>
                </div>
              )}

              {evolutionResult && !isRunning && (
                <>
                  <button
                    onClick={handleGenerateEnhancedReport}
                    disabled={enhancedLoading}
                    className="flex items-center gap-2 px-4 py-3 rounded-sm bg-[rgba(245,166,35,0.06)] text-gold-standard border border-[rgba(245,166,35,0.2)] text-sm font-medium hover:bg-violet-500/25 transition-all disabled:opacity-50"
                  >
                    {enhancedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {enhancedLoading ? '生成中...' : '增强报告'}
                  </button>
                  <button
                    onClick={handleSaveToLibrary}
                    className="flex items-center gap-2 px-4 py-3 rounded-sm bg-[rgba(245,166,35,0.06)] text-gold-standard border border-[rgba(245,166,35,0.2)] text-sm font-medium hover:bg-[rgba(245,166,35,0.1)] transition-all"
                  >
                    <Save className="w-4 h-4" />
                    保存到库
                  </button>
                  <button
                    onClick={handleSaveToMarketplace}
                    disabled={saveSuccess}
                    className="flex items-center gap-2 px-4 py-3 rounded-sm bg-[rgba(0,255,148,0.08)] text-apex-green border border-[rgba(0,255,148,0.2)] text-sm font-medium hover:bg-[rgba(0,255,148,0.12)] transition-all disabled:opacity-50"
                  >
                    {saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                    {saveSuccess ? '已保存' : '存到市场'}
                  </button>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <StatBadge icon={<Activity className="w-3.5 h-3.5" />} label="当前代数" value={currentGen} active={isRunning} />
              <StatBadge icon={<TrendingUp className="w-3.5 h-3.5" />} label="最优适应度" value={`${bestFitness.toFixed(1)}`} color="emerald" />
              <StatBadge icon={<BarChart3 className="w-3.5 h-3.5" />} label="平均适应度" value={`${avgFitness.toFixed(1)}`} />
              <StatBadge icon={<Dna className="w-3.5 h-3.5" />} label="种群多样性" value={`${(diversity * 100).toFixed(0)}%`} />
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
              <p className="text-xs text-ash/40 mt-1.5">
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
            className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-apex-green" />
              <h3 className="text-sm font-semibold text-pure">适应度进化曲线</h3>
              <div className="ml-auto flex items-center gap-3 text-xs">
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
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Strategy Elements */}
            <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-gold-standard" />
                <h3 className="text-sm font-semibold text-pure">最优策略组成</h3>
                <span className="ml-auto text-xs text-ash/40">第{evolutionResult.bestGenome.generation}代 · 适应度 {evolutionResult.bestGenome.fitness.toFixed(1)}</span>
              </div>
              <div className="space-y-2">
                {evolutionResult.bestGenome.elements.map((el, idx) => (
                  <ElementCard key={`${el.id}_${idx}`} element={el} index={idx} />
                ))}
              </div>
              {bestMetrics && (
                <button
                  onClick={() => setShowBestDetails(!showBestDetails)}
                  className="mt-4 flex items-center gap-1 text-xs text-ash/40 hover:text-ash transition-colors"
                >
                  {showBestDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  详细回测指标
                </button>
              )}
            </div>

            {/* Backtest Metrics */}
            {bestMetrics && (
              <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-gold-standard" />
                  <h3 className="text-sm font-semibold text-pure">回测表现</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="总收益率" value={`${bestMetrics.totalReturn}%`} color={bestMetrics.totalReturn >= 0 ? 'emerald' : 'red'} icon={<TrendingUp className="w-3.5 h-3.5" />} />
                  <MetricCard label="年化收益率" value={`${bestMetrics.annualizedReturn}%`} color={bestMetrics.annualizedReturn >= 0 ? 'emerald' : 'red'} icon={<Clock className="w-3.5 h-3.5" />} />
                  <MetricCard label="夏普比率" value={`${bestMetrics.sharpeRatio}`} color={bestMetrics.sharpeRatio > 1 ? 'emerald' : bestMetrics.sharpeRatio > 0 ? 'amber' : 'red'} icon={<Activity className="w-3.5 h-3.5" />} />
                  <MetricCard label="最大回撤" value={`${bestMetrics.maxDrawdown}%`} color="red" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
                  <MetricCard label="胜率" value={`${bestMetrics.winRate}%`} color={bestMetrics.winRate > 50 ? 'emerald' : 'amber'} icon={<Percent className="w-3.5 h-3.5" />} />
                  <MetricCard label="交易次数" value={`${bestMetrics.totalTrades}`} color="sky" icon={<Layers className="w-3.5 h-3.5" />} />
                  <MetricCard label="最佳单次" value={`${bestMetrics.bestReturn}%`} color="emerald" icon={<DollarSign className="w-3.5 h-3.5" />} />
                  <MetricCard label="最差单次" value={`${bestMetrics.worstReturn}%`} color="red" icon={<DollarSign className="w-3.5 h-3.5" />} />
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

        {/* ─── Strategy Report ─── */}
        <AnimatePresence>
          {showReport && report && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-5"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gold-standard" />
                <h3 className="text-sm font-semibold text-pure">策略分析报告</h3>
                <button onClick={() => setShowReport(false)} className="ml-auto text-ash/40 hover:text-ash">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Backtest Summary */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <MiniStat label="总收益" value={`${report.backtestResult.totalReturn}%`} />
                <MiniStat label="年化" value={`${report.backtestResult.annualizedReturn}%`} />
                <MiniStat label="夏普" value={`${report.backtestResult.sharpeRatio}`} />
                <MiniStat label="回撤" value={`${report.backtestResult.maxDrawdown}%`} />
                <MiniStat label="胜率" value={`${report.backtestResult.winRate}%`} />
                <MiniStat label="交易数" value={`${report.backtestResult.totalTrades}`} />
              </div>

              {/* AI Analysis */}
              <div className="bg-[rgba(11,12,16,0.5)] rounded-lg p-4 border border-[rgba(206,209,213,0.06)]">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-gold-standard" />
                  <h4 className="text-sm font-medium text-pure">AI 策略分析</h4>
                </div>
                <div className="text-sm text-ash/50 whitespace-pre-line leading-relaxed">
                  {report.analysis}
                </div>
              </div>

              {/* Risk Assessment */}
              <div className="bg-[rgba(11,12,16,0.5)] rounded-lg p-4 border border-[rgba(206,209,213,0.06)]">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-4 h-4 text-gold-standard" />
                  <h4 className="text-sm font-medium text-pure">风险评估</h4>
                </div>
                <div className="text-sm text-ash/50 whitespace-pre-line leading-relaxed">
                  {report.riskAssessment}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Parameter Sensitivity Analysis ─── */}
        <AnimatePresence>
          {sensitivityData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold text-pure">参数敏感性分析</h3>
                <span className="text-xs text-ash/40 ml-2">扰动策略参数观察适应度变化</span>
                <button
                  onClick={() => setShowSensitivity(!showSensitivity)}
                  className="ml-auto text-xs text-ash/40 hover:text-ash transition-colors"
                >
                  {showSensitivity ? '收起' : '展开'}
                </button>
              </div>

              {showSensitivity && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {/* Sensitivity Bar Chart */}
                  <div className="h-56 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sensitivityData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} domain={[0, 100]} />
                        <YAxis dataKey="parameter" type="category" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} width={80} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0B0C10', border: '1px solid rgba(206,209,213,0.1)', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: '#9ca3af' }}
                          formatter={(value: number) => [`敏感性: ${value.toFixed(1)}`, '']}
                        />
                        <Bar dataKey="sensitivity" fill="#f43f5e" radius={[0, 4, 4, 0]} name="敏感性" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Parameter Detail Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sensitivityData.slice(0, 6).map((item) => (
                      <div
                        key={`${item.elementName}_${item.parameter}`}
                        className={`rounded-lg border p-3 ${
                          item.impact === 'HIGH' ? 'bg-rose-500/5 border-rose-500/20' :
                          item.impact === 'MEDIUM' ? 'bg-amber-500/5 border-amber-500/20' :
                          'bg-[rgba(206,209,213,0.06)]/30 border-[rgba(206,209,213,0.06)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-ash">{item.parameter}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            item.impact === 'HIGH' ? 'bg-rose-500/15 text-rose-400' :
                            item.impact === 'MEDIUM' ? 'bg-[rgba(245,166,35,0.06)] text-gold-standard' :
                            'bg-[rgba(206,209,213,0.03)] text-ash/50'
                          }`}>
                            {item.impact === 'HIGH' ? '高敏感' : item.impact === 'MEDIUM' ? '中敏感' : '低敏感'}
                          </span>
                        </div>
                        <div className="text-[10px] text-ash/40 mt-1">{item.elementName}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-[rgba(206,209,213,0.06)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.impact === 'HIGH' ? 'bg-rose-500' :
                                item.impact === 'MEDIUM' ? 'bg-amber-500' :
                                'bg-gray-600'
                              }`}
                              style={{ width: `${item.sensitivity}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-ash/50 w-8 text-right">{item.sensitivity.toFixed(1)}</span>
                        </div>
                        <div className="text-[10px] text-ash/30 mt-1">
                          范围: {item.minValue} ~ {item.maxValue} · 当前: {item.currentValue}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Element Pool ─── */}
        <ElementPoolSection />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════ */

function ConfigField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-ash/40 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        className="w-full bg-[rgba(11,12,16,0.8)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-pure focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
    </div>
  );
}

function ConfigSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-ash/40 mb-1">{label}: {value.toFixed(step < 0.1 ? 2 : 1)}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
    </div>
  );
}

function StatBadge({ icon, label, value, color = 'gray', active = false }: {
  icon: React.ReactNode; label: string; value: string | number;
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
      <span className="text-[10px] text-ash/40 uppercase tracking-wider">{label}</span>
      <span className={`text-lg font-bold ${colorMap[color] || colorMap.gray} flex items-center gap-1`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

function ElementCard({ element, index }: { element: StrategyElement; index: number }) {
  const typeColors: Record<StrategyElement['type'], { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    entry: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-apex-green', icon: <ChevronRight className="w-3.5 h-3.5" /> },
    exit: { bg: 'bg-[rgba(255,42,109,0.04)]', border: 'border-red-500/25', text: 'text-reversion-red', icon: <X className="w-3.5 h-3.5" /> },
    filter: { bg: 'bg-sky-500/10', border: 'border-sky-500/25', text: 'text-gold-standard', icon: <Eye className="w-3.5 h-3.5" /> },
    risk: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', text: 'text-gold-standard', icon: <Shield className="w-3.5 h-3.5" /> },
    position: { bg: 'bg-violet-500/10', border: 'border-violet-500/25', text: 'text-gold-standard', icon: <Layers className="w-3.5 h-3.5" /> },
  };
  const tc = typeColors[element.type];
  const typeLabels: Record<StrategyElement['type'], string> = { entry: '入场', exit: '出场', filter: '过滤', risk: '风控', position: '仓位' };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${tc.bg} ${tc.border}`}
    >
      <span className={tc.text}>{tc.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${tc.bg} ${tc.text}`}>{typeLabels[element.type]}</span>
          <span className="text-sm font-medium text-pure">{element.name}</span>
        </div>
        <p className="text-xs text-ash/40 truncate mt-0.5">{element.description}</p>
        {element.params && element.params.length > 0 && (
          <p className="text-[10px] text-ash/30 mt-0.5">
            {element.params.map((p) => `${p.name}=${p.value}`).join(', ')}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function MetricCard({ label, value, color, icon }: {
  label: string; value: string; color: string; icon?: React.ReactNode;
}) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-apex-green' },
    sky: { bg: 'bg-sky-500/10 border-sky-500/20', text: 'text-gold-standard' },
    amber: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-gold-standard' },
    red: { bg: 'bg-[rgba(255,42,109,0.04)] border-red-500/20', text: 'text-reversion-red' },
  };
  const c = colorMap[color] || colorMap.sky;
  return (
    <div className={`rounded-lg border ${c.bg} p-3`}>
      <div className="flex items-center gap-1.5 text-xs text-ash/40 mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-bold ${c.text}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[rgba(11,12,16,0.5)] rounded-lg p-2.5 text-center border border-[rgba(206,209,213,0.06)]">
      <div className="text-[10px] text-ash/40">{label}</div>
      <div className="text-sm font-semibold text-pure">{value}</div>
    </div>
  );
}

function ElementPoolSection() {
  const [expanded, setExpanded] = useState(false);
  const pool = getEvolutionElementPool();
  const entries = pool.filter((e) => e.type === 'entry');
  const exits = pool.filter((e) => e.type === 'exit');
  const filters = pool.filter((e) => e.type === 'filter');
  const risks = pool.filter((e) => e.type === 'risk');

  return (
    <div className="bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full"
      >
        <Layers className="w-4 h-4 text-ash/50" />
        <h3 className="text-sm font-semibold text-ash">策略基因库</h3>
        <span className="text-xs text-ash/30 ml-2">{pool.length} 个元素</span>
        {expanded ? <ChevronUp className="w-4 h-4 ml-auto text-ash/40" /> : <ChevronDown className="w-4 h-4 ml-auto text-ash/40" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PoolGroup title="入场信号" items={entries} color="emerald" />
              <PoolGroup title="出场信号" items={exits} color="red" />
              <PoolGroup title="过滤条件" items={filters} color="sky" />
              <PoolGroup title="风控管理" items={risks} color="amber" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PoolGroup({ title, items, color }: {
  title: string; items: StrategyElement[]; color: string;
}) {
  const colorMap: Record<string, { border: string; title: string }> = {
    emerald: { border: 'border-emerald-500/15', title: 'text-apex-green' },
    red: { border: 'border-red-500/15', title: 'text-reversion-red' },
    sky: { border: 'border-sky-500/15', title: 'text-gold-standard' },
    amber: { border: 'border-amber-500/15', title: 'text-gold-standard' },
  };
  const c = colorMap[color] || colorMap.sky;

  return (
    <div className={`border ${c.border} rounded-lg p-3`}>
      <h4 className={`text-xs font-semibold ${c.title} mb-2`}>{title} ({items.length})</h4>
      <div className="space-y-1.5">
        {items.map((el) => (
          <div key={el.id} className="text-xs text-ash/40">
            <span className="text-ash/50 font-medium">{el.name}</span>
            <span className="text-ash/30 ml-1">· {el.description}</span>
          </div>
        ))}
      </div>
    </div>
   );
}
