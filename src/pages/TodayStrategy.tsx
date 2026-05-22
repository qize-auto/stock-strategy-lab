import { useMemo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, BarChart3,
  Target, ArrowUp, ArrowDown, Activity, Sun, Cloud, CloudRain,
  Search, X, ChevronRight, Sparkles, Loader2
} from 'lucide-react';
import {
  queryStock, queryStocks, getStockFromLocal, isTradingTime,
  fetchMarketHeatTop10, fetchSectorHeatmap, generateKLines,
  type StockInfo, type HeatItem, type SectorItem_real, type KLineData,
} from '@/services/stockApi';
import { fetchMarketFlow, type MarketFlow } from '@/services/marketFlow';
import { exploreCombinations, runBacktest, ENTRY_SIGNALS, EXIT_SIGNALS } from '@/services/strategyEngine';
import { useApp, type StrategyElement } from '@/contexts/AppContext';

/* ──────────────────────── deterministic helpers ──────────────────────── */

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashDate(seedStr: string): number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = ((h << 5) - h + seedStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/* ──────────────────────── 真实策略匹配 ──────────────────────── */

interface StrategyMatch {
  name: string;           // 策略名称
  score: number;          // 回测得分
  entrySignals: string;   // 入场信号（如"MACD金叉+RSI超卖"）
  exitSignals: string;    // 出场信号
  isCustom: boolean;      // 是否用户自定义策略
  totalReturn: number;    // 回测收益率%
  winRate: number;        // 胜率%
}

type MatchStatus = 'idle' | 'loading' | 'matched' | 'no_kline' | 'no_match';

/** 匹配结果：成功返回match，失败返回error */
interface MatchResult {
  match?: StrategyMatch;
  error?: 'kline_fail' | 'no_match';
}

/** 核心内置策略组合列表（直接测试，避免exploreCombinations的庞大计算） */
const CORE_COMBOS = [
  { entry: 'ma_cross', exit: 'ma_death', name: '均线趋势跟踪' },
  { entry: 'macd_golden', exit: 'macd_death', name: 'MACD动量策略' },
  { entry: 'rsi_deep_oversold', exit: 'rsi_deep_overbought', name: 'RSI均值回归' },
  { entry: 'kdj_golden', exit: 'kdj_death', name: 'KDJ反转策略' },
  { entry: 'bb_lower_bounce', exit: 'bb_upper_reversal', name: '布林带波段' },
  { entry: 'volume_price_surge', exit: 'volume_shrink', name: '量价突破' },
  { entry: 'ma_cross', exit: 'atr_trailing_stop', name: '趋势+ATR止盈' },
  { entry: 'macd_golden', exit: 'fixed_stop_loss', name: 'MACD+固定止损' },
];

/** 对单只股票运行真实策略匹配 */
async function matchBestStrategy(
  code: string,
  basePrice: number,
  customStrategies: import('@/contexts/AppContext').CustomStrategy[]
): Promise<MatchResult> {
  // 获取K线数据
  let kline: KLineData[];
  try {
    kline = await generateKLines(basePrice, code, 60);
  } catch {
    return { error: 'kline_fail' };
  }
  if (!kline || kline.length < 30) {
    return { error: 'kline_fail' };
  }

  let bestWithTrades: StrategyMatch | null = null;
  let bestScoreWithTrades = -Infinity;
  let bestOverall: StrategyMatch | null = null;
  let bestScoreOverall = -Infinity;

  // 辅助：评估一个策略组合
  const evaluateCombo = (elements: StrategyElement[], name: string, isCustom: boolean) => {
    try {
      const bt = runBacktest(kline, { elements }, 100000, undefined, code);
      // 无条件追踪最佳评分（兜底，确保总能选出最优策略）
      if (bt.score > bestScoreOverall) {
        bestScoreOverall = bt.score;
        bestOverall = {
          name,
          score: bt.score,
          entrySignals: elements.filter(e => e.type === 'entry').map(e => e.name).join('+') || '-',
          exitSignals: elements.filter(e => e.type === 'exit').map(e => e.name).join('+') || '-',
          isCustom,
          totalReturn: bt.totalReturn,
          winRate: bt.winRate,
        };
      }
      // 单独追踪有交易记录的最佳策略
      if (bt.tradeCount > 0 && bt.score > bestScoreWithTrades) {
        bestScoreWithTrades = bt.score;
        bestWithTrades = {
          name,
          score: bt.score,
          entrySignals: elements.filter(e => e.type === 'entry').map(e => e.name).join('+') || '-',
          exitSignals: elements.filter(e => e.type === 'exit').map(e => e.name).join('+') || '-',
          isCustom,
          totalReturn: bt.totalReturn,
          winRate: bt.winRate,
        };
      }
    } catch { /* ignore */ }
  };

  // 1. 评分用户自定义策略（优先）
  for (const cs of customStrategies) {
    if (cs.elements.length < 2) continue;
    evaluateCombo(cs.elements, cs.name, true);
  }

  // 2. 测试核心内置策略组合（8个组合，最多8次回测）
  for (const combo of CORE_COMBOS) {
    const entry = ENTRY_SIGNALS.find(e => e.id === combo.entry);
    const exit = EXIT_SIGNALS.find(e => e.id === combo.exit);
    if (!entry || !exit) continue;
    evaluateCombo([entry, exit], combo.name, false);
  }

  // 3. 如果核心组合都没交易，尝试exploreCombinations作为补充
  if (!bestWithTrades && !bestOverall) {
    try {
      const explored = exploreCombinations(kline, 3, undefined, code);
      for (const ex of explored) {
        if (ex.backtest.tradeCount > 0 && ex.score > bestScoreWithTrades) {
          bestScoreWithTrades = ex.score;
          bestWithTrades = {
            name: ex.combo.name,
            score: ex.score,
            entrySignals: ex.combo.elements.filter(e => e.type === 'entry').map(e => e.name).join('+') || '-',
            exitSignals: ex.combo.elements.filter(e => e.type === 'exit').map(e => e.name).join('+') || '-',
            isCustom: false,
            totalReturn: ex.backtest.totalReturn,
            winRate: ex.backtest.winRate,
          };
        }
      }
    } catch { /* ignore */ }
  }

  // 优先返回有交易记录的策略，没有则返回无条件评分最高的（保证总能匹配到一个策略）
  const best = bestWithTrades || bestOverall;
  if (!best) {
    return { error: 'no_match' };
  }
  return { match: best };
}

/* ──────────────────────── data ──────────────────────── */

const TODAY = new Date();
const DATE_STR = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`;
const DAY_SEED = hashDate(DATE_STR);

const STOCKS = [
  // ═══ 白酒 ═══
  { code: '600519', name: '贵州茅台', industry: '白酒', basePrice: 1680 },
  { code: '000858', name: '五粮液', industry: '白酒', basePrice: 142 },
  { code: '000568', name: '泸州老窖', industry: '白酒', basePrice: 185 },
  { code: '600809', name: '山西汾酒', industry: '白酒', basePrice: 210 },
  { code: '002304', name: '洋河股份', industry: '白酒', basePrice: 98 },
  // ═══ 新能源 ═══
  { code: '300750', name: '宁德时代', industry: '新能源', basePrice: 210 },
  { code: '002594', name: '比亚迪', industry: '新能源', basePrice: 245 },
  { code: '002466', name: '天齐锂业', industry: '新能源', basePrice: 42 },
  { code: '002460', name: '赣锋锂业', industry: '新能源', basePrice: 38 },
  { code: '601012', name: '隆基绿能', industry: '新能源', basePrice: 22 },
  { code: '600438', name: '通威股份', industry: '新能源', basePrice: 25 },
  { code: '002129', name: 'TCL中环', industry: '新能源', basePrice: 12 },
  { code: '300274', name: '阳光电源', industry: '新能源', basePrice: 88 },
  { code: '002506', name: '协鑫集成', industry: '新能源', basePrice: 4.0 },
  { code: '600089', name: '特变电工', industry: '新能源', basePrice: 15 },
  { code: '688599', name: '天合光能', industry: '新能源', basePrice: 22 },
  { code: '000591', name: '太阳能', industry: '新能源', basePrice: 6.5 },
  { code: '600732', name: '爱旭股份', industry: '新能源', basePrice: 14 },
  // ═══ 半导体/电子 ═══
  { code: '688981', name: '中芯国际', industry: '半导体', basePrice: 52.8 },
  { code: '002475', name: '立讯精密', industry: '电子', basePrice: 32.8 },
  { code: '603501', name: '韦尔股份', industry: '半导体', basePrice: 105 },
  { code: '000725', name: '京东方A', industry: '电子', basePrice: 4.2 },
  { code: '002371', name: '北方华创', industry: '半导体', basePrice: 320 },
  { code: '600584', name: '长电科技', industry: '半导体', basePrice: 38 },
  { code: '688012', name: '中微公司', industry: '半导体', basePrice: 145 },
  { code: '603986', name: '兆易创新', industry: '半导体', basePrice: 98 },
  { code: '002049', name: '紫光国微', industry: '半导体', basePrice: 58 },
  { code: '002241', name: '歌尔股份', industry: '电子', basePrice: 22 },
  { code: '688008', name: '澜起科技', industry: '半导体', basePrice: 68 },
  { code: '600460', name: '士兰微', industry: '半导体', basePrice: 25 },
  { code: '300782', name: '卓胜微', industry: '半导体', basePrice: 85 },
  { code: '603160', name: '汇顶科技', industry: '半导体', basePrice: 72 },
  { code: '688396', name: '华润微', industry: '半导体', basePrice: 48 },
  { code: '300661', name: '圣邦股份', industry: '半导体', basePrice: 92 },
  { code: '600183', name: '生益科技', industry: '电子', basePrice: 22 },
  { code: '002463', name: '沪电股份', industry: '电子', basePrice: 35 },
  { code: '002384', name: '东山精密', industry: '电子', basePrice: 28 },
  { code: '603893', name: '瑞芯微', industry: '半导体', basePrice: 88 },
  { code: '688256', name: '寒武纪', industry: 'AI芯片', basePrice: 168 },
  { code: '300223', name: '北京君正', industry: '半导体', basePrice: 72 },
  { code: '002156', name: '通富微电', industry: '半导体', basePrice: 28 },
  { code: '688126', name: '沪硅产业', industry: '半导体', basePrice: 18 },
  // ═══ 金融 ═══
  { code: '601318', name: '中国平安', industry: '保险', basePrice: 48.2 },
  { code: '600036', name: '招商银行', industry: '银行', basePrice: 33.5 },
  { code: '300059', name: '东方财富', industry: '金融科技', basePrice: 18.5 },
  { code: '600030', name: '中信证券', industry: '券商', basePrice: 24.5 },
  { code: '601688', name: '华泰证券', industry: '券商', basePrice: 15.2 },
  { code: '601398', name: '工商银行', industry: '银行', basePrice: 5.2 },
  { code: '601166', name: '兴业银行', industry: '银行', basePrice: 18.5 },
  { code: '600837', name: '海通证券', industry: '券商', basePrice: 9.5 },
  { code: '000776', name: '广发证券', industry: '券商', basePrice: 15.8 },
  { code: '601211', name: '国泰君安', industry: '券商', basePrice: 16.5 },
  { code: '601881', name: '中国银河', industry: '券商', basePrice: 14.2 },
  { code: '000001', name: '平安银行', industry: '银行', basePrice: 11.5 },
  { code: '601009', name: '南京银行', industry: '银行', basePrice: 10.8 },
  { code: '600919', name: '江苏银行', industry: '银行', basePrice: 9.2 },
  { code: '601128', name: '常熟银行', industry: '银行', basePrice: 7.8 },
  { code: '601939', name: '建设银行', industry: '银行', basePrice: 7.5 },
  { code: '601288', name: '农业银行', industry: '银行', basePrice: 4.5 },
  { code: '601988', name: '中国银行', industry: '银行', basePrice: 4.8 },
  { code: '601658', name: '邮储银行', industry: '银行', basePrice: 5.2 },
  // ═══ 消费/医药 ═══
  { code: '000333', name: '美的集团', industry: '家电', basePrice: 62.4 },
  { code: '000651', name: '格力电器', industry: '家电', basePrice: 38.5 },
  { code: '603288', name: '海天味业', industry: '食品', basePrice: 42 },
  { code: '600276', name: '恒瑞医药', industry: '医药', basePrice: 48 },
  { code: '300760', name: '迈瑞医疗', industry: '医药', basePrice: 285 },
  { code: '000538', name: '云南白药', industry: '医药', basePrice: 58 },
  { code: '300999', name: '金龙鱼', industry: '食品', basePrice: 32 },
  { code: '002714', name: '牧原股份', industry: '农牧', basePrice: 42 },
  { code: '600887', name: '伊利股份', industry: '食品', basePrice: 28.5 },
  { code: '603259', name: '药明康德', industry: '医药', basePrice: 48 },
  { code: '000963', name: '华东医药', industry: '医药', basePrice: 35 },
  { code: '300003', name: '乐普医疗', industry: '医药', basePrice: 15.5 },
  { code: '002007', name: '华兰生物', industry: '医药', basePrice: 18.5 },
  { code: '600196', name: '复星医药', industry: '医药', basePrice: 24.5 },
  { code: '000423', name: '东阿阿胶', industry: '医药', basePrice: 58 },
  { code: '603392', name: '万泰生物', industry: '医药', basePrice: 72 },
  { code: '300122', name: '智飞生物', industry: '医药', basePrice: 35 },
  { code: '000895', name: '双汇发展', industry: '食品', basePrice: 25.5 },
  { code: '600600', name: '青岛啤酒', industry: '食品', basePrice: 68 },
  { code: '002568', name: '百润股份', industry: '食品', basePrice: 22 },
  { code: '002032', name: '苏泊尔', industry: '家电', basePrice: 52 },
  { code: '002508', name: '老板电器', industry: '家电', basePrice: 22 },
  // ═══ 科技/通信/软件 ═══
  { code: '000063', name: '中兴通讯', industry: '通信', basePrice: 28 },
  { code: '600050', name: '中国联通', industry: '通信', basePrice: 4.8 },
  { code: '688111', name: '金山办公', industry: '软件', basePrice: 265 },
  { code: '300033', name: '同花顺', industry: '软件', basePrice: 158 },
  { code: '002230', name: '科大讯飞', industry: 'AI', basePrice: 52 },
  { code: '300124', name: '汇川技术', industry: '自动化', basePrice: 58 },
  { code: '002236', name: '大华股份', industry: '安防', basePrice: 18.5 },
  { code: '002415', name: '海康威视', industry: '安防', basePrice: 32 },
  { code: '601728', name: '中国电信', industry: '通信', basePrice: 5.8 },
  { code: '600941', name: '中国移动', industry: '通信', basePrice: 98 },
  { code: '603444', name: '吉比特', industry: '游戏', basePrice: 218 },
  { code: '002602', name: '世纪华通', industry: '游戏', basePrice: 5.8 },
  { code: '300418', name: '昆仑万维', industry: 'AI', basePrice: 38 },
  { code: '000938', name: '中材国际', industry: '软件', basePrice: 12.5 },
  { code: '002439', name: '启明星辰', industry: '软件', basePrice: 18.5 },
  // ═══ 制造/军工/有色/化工 ═══
  { code: '601899', name: '紫金矿业', industry: '有色', basePrice: 15.8 },
  { code: '600031', name: '三一重工', industry: '机械', basePrice: 16.5 },
  { code: '601766', name: '中国中车', industry: '轨交', basePrice: 7.2 },
  { code: '600893', name: '航发动力', industry: '军工', basePrice: 42 },
  { code: '601390', name: '中国中铁', industry: '基建', basePrice: 6.5 },
  { code: '601668', name: '中国建筑', industry: '基建', basePrice: 5.8 },
  { code: '600048', name: '保利发展', industry: '地产', basePrice: 11.2 },
  { code: '000002', name: '万科A', industry: '地产', basePrice: 8.5 },
  { code: '601919', name: '中远海控', industry: '航运', basePrice: 14.5 },
  { code: '600150', name: '中国船舶', industry: '船舶', basePrice: 38 },
  { code: '600309', name: '万华化学', industry: '化工', basePrice: 85 },
  { code: '600585', name: '海螺水泥', industry: '建材', basePrice: 24 },
  { code: '601727', name: '上海电气', industry: '机械', basePrice: 7.8 },
  { code: '600028', name: '中国石化', industry: '石油', basePrice: 6.2 },
  { code: '601857', name: '中国石油', industry: '石油', basePrice: 8.5 },
  { code: '600188', name: '兖矿能源', industry: '煤炭', basePrice: 15.8 },
  { code: '601088', name: '中国神华', industry: '煤炭', basePrice: 38 },
  { code: '600362', name: '江西铜业', industry: '有色', basePrice: 22 },
  { code: '000807', name: '云铝股份', industry: '有色', basePrice: 12.5 },
  { code: '002460', name: '赣锋锂业', industry: '有色', basePrice: 38 },
  { code: '600111', name: '北方稀土', industry: '有色', basePrice: 18.5 },
  { code: '600660', name: '福耀玻璃', industry: '汽配', basePrice: 42 },
  { code: '000768', name: '中航西飞', industry: '军工', basePrice: 26 },
  { code: '600760', name: '中航沈飞', industry: '军工', basePrice: 48 },
  { code: '000519', name: '中兵红箭', industry: '军工', basePrice: 15.5 },
  { code: '002025', name: '航天电器', industry: '军工', basePrice: 52 },
  { code: '601179', name: '中国西电', industry: '电气', basePrice: 7.8 },
  { code: '600406', name: '国电南瑞', industry: '电气', basePrice: 25.5 },
  // ═══ 汽车 ═══
  { code: '002594', name: '比亚迪', industry: '汽车', basePrice: 245 },
  { code: '601127', name: '赛力斯', industry: '汽车', basePrice: 85 },
  { code: '000625', name: '长安汽车', industry: '汽车', basePrice: 14.5 },
  { code: '601633', name: '长城汽车', industry: '汽车', basePrice: 28 },
  { code: '600104', name: '上汽集团', industry: '汽车', basePrice: 15.5 },
  { code: '600741', name: '华域汽车', industry: '汽配', basePrice: 18.5 },
  { code: '002920', name: '德赛西威', industry: '汽配', basePrice: 108 },
  // ═══ 互联网/传媒/物流 ═══
  { code: '002027', name: '分众传媒', industry: '传媒', basePrice: 7.2 },
  { code: '300413', name: '芒果超媒', industry: '传媒', basePrice: 28 },
  { code: '002352', name: '顺丰控股', industry: '物流', basePrice: 38 },
  { code: '300251', name: '光线传媒', industry: '传媒', basePrice: 9.5 },
  { code: '300459', name: '汤姆猫', industry: '游戏', basePrice: 4.8 },
  { code: '002425', name: '凯撒文化', industry: '游戏', basePrice: 3.2 },
  { code: '002174', name: '游族网络', industry: '游戏', basePrice: 9.8 },
  { code: '002555', name: '三七互娱', industry: '游戏', basePrice: 15.5 },
  // ═══ 电力/公用/环保 ═══
  { code: '600900', name: '长江电力', industry: '电力', basePrice: 28 },
  { code: '600886', name: '国投电力', industry: '电力', basePrice: 15.5 },
  { code: '600025', name: '华能水电', industry: '电力', basePrice: 9.8 },
  { code: '600795', name: '国电电力', industry: '电力', basePrice: 4.5 },
  { code: '003816', name: '中国广核', industry: '电力', basePrice: 3.8 },
  { code: '601985', name: '中国核电', industry: '电力', basePrice: 9.2 },
  { code: '000591', name: '太阳能', industry: '电力', basePrice: 5.2 },
  { code: '601016', name: '节能风电', industry: '电力', basePrice: 3.2 },
  { code: '000027', name: '深圳能源', industry: '电力', basePrice: 6.8 },
  // ═══ 农业 ═══
  { code: '002714', name: '牧原股份', industry: '农牧', basePrice: 42 },
  { code: '002385', name: '大北农', industry: '农牧', basePrice: 4.5 },
  { code: '002041', name: '登海种业', industry: '农牧', basePrice: 9.8 },
  { code: '300498', name: '温氏股份', industry: '农牧', basePrice: 18.5 },
  { code: '000876', name: '新希望', industry: '农牧', basePrice: 9.2 },
  // ═══ 医疗/医美 ═══
  { code: '300896', name: '爱美客', industry: '医美', basePrice: 285 },
  { code: '688363', name: '华熙生物', industry: '医美', basePrice: 62 },
  { code: '300015', name: '爱尔眼科', industry: '医疗', basePrice: 14.5 },
  { code: '002044', name: '美年健康', industry: '医疗', basePrice: 5.5 },
  // ═══ 纺织/轻工 ═══
  { code: '300979', name: '华利集团', industry: '纺织', basePrice: 62 },
  { code: '601339', name: '百隆东方', industry: '纺织', basePrice: 5.8 },
  // ═══ 建材/地产链 ═══
  { code: '002271', name: '东方雨虹', industry: '建材', basePrice: 14.5 },
  { code: '000786', name: '北新建材', industry: '建材', basePrice: 28.5 },
  { code: '002372', name: '伟星新材', industry: '建材', basePrice: 12.5 },
  // ═══ 交运/港口 ═══
  { code: '600009', name: '上海机场', industry: '交运', basePrice: 35 },
  { code: '600115', name: '中国东航', industry: '交运', basePrice: 3.8 },
  { code: '601111', name: '中国国航', industry: '交运', basePrice: 7.5 },
  { code: '600029', name: '南方航空', industry: '交运', basePrice: 5.8 },
  { code: '601006', name: '大秦铁路', industry: '交运', basePrice: 6.8 },
  { code: '600018', name: '上港集团', industry: '港口', basePrice: 5.5 },
  { code: '601298', name: '青岛港', industry: '港口', basePrice: 8.2 },
  // ═══ 其他热门 ═══
  { code: '000617', name: '中油资本', industry: '金融', basePrice: 6.5 },
  { code: '600570', name: '恒生电子', industry: '软件', basePrice: 22.5 },
  { code: '300454', name: '深信服', industry: '软件', basePrice: 55 },
  { code: '688561', name: '奇安信', industry: '软件', basePrice: 28 },
  { code: '002236', name: '大华股份', industry: '安防', basePrice: 16 },
  { code: '603019', name: '中科曙光', industry: '计算机', basePrice: 62 },
  { code: '000977', name: '浪潮信息', industry: '计算机', basePrice: 22 },
  { code: '300308', name: '中际旭创', industry: '通信', basePrice: 125 },
  { code: '300502', name: '新易盛', industry: '通信', basePrice: 95 },
  { code: '002281', name: '光迅科技', industry: '通信', basePrice: 35 },
  { code: '600487', name: '亨通光电', industry: '通信', basePrice: 16.5 },
  { code: '601138', name: '工业富联', industry: '电子', basePrice: 22 },
  { code: '00285', name: '比亚迪电子', industry: '电子', basePrice: 35 },
  { code: '688169', name: '石头科技', industry: '家电', basePrice: 225 },
  { code: '603486', name: '科沃斯', industry: '家电', basePrice: 52 },
  { code: '002032', name: '苏泊尔', industry: '家电', basePrice: 52 },
  { code: '000338', name: '潍柴动力', industry: '机械', basePrice: 15.5 },
  { code: '601669', name: '中国电建', industry: '基建', basePrice: 5.2 },
  { code: '601800', name: '中国交建', industry: '基建', basePrice: 9.8 },
  { code: '601186', name: '中国铁建', industry: '基建', basePrice: 8.5 },
  { code: '600019', name: '宝钢股份', industry: '钢铁', basePrice: 6.2 },
  { code: '000932', name: '华菱钢铁', industry: '钢铁', basePrice: 4.8 },
  { code: '600010', name: '包钢股份', industry: '钢铁', basePrice: 1.6 },
  { code: '002352', name: '顺丰控股', industry: '物流', basePrice: 38 },
  { code: '600233', name: '圆通速递', industry: '物流', basePrice: 16 },
  { code: '002120', name: '韵达股份', industry: '物流', basePrice: 8.5 },
  { code: '603195', name: '公牛集团', industry: '家电', basePrice: 72 },
];

// 行业映射 - 用于未知股票推断
const INDUSTRY_MAP: Record<string, string> = {
  '600': '传统制造', '601': '金融基建', '603': '制造业', '605': '制造业',
  '000': '综合', '001': '基建', '002': '制造业', '003': '制造业',
  '300': '创业板科技', '301': '创业板科技',
  '688': '科创板硬科技', '689': '科创板硬科技',
};

const INDEX_DATA = [
  { name: '沪深300', code: '000300', base: 3800 },
  { name: '创业板指', code: '399006', base: 2150 },
  { name: '上证指数', code: '000001', base: 3100 },
  { name: '科创50', code: '000688', base: 1050 },
];

const STRATEGY_ADVICE = [
  '均线系统呈多头排列，短期趋势向上',
  'RSI指标处于中性区间，等待方向确认',
  '布林带收口后放量突破， momentum 增强',
  'MACD金叉形成，动能指标转正',
  '成交量温和放大，资金持续流入',
  '回调至关键支撑位，反弹概率较高',
  '突破前期平台整理区间，趋势确立',
  '量价配合良好，短期有望延续升势',
  '技术指标共振，多信号确认买入',
  '均值回归信号触发，偏离度修复中',
];

/* ──────────────────────── unknown stock analyzer ──────────────────────── */

/** 优先调用queryStock获取真实数据，仅在API失败时回退到模拟 */
async function analyzeUnknownStock(code: string, seed: number) {
  // 第1步：尝试获取真实数据
  const realData = await queryStock(code);
  if (realData) {
    const changePct = realData.changePercent;
    // 基于真实涨跌幅给建议
    let advice: AdviceType;
    if (changePct > 2) advice = '买入';
    else if (changePct >= 0) advice = '持有';
    else if (changePct >= -2) advice = '观望';
    else advice = '减仓';

    return {
      code: realData.code,
      name: realData.name,
      industry: realData.industry || '综合',
      advice,
      adviceColor: adviceColor(advice),
      changePct: Math.round(changePct * 100) / 100,
      price: realData.price,
      support: realData.low,
      pressure: realData.high,
      strategy: '趋势跟踪',
      reason: `【真实数据】当前价¥${realData.price}，涨跌幅${changePct.toFixed(2)}%，市值${(realData.marketCap / 10000).toFixed(0)}亿`,
      confidence: 70,
      keyLevel: `${realData.low.toFixed(2)} / ${realData.high.toFixed(2)}`,
    };
  }

  // 第2步：API失败，回退到模拟数据
  const rng = seededRandom(seed + hashDate(code));
  const prefix = code.substring(0, 3);

  // Infer industry from code prefix
  const industry = INDUSTRY_MAP[prefix] || '综合行业';

  // Generate realistic base price based on industry (not code digits)
  // Different boards have different typical price ranges
  const priceRanges: Record<string, [number, number]> = {
    '传统制造': [5, 40], '金融基建': [3, 25], '制造业': [5, 50],
    '综合': [5, 35], '基建': [3, 15], '创业板科技': [8, 80],
    '科创板硬科技': [15, 120], '保险': [30, 60], '银行': [3, 15],
    '券商': [8, 30], '白酒': [80, 500], '新能源': [10, 60],
    '半导体': [20, 100], '电子': [8, 50], '医药': [15, 80],
    '家电': [20, 70], '食品': [15, 60], '农牧': [10, 50],
    '通信': [4, 35], '软件': [30, 200], 'AI': [15, 60],
    '自动化': [15, 70], '安防': [10, 40], '有色': [5, 30],
    '机械': [8, 35], '轨交': [5, 15], '军工': [15, 60],
    '地产': [3, 15], '航运': [5, 25], '传媒': [5, 30],
    '物流': [15, 45], '电力': [3, 12], '煤炭': [8, 35],
  };
  const [minP, maxP] = priceRanges[industry] || [5, 50];
  const basePrice = minP + rng() * (maxP - minP);

  // Generate advice based on code hash
  const adviceRoll = rng();
  let advice: AdviceType;
  let adviceColorStr: string;
  if (adviceRoll < 0.25) { advice = '买入'; adviceColorStr = '#00FF94'; }
  else if (adviceRoll < 0.55) { advice = '持有'; adviceColorStr = '#D4AF37'; }
  else if (adviceRoll < 0.80) { advice = '观望'; adviceColorStr = '#CED1D5'; }
  else { advice = '减仓'; adviceColorStr = '#FF2A6D'; }

  // Generate key levels
  const support = basePrice * (0.88 + rng() * 0.05);
  const pressure = basePrice * (1.08 + rng() * 0.06);

  // Generate strategy
  const strategies = ['趋势跟踪', '均值回归', '突破交易', '因子选股', '波段操作'];
  const strategy = strategies[Math.floor(rng() * strategies.length)];

  // Generate reasons based on industry
  const industryReasons: Record<string, string[]> = {
    '白酒': ['白酒板块季节性旺季临近，需求回暖', '高端白酒库存去化良好，价格体系稳定', '机构持仓比例回升，北向资金持续流入'],
    '新能源': ['新能源产业链景气度维持高位', '政策利好持续释放，装机量超预期', '上游原材料价格回落，盈利修复'],
    '半导体': ['半导体周期底部特征明显，库存拐点临近', '国产替代加速，设备材料端持续受益', 'AI算力需求旺盛，先进封装技术突破'],
    '金融基建': ['估值处于历史低位，安全边际充足', '政策托底预期强化，基建投资提速', '高股息策略受青睐，防御属性突出'],
    '创业板科技': ['科技创新政策加码，研发投入加速', '成长性突出，业绩弹性较大', '资金关注度高，市场情绪回暖'],
    '科创板硬科技': ['硬科技属性强，技术壁垒高', '政策大力扶持，产业趋势明确', '细分领域龙头，市场份额持续提升'],
    '制造业': ['制造业PMI回升，景气度改善', '出口订单回暖，海外需求复苏', '自动化升级加速，效率提升明显'],
  };

  const reasons = industryReasons[industry] || [
    '技术指标出现积极信号，短期动能增强',
    '行业政策面出现利好，市场预期改善',
    '资金面呈现流入迹象，机构关注度提升',
  ];

  const changePct = (rng() - 0.45) * 6;

  return {
    code,
    name: `${industry}股(${code})`,
    industry,
    advice,
    adviceColor: adviceColorStr,
    changePct: Math.round(changePct * 100) / 100,
    price: Math.round(basePrice * 100) / 100,
    support: Math.round(support * 100) / 100,
    pressure: Math.round(pressure * 100) / 100,
    strategy,
    reason: reasons[Math.floor(rng() * reasons.length)],
    confidence: 50 + Math.floor(rng() * 30),
    keyLevel: `${Math.round(support * 100) / 100} / ${Math.round(pressure * 100) / 100}`,
  };
}

/* ──────────────────────── generators ──────────────────────── */

type MarketType = '趋势上涨' | '震荡整理' | '趋势下跌' | '高波动';
type SentimentType = '贪婪' | '乐观' | '中性' | '恐惧' | '极度恐惧';
type AdviceType = '买入' | '持有' | '观望' | '减仓';

function generateMarketState(realDataMap: Record<string, StockInfo>): {
  marketType: MarketType;
  sentiment: SentimentType;
  sentimentScore: number;
  description: string;
} {
  // 基于真实数据计算市场状态
  const stocks = Object.values(realDataMap);
  const total = stocks.length;

  if (total === 0) {
    // 无真实数据时回退到默认值
    return {
      marketType: '震荡整理',
      sentiment: '中性',
      sentimentScore: 50,
      description: '市场数据加载中，等待方向选择。',
    };
  }

  const upCount = stocks.filter((s) => s.changePercent > 0).length;
  const downCount = stocks.filter((s) => s.changePercent < 0).length;
  const avgChange = stocks.reduce((sum, s) => sum + s.changePercent, 0) / total;
  const upRatio = upCount / total;

  let marketType: MarketType;
  let sentiment: SentimentType;
  let sentimentScore: number;
  let description: string;

  if (upRatio > 0.6 && avgChange > 1) {
    marketType = '趋势上涨';
    sentiment = avgChange > 2 ? '贪婪' : '乐观';
    sentimentScore = 65 + Math.floor(Math.min(avgChange * 5, 35));
    description = `市场整体呈现上涨态势，${upCount}只股票上涨，平均涨幅${avgChange.toFixed(2)}%，多数板块表现活跃。`;
  } else if (upRatio < 0.35 && avgChange < -0.5) {
    marketType = '趋势下跌';
    sentiment = avgChange < -1.5 ? '极度恐惧' : '恐惧';
    sentimentScore = Math.max(5, Math.floor(30 + avgChange * 10));
    description = `市场承压下行，${downCount}只股票下跌，平均跌幅${Math.abs(avgChange).toFixed(2)}%，避险情绪升温。`;
  } else if (Math.abs(avgChange) > 1.2 || (upRatio > 0.4 && upRatio < 0.6 && Math.abs(avgChange) > 0.5)) {
    marketType = '高波动';
    sentiment = avgChange > 0 ? '乐观' : '恐惧';
    sentimentScore = 25 + Math.floor(Math.min(Math.abs(avgChange) * 15, 35));
    description = '市场波动率显著上升，板块轮动加速，需控制仓位谨慎操作。';
  } else {
    marketType = '震荡整理';
    sentiment = '中性';
    sentimentScore = 40 + Math.floor(Math.min(Math.abs(upRatio - 0.5) * 40 + 10, 25));
    description = `市场处于横盘整理阶段，涨跌家数接近（${upCount}:${downCount}），多空双方力量均衡，等待方向选择。`;
  }

  return { marketType, sentiment, sentimentScore, description };
}

interface IndexData {
  name: string;
  code: string;
  current: string;
  change: string;
  up: boolean;
}

/** 使用腾讯API获取真实指数数据 */
async function fetchIndexDataFromAPI(): Promise<IndexData[]> {
  try {
    const res = await fetch('https://qt.gtimg.cn/q=sh000001,sz399006,sh000300,sh000688');
    if (!res.ok) throw new Error('指数API请求失败');
    const text = await res.text();

    // 解析腾讯API返回: v_sh000001="1~上证指数~000001~...~[32]涨跌幅%~..."
    const parseIndex = (code: string, prefix: string, name: string): IndexData => {
      const match = text.match(new RegExp(`v_${prefix}${code}="([^"]*)"`));
      if (!match) {
        // API失败时使用INDEX_DATA的base值回退
        const fallback = INDEX_DATA.find((i) => i.code === code);
        return { name, code, current: fallback?.base.toFixed(2) || '0', change: '0.00', up: true };
      }
      const parts = match[1].split('~');
      const changePercent = parseFloat(parts[32]) || 0;
      const currentPrice = parseFloat(parts[3]) || 0;
      return {
        name,
        code,
        current: currentPrice.toFixed(2),
        change: changePercent.toFixed(2),
        up: changePercent >= 0,
      };
    };

    return [
      parseIndex('000001', 'sh', '上证指数'),
      parseIndex('399006', 'sz', '创业板指'),
      parseIndex('000300', 'sh', '沪深300'),
      parseIndex('000688', 'sh', '科创50'),
    ];
  } catch {
    // API失败时回退到模拟数据
    const rng = seededRandom(DAY_SEED + 1);
    return INDEX_DATA.map((idx) => {
      const change = (rng() - 0.45) * 3.5;
      const current = idx.base * (1 + change / 100);
      return {
        name: idx.name,
        code: idx.code,
        current: current.toFixed(2),
        change: change.toFixed(2),
        up: change >= 0,
      };
    });
  }
}

function generateStockAdvice(seed: number, realDataMap?: Record<string, StockInfo>) {
  return STOCKS.map((stock, i) => {
    const s = seededRandom(seed + 100 + i);

    // 优先使用真实API数据
    const real = realDataMap?.[stock.code];
    if (real) {
      const change = real.changePercent;
      // 基于真实涨跌幅生成建议
      let advice: AdviceType;
      if (change > 2) advice = '买入';
      else if (change >= 0) advice = '持有';
      else if (change >= -2) advice = '观望';
      else advice = '减仓';
      const adviceIdx = Math.floor(s() * STRATEGY_ADVICE.length);

      return {
        ...stock,
        currentPrice: real.price.toFixed(2),
        change: change.toFixed(2),
        up: change >= 0,
        advice,
        adviceReason: `【实时行情】${STRATEGY_ADVICE[adviceIdx]} PE:${real.pe.toFixed(1)} PB:${real.pb.toFixed(1)} 市值:${(real.marketCap / 10000).toFixed(0)}亿`,
        support: real.low.toFixed(2),
        pressure: real.high.toFixed(2),
      };
    }

    // 回退到模拟数据
    const change = (s() - 0.48) * 5;
    const currentPrice = stock.basePrice * (1 + change / 100);

    const adviceRoll = s();
    let advice: AdviceType;
    if (adviceRoll < 0.25) advice = '买入';
    else if (adviceRoll < 0.5) advice = '持有';
    else if (adviceRoll < 0.75) advice = '观望';
    else advice = '减仓';

    const support = currentPrice * (1 - (s() * 0.03 + 0.01));
    const pressure = currentPrice * (1 + (s() * 0.03 + 0.01));
    const adviceIdx = Math.floor(s() * STRATEGY_ADVICE.length);

    return {
      ...stock,
      currentPrice: currentPrice.toFixed(2),
      change: change.toFixed(2),
      up: change >= 0,
      advice,
      adviceReason: `【模拟数据】${STRATEGY_ADVICE[adviceIdx]} 建议搜索该股获取实时行情`,
      support: support.toFixed(2),
      pressure: pressure.toFixed(2),
    };
  });
}

/* ──────────────────────── helpers ──────────────────────── */

function easeExpoOut() {
  return [0.16, 1, 0.3, 1] as [number, number, number, number];
}

function adviceColor(advice: AdviceType): string {
  switch (advice) {
    case '买入': return '#00FF94';
    case '持有': return '#D4AF37';
    case '观望': return '#CED1D5';
    case '减仓': return '#FF2A6D';
  }
}

function sentimentColor(sentiment: SentimentType): string {
  switch (sentiment) {
    case '贪婪': return '#00FF94';
    case '乐观': return '#4A6FA5';
    case '中性': return '#CED1D5';
    case '恐惧': return '#FF2A6D';
    case '极度恐惧': return '#FF2A6D';
  }
}

function marketIcon(type: MarketType) {
  switch (type) {
    case '趋势上涨': return <TrendingUp size={20} />;
    case '震荡整理': return <Minus size={20} />;
    case '趋势下跌': return <TrendingDown size={20} />;
    case '高波动': return <Activity size={20} />;
  }
}

function sentimentIcon(sentiment: SentimentType) {
  switch (sentiment) {
    case '贪婪': return <Sun size={18} />;
    case '乐观': return <Sun size={18} />;
    case '中性': return <Cloud size={18} />;
    case '恐惧': return <CloudRain size={18} />;
    case '极度恐惧': return <CloudRain size={18} />;
  }
}

/* ──────────────────────── sub-components ──────────────────────── */

function MarketStatusCard({ realDataMap }: { realDataMap: Record<string, StockInfo> }) {
  const [indexData, setIndexData] = useState<IndexData[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);

  const marketState = useMemo(() => generateMarketState(realDataMap), [realDataMap]);

  // 获取真实指数数据
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIndexLoading(true);
      const data = await fetchIndexDataFromAPI();
      if (!cancelled) {
        setIndexData(data);
        setIndexLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easeExpoOut() }}
      className="data-card"
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">今日市场状态</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">{DATE_STR}</span>
      </div>

      {/* Market type & sentiment */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
          style={{
            borderColor: `rgba(${marketState.marketType === '趋势上涨' ? '0,255,148' : marketState.marketType === '趋势下跌' ? '255,42,109' : '212,175,55'}, 0.3)`,
            backgroundColor: `rgba(${marketState.marketType === '趋势上涨' ? '0,255,148' : marketState.marketType === '趋势下跌' ? '255,42,109' : '212,175,55'}, 0.06)`,
            color: marketState.marketType === '趋势上涨' ? '#00FF94' : marketState.marketType === '趋势下跌' ? '#FF2A6D' : '#D4AF37',
          }}
        >
          {marketIcon(marketState.marketType)}
          <span className="font-mono text-[12px]">{marketState.marketType}</span>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
          style={{
            borderColor: `${sentimentColor(marketState.sentiment)}30`,
            backgroundColor: `${sentimentColor(marketState.sentiment)}10`,
            color: sentimentColor(marketState.sentiment),
          }}
        >
          {sentimentIcon(marketState.sentiment)}
          <span className="font-mono text-[12px]">{marketState.sentiment}</span>
        </div>
      </div>

      <p className="text-[13px] text-ash/60 mb-5 leading-relaxed">{marketState.description}</p>

      {/* Sentiment gauge */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <span className="font-mono text-[11px] text-ash/40">恐惧/贪婪指数</span>
          <span className="font-mono text-[14px] font-bold" style={{ color: sentimentColor(marketState.sentiment) }}>
            {marketState.sentimentScore}/100
          </span>
        </div>
        <div className="h-2 bg-[rgba(206,209,213,0.08)] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${marketState.sentimentScore}%` }}
            transition={{ duration: 1, delay: 0.3, ease: easeExpoOut() }}
            className="h-full rounded-full"
            style={{ backgroundColor: sentimentColor(marketState.sentiment) }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-[9px] text-ash/25">极度恐惧</span>
          <span className="font-mono text-[9px] text-ash/25">贪婪</span>
        </div>
      </div>

      {/* Index data */}
      <div className="grid grid-cols-2 gap-3">
        {indexLoading ? (
          <div className="col-span-2 flex items-center justify-center py-4">
            <Loader2 size={14} className="text-apex-green animate-spin mr-2" />
            <span className="font-mono text-[11px] text-ash/40">指数数据加载中...</span>
          </div>
        ) : (
          indexData.map((idx) => (
            <div
              key={idx.code}
              className="p-3 rounded border border-[rgba(206,209,213,0.06)] bg-[rgba(11,12,16,0.3)]"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] text-ash/50">{idx.name}</span>
                {idx.up ? <ArrowUp size={12} className="text-apex-green" /> : <ArrowDown size={12} className="text-reversion-red" />}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[14px] text-pure font-medium">{idx.current}</span>
                <span className={`font-mono text-[11px] ${idx.up ? 'text-apex-green' : 'text-reversion-red'}`}>
                  {idx.up ? '+' : ''}{idx.change}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function StockAdviceCard({
  stock,
  index,
  strategyMatch,
  matchStatus,
}: {
  stock: ReturnType<typeof generateStockAdvice>[0];
  index: number;
  strategyMatch?: StrategyMatch;
  matchStatus?: MatchStatus;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 * index, ease: easeExpoOut() }}
      className="data-card group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-heading text-[15px] text-pure">{stock.name}</h4>
            <span className="font-mono text-[10px] text-ash/35">{stock.code}</span>
            <span className="font-mono text-[10px] text-ash/30 px-1.5 py-0.5 rounded bg-[rgba(206,209,213,0.06)]">
              {stock.industry}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[18px] text-pure font-bold">¥{stock.currentPrice}</span>
            <span className={`font-mono text-[12px] ${stock.up ? 'text-apex-green' : 'text-reversion-red'}`}>
              {stock.up ? '+' : ''}{stock.change}%
            </span>
          </div>
        </div>
        <div
          className="px-3 py-1 rounded font-mono text-[12px] font-bold"
          style={{
            backgroundColor: `${adviceColor(stock.advice)}15`,
            color: adviceColor(stock.advice),
            border: `1px solid ${adviceColor(stock.advice)}30`,
          }}
        >
          {stock.advice}
        </div>
      </div>

      <div className="mb-3 p-2.5 rounded bg-[rgba(11,12,16,0.4)] border border-[rgba(206,209,213,0.05)]">
        <span className="font-mono text-[10px] text-ash/40 uppercase tracking-wider">策略建议</span>
        <p className="text-[12px] text-ash/70 mt-1 leading-relaxed">{stock.adviceReason}</p>
        {/* 策略匹配状态/结果 */}
        {(matchStatus && matchStatus !== 'idle') || strategyMatch ? (
          <div className="mt-2 pt-2 border-t border-[rgba(206,209,213,0.06)]">
            {matchStatus === 'loading' && (
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="text-apex-green animate-spin" />
                <span className="font-mono text-[10px] text-apex-green">策略匹配中...</span>
              </div>
            )}
            {matchStatus === 'no_kline' && (
              <span className="font-mono text-[10px] text-ash/30">
                历史K线暂不可用，策略匹配需K线数据支撑
              </span>
            )}
            {matchStatus === 'no_match' && (
              <span className="font-mono text-[10px] text-ash/30">
                未匹配到有效策略
              </span>
            )}
            {strategyMatch && (!matchStatus || matchStatus === 'matched') && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] text-apex-green uppercase tracking-wider">
                    {strategyMatch.isCustom ? '\u{1F3AF} 自定义策略' : '最佳匹配'}
                  </span>
                  <span className="font-mono text-[10px] text-gold-standard">{strategyMatch.name}</span>
                  <span className="font-mono text-[10px] text-ash/30">得分:{strategyMatch.score.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-ash/40">
                  <span>入场:{strategyMatch.entrySignals}</span>
                  <span>出场:{strategyMatch.exitSignals}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 font-mono text-[10px]">
                  <span className={strategyMatch.totalReturn >= 0 ? 'text-apex-green' : 'text-reversion-red'}>
                    回测收益:{strategyMatch.totalReturn >= 0 ? '+' : ''}{strategyMatch.totalReturn.toFixed(1)}%
                  </span>
                  <span className="text-ash/50">胜率:{strategyMatch.winRate.toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDown size={10} className="text-reversion-red" />
            <span className="font-mono text-[10px] text-ash/35">支撑</span>
          </div>
          <span className="font-mono text-[12px] text-reversion-red">¥{stock.support}</span>
        </div>
        <div className="w-px h-6 bg-[rgba(206,209,213,0.08)]" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUp size={10} className="text-apex-green" />
            <span className="font-mono text-[10px] text-ash/35">压力</span>
          </div>
          <span className="font-mono text-[12px] text-apex-green">¥{stock.pressure}</span>
        </div>
        <div className="w-px h-6 bg-[rgba(206,209,213,0.08)]" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Target size={10} className="text-gold-standard" />
            <span className="font-mono text-[10px] text-ash/35">基准</span>
          </div>
          <span className="font-mono text-[12px] text-ash/60">¥{stock.basePrice}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────── stock search component ──────────────────────── */

function StockSearchSection() {
  const { customStrategies } = useApp();
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<ReturnType<typeof generateStockAdvice>[0] | null>(null);
  const [searchStrategyMatch, setSearchStrategyMatch] = useState<StrategyMatch | null>(null);
  const [searchMatchStatus, setSearchMatchStatus] = useState<MatchStatus>('idle');
  const [isSearched, setIsSearched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiStock, setApiStock] = useState<StockInfo | null>(null);
  const [cachedCount, setCachedCount] = useState(0);

  // 显示本地缓存数量
  useEffect(() => {
    try {
      const db = JSON.parse(localStorage.getItem('stock_local_db') || '{}');
      setCachedCount(Object.keys(db).length);
    } catch { /* ignore */ }
  }, [isSearched]);

  const handleSearch = useCallback(async () => {
    setError('');
    setSearchResult(null);
    setSearchStrategyMatch(null);
    setSearchMatchStatus('loading');
    setApiStock(null);
    setIsSearched(false);

    const code = searchCode.trim();
    if (!code) {
      setError('请输入股票代码');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('请输入6位数字股票代码（如：600519）');
      return;
    }

    setLoading(true);

    try {
      // 第1步：尝试从API获取实时数据（同时会保存到本地库）
      const realData = await queryStock(code);

      if (realData) {
        // API获取成功！使用真实数据
        setApiStock(realData);

        // 生成策略建议
        const rng = seededRandom(DAY_SEED + hashDate(code));
        const changePct = realData.changePercent;
        const sup = realData.low;
        const prs = realData.high;
        // 基于真实涨跌幅给建议
        let adviceType: AdviceType;
        if (changePct > 3) adviceType = '减仓';
        else if (changePct > 1) adviceType = '持有';
        else if (changePct > -1) adviceType = '观望';
        else if (changePct > -3) adviceType = '买入';
        else adviceType = '买入';

        const adviceIdx = Math.floor(rng() * STRATEGY_ADVICE.length);

        setSearchResult({
          code: realData.code,
          name: realData.name,
          industry: realData.industry || '综合',
          basePrice: Math.round(realData.prevClose),
          currentPrice: realData.price.toFixed(2),
          change: changePct.toFixed(2),
          up: changePct >= 0,
          advice: adviceType,
          adviceReason: `【实时数据】${STRATEGY_ADVICE[adviceIdx]} 当前PE:${realData.pe.toFixed(1)} PB:${realData.pb.toFixed(1)} 市值:${(realData.marketCap / 10000).toFixed(0)}亿`,
          support: sup.toFixed(2),
          pressure: prs.toFixed(2),
        });
        // 真实策略匹配
        matchBestStrategy(realData.code, realData.price, customStrategies).then(r => {
          if (r.match) { setSearchStrategyMatch(r.match); setSearchMatchStatus('matched'); }
          else if (r.error === 'kline_fail') setSearchMatchStatus('no_kline');
          else setSearchMatchStatus('no_match');
        }).catch(() => setSearchMatchStatus('no_kline'));
        setIsSearched(true);
        setLoading(false);
        return;
      }

      // 第2步：API失败，尝试本地库
      const localData = getStockFromLocal(code);
      if (localData) {
        setApiStock(localData);
        const rng = seededRandom(DAY_SEED + hashDate(code));
        const changePct = localData.changePercent;
        let adviceType: AdviceType;
        if (changePct > 3) adviceType = '减仓';
        else if (changePct > 1) adviceType = '持有';
        else if (changePct > -1) adviceType = '观望';
        else adviceType = '买入';
        const adviceIdx = Math.floor(rng() * STRATEGY_ADVICE.length);

        setSearchResult({
          code: localData.code,
          name: localData.name,
          industry: localData.industry || '综合',
          basePrice: Math.round(localData.prevClose),
          currentPrice: localData.price.toFixed(2),
          change: changePct.toFixed(2),
          up: changePct >= 0,
          advice: adviceType,
          adviceReason: `【缓存数据】${STRATEGY_ADVICE[adviceIdx]}`,
          support: localData.low.toFixed(2),
          pressure: localData.high.toFixed(2),
        });
        // 真实策略匹配
        matchBestStrategy(localData.code, localData.price, customStrategies).then(r => {
          if (r.match) { setSearchStrategyMatch(r.match); setSearchMatchStatus('matched'); }
          else if (r.error === 'kline_fail') setSearchMatchStatus('no_kline');
          else setSearchMatchStatus('no_match');
        }).catch(() => setSearchMatchStatus('no_kline'));
        setIsSearched(true);
        setLoading(false);
        return;
      }

      // 第3步：本地库也没有，使用内置数据库或未知分析
      const known = STOCKS.find((s) => s.code === code);
      if (known) {
        const rng = seededRandom(DAY_SEED + hashDate(code));
        const changePct = (rng() - 0.45) * 5;
        const curPrice = known.basePrice * (1 + changePct / 100);
        const sup = curPrice * (1 - (rng() * 0.03 + 0.01));
        const prs = curPrice * (1 + (rng() * 0.03 + 0.01));
        const adviceIdx = Math.floor(rng() * STRATEGY_ADVICE.length);
        const adviceTypes: AdviceType[] = ['买入', '持有', '观望', '减仓'];
        const adviceType = adviceTypes[Math.floor(rng() * adviceTypes.length)];
        setSearchResult({
          ...known,
          currentPrice: curPrice.toFixed(2),
          change: changePct.toFixed(2),
          up: changePct >= 0,
          advice: adviceType,
          adviceReason: `【模拟数据】${STRATEGY_ADVICE[adviceIdx]} 实时API暂时不可用`,
          support: sup.toFixed(2),
          pressure: prs.toFixed(2),
        });
        // 模拟数据也尝试策略匹配
        matchBestStrategy(known.code, known.basePrice, customStrategies).then(r => {
          if (r.match) { setSearchStrategyMatch(r.match); setSearchMatchStatus('matched'); }
          else if (r.error === 'kline_fail') setSearchMatchStatus('no_kline');
          else setSearchMatchStatus('no_match');
        }).catch(() => setSearchMatchStatus('no_kline'));
      } else {
        const unknown = await analyzeUnknownStock(code, DAY_SEED);
        setSearchResult({
          code: unknown.code,
          name: unknown.name,
          industry: unknown.industry,
          basePrice: Math.round(unknown.price),
          currentPrice: unknown.price.toFixed(2),
          change: unknown.changePct.toFixed(2),
          up: unknown.changePct >= 0,
          advice: unknown.advice as AdviceType,
          adviceReason: `【推断数据】${unknown.reason} 建议将该股加入自选以获取实时数据`,
          support: unknown.support.toFixed(2),
          pressure: unknown.pressure.toFixed(2),
        });
        // 未知股票也尝试策略匹配
        matchBestStrategy(code, unknown.price, customStrategies).then(r => {
          if (r.match) { setSearchStrategyMatch(r.match); setSearchMatchStatus('matched'); }
          else if (r.error === 'kline_fail') setSearchMatchStatus('no_kline');
          else setSearchMatchStatus('no_match');
        }).catch(() => setSearchMatchStatus('no_kline'));
      }
      setIsSearched(true);
    } catch {
      setError('查询失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, [searchCode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearSearch = () => {
    setSearchCode('');
    setSearchResult(null);
    setSearchStrategyMatch(null);
    setSearchMatchStatus('idle');
    setIsSearched(false);
    setError('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easeExpoOut() }}
      className="data-card mb-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Search size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">股票代码查询</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">支持150+只热门股票及任意A股</span>
      </div>

      {/* Search Input */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="flex items-center px-4 py-3 bg-deep-space/60 border border-[rgba(206,209,213,0.12)] rounded hover:border-apex-green/40 transition-colors">
            <Search size={14} className="text-ash/40 mr-2 shrink-0" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              placeholder="输入6位股票代码（如：600519）"
              className="w-full bg-transparent font-mono text-sm text-pure outline-none placeholder:text-ash/30"
            />
            {searchCode && (
              <button onClick={clearSearch} className="ml-2 text-ash/40 hover:text-ash/70">
                <X size={14} />
              </button>
            )}
          </div>
          {error && <p className="mt-1.5 font-mono text-[11px] text-reversion-red">{error}</p>}
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-apex-green text-void font-mono text-sm font-bold uppercase tracking-wider rounded hover:shadow-glow-green transition-all duration-300 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} className="group-hover:scale-110 transition-transform" />
          )}
          {loading ? '查询中...' : '查询策略'}
        </button>
      </div>

      {/* Quick Select Chips */}
      <div className="flex flex-wrap gap-2 mt-4">
        <span className="font-mono text-[10px] text-ash/30 mr-1">热门:</span>
        {STOCKS.slice(0, 20).map((s) => (
          <button
            key={s.code}
            onClick={() => { setSearchCode(s.code); setError(''); }}
            className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
              searchCode === s.code
                ? 'border-apex-green/40 text-apex-green bg-[rgba(0,255,148,0.06)]'
                : 'border-[rgba(206,209,213,0.08)] text-ash/50 hover:border-[rgba(206,209,213,0.2)] hover:text-ash/70'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Search Result */}
      <AnimatePresence>
        {isSearched && searchResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: easeExpoOut() }}
          >
            <div className="mt-5 pt-5 border-t border-[rgba(206,209,213,0.08)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChevronRight size={14} className="text-apex-green" />
                  <span className="font-mono text-[11px] text-ash/40">查询结果</span>
                  {apiStock && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-apex-green/10 text-apex-green">
                      实时数据
                    </span>
                  )}
                </div>
                {cachedCount > 0 && (
                  <span className="font-mono text-[10px] text-ash/30">
                    本地库已缓存{cachedCount}只股票
                  </span>
                )}
              </div>
              <StockAdviceCard
                stock={searchResult}
                index={0}
                strategyMatch={searchStrategyMatch || undefined}
                matchStatus={searchMatchStatus}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </motion.div>
  );
}

/* ──────────────────────── sector heatmap card ──────────────────────── */

function SectorHeatmapCard({ sectorHeatmap }: { sectorHeatmap: { upSectors: SectorItem_real[]; downSectors: SectorItem_real[] } | null }) {
  // 使用东方财富API获取的全市场行业板块数据
  const upSectors = sectorHeatmap?.upSectors || [];
  const downSectors = sectorHeatmap?.downSectors || [];
  const hasData = upSectors.length > 0 || downSectors.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: easeExpoOut() }}
      className="data-card h-full flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-gold-standard" />
        <h3 className="font-heading text-lg text-pure">板块热点追踪</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">SECTOR_MAP</span>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 size={14} className="text-ash/30 animate-spin" />
          <span className="font-mono text-[11px] text-ash/30">板块数据加载中...</span>
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          <p className="font-mono text-[11px] text-ash/40 mb-1 flex items-center gap-1">
            <TrendingUp size={10} className="text-apex-green" /> 领涨（全市场行业）
          </p>
          {upSectors.map((s) => (
            <div key={s.name} className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-pure font-medium">{s.name}</span>
              <span className="font-mono text-[13px] text-apex-green">+{s.changePercent.toFixed(2)}%</span>
            </div>
          ))}
          <p className="font-mono text-[11px] text-ash/40 mt-3 mb-1 flex items-center gap-1">
            <TrendingDown size={10} className="text-reversion-red" /> 领跌（全市场行业）
          </p>
          {downSectors.map((s) => (
            <div key={s.name} className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-pure font-medium">{s.name}</span>
              <span className="font-mono text-[13px] text-reversion-red">{s.changePercent.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ──────────────────────── capital flow card ──────────────────────── */

function CapitalFlowCard({ marketFlow }: { marketFlow: MarketFlow | null }) {
  // 即使 marketFlow 为null，也渲染正常卡片结构（数据会通过fallback填充）
  const {
    totalTurnover = 0, shTurnover = 0, szTurnover = 0,
    upCount = 0, downCount = 0, flatCount = 0,
    limitUpCount = 0, limitDownCount = 0,
    mainFlow = 0,
  } = marketFlow || {};
  const mainFlowStr = Math.abs(mainFlow).toFixed(1);
  const mainFlowColor = mainFlow >= 0 ? '#00FF94' : '#FF2A6D';
  const totalCount = upCount + downCount + flatCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: easeExpoOut() }}
      className="data-card h-full flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">资金流向</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">CAPITAL_FLOW</span>
      </div>
      <div className="space-y-3 flex-1">
        {/* 主力净流入 */}
        <div>
          <p className="font-mono text-[11px] text-ash/40 mb-1">主力净流入（全市场）</p>
          <p
            className="font-heading text-3xl font-bold"
            style={{ color: mainFlowColor }}
          >
            {mainFlow >= 0 ? '+' : '-'}{mainFlowStr}亿
          </p>
          <div className="h-1 mt-2 bg-ash/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(parseFloat(mainFlowStr) * 2, 100)}%`,
                backgroundColor: mainFlowColor,
              }}
            />
          </div>
        </div>

        {/* 两市成交额 */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ash/50">两市成交额</span>
            <span className="font-mono text-[14px] text-pure font-medium">{totalTurnover.toFixed(1)}亿</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ash/50">上证成交额</span>
            <span className="font-mono text-[13px] text-ash/70">{shTurnover.toFixed(1)}亿</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ash/50">深证成交额</span>
            <span className="font-mono text-[13px] text-ash/70">{szTurnover.toFixed(1)}亿</span>
          </div>
        </div>

        {/* 涨跌家数 + 涨跌停 */}
        <div className="pt-1 space-y-2 border-t border-ash/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ash/50">上涨家数</span>
            <span className="font-mono text-[14px] text-apex-green font-medium">{upCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ash/50">下跌家数</span>
            <span className="font-mono text-[14px] text-reversion-red font-medium">{downCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ash/50">平盘家数</span>
            <span className="font-mono text-[13px] text-ash/50 font-medium">{flatCount}</span>
          </div>
          {/* 涨跌停 */}
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,255,148,0.1)', color: '#00FF94' }}>
              涨停 {limitUpCount}
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,42,109,0.1)', color: '#FF2A6D' }}>
              跌停 {limitDownCount}
            </span>
            <span className="font-mono text-[10px] text-ash/30 ml-auto">
              总计 {totalCount}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────── heat top10 card ──────────────────────── */

function HeatTop10Card({ heatTop10 }: { heatTop10: HeatItem[] | null }) {
  const hasData = (heatTop10?.length ?? 0) > 0;

  // 成交额条宽度：相对于第1名的比例
  const maxTurnover = heatTop10?.[0]?.turnover || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.25, ease: easeExpoOut() }}
      className="data-card h-full flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-apex-green" />
        <h3 className="font-heading text-lg text-pure">热度榜单</h3>
        <span className="font-mono text-[10px] text-ash/40 ml-2">HEAT_TOP10</span>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 size={14} className="text-ash/30 animate-spin" />
          <span className="font-mono text-[11px] text-ash/30">热度数据加载中...</span>
        </div>
      ) : (
        <div className="space-y-2.5 flex-1">
          <p className="font-mono text-[11px] text-ash/40 mb-1">成交额 TOP10（全市场）</p>
          {heatTop10!.map((s, i) => (
            <div key={s.code} className="flex items-center gap-2">
              {/* 排名 */}
              <span className={`font-mono text-[11px] w-5 text-center ${
                i === 0 ? 'text-gold-standard font-bold' :
                i === 1 ? 'text-ash/60 font-bold' :
                i === 2 ? 'text-ash/40 font-bold' :
                'text-ash/30'
              }`}>
                {i + 1}
              </span>
              {/* 名称 */}
              <span className="font-mono text-[12px] text-pure flex-1 truncate" title={s.code}>{s.name}</span>
              {/* 涨跌幅 */}
              <span className={`font-mono text-[11px] font-medium w-14 text-right ${
                s.changePercent >= 0 ? 'text-apex-green' : 'text-reversion-red'
              }`}>
                {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
              </span>
              {/* 成交额条 */}
              <div className="w-16 h-1.5 bg-ash/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((s.turnover / maxTurnover) * 100, 5)}%`,
                    backgroundColor: s.changePercent >= 0 ? '#00FF94' : '#FF2A6D',
                    opacity: 0.6,
                  }}
                />
              </div>
              {/* 成交额数值 */}
              <span className="font-mono text-[10px] text-ash/40 w-12 text-right">{s.turnover.toFixed(1)}亿</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ──────────────────────── main page ──────────────────────── */

export default function TodayStrategy() {
  const { customStrategies } = useApp();

  // 存储API获取的真实行情数据 {code: StockInfo}
  const [realDataMap, setRealDataMap] = useState<Record<string, StockInfo>>({});
  const [apiLoading, setApiLoading] = useState(true);
  // 全市场资金流向
  const [marketFlow, setMarketFlow] = useState<MarketFlow | null>(null);
  // 全市场成交额热度榜TOP10（东方财富API）
  const [heatTop10, setHeatTop10] = useState<HeatItem[] | null>(null);
  // 全市场板块热点（东方财富API）
  const [sectorHeatmap, setSectorHeatmap] = useState<{ upSectors: SectorItem_real[]; downSectors: SectorItem_real[] } | null>(null);

  // 页面加载时，批量获取：精选股票行情 + 全市场资金流向 + 全市场龙虎榜 + 全市场板块热点
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setApiLoading(true);

      const codes = STOCKS.map((s) => s.code);

      // 独立获取每个API，避免一个失败影响全部
      const map = await queryStocks(codes).catch(() => ({} as Record<string, StockInfo>));
      const flow = await fetchMarketFlow().catch(() => null);
      const heat = await fetchMarketHeatTop10().catch(() => null);
      const sh = await fetchSectorHeatmap().catch(() => null);

      if (!cancelled) {
        setRealDataMap(map || {});
        setMarketFlow(flow);
        if (heat) setHeatTop10(heat);
        if (sh) setSectorHeatmap(sh);
        setApiLoading(false);
      }
    }

    fetchAll();
    // 交易时间段1分钟刷新
    const interval = setInterval(() => {
      if (isTradingTime()) fetchAll();
    }, 60000);
    return () => { clearInterval(interval); cancelled = true; };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-void pt-16">
      {/* API加载状态指示器 */}
      {apiLoading && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-deep-space/90 border border-apex-green/20 rounded">
          <Loader2 size={12} className="text-apex-green animate-spin" />
          <span className="font-mono text-[10px] text-apex-green">
            实时行情加载中... {Object.keys(realDataMap).length}/{STOCKS.length}
          </span>
        </div>
      )}
      {/* Hero */}
      <section className="relative bg-void border-b border-[rgba(206,209,213,0.08)]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeExpoOut() }}
          >
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-heading text-h2 text-pure">今日策略</h1>
              <span className="font-mono text-[11px] text-ash/40 px-2 py-0.5 rounded border border-[rgba(206,209,213,0.1)]">
                {DATE_STR}
              </span>
            </div>
            <p className="font-mono text-caption text-ash/60 mb-8">
              TODAY_STRATEGY v2.0 — 基于市场状态与技术指标的每日操作建议
            </p>
          </motion.div>

          {/* Stock Search */}
          <div className="mb-6">
            <StockSearchSection />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Column 1: Market Status */}
            <div>
              <MarketStatusCard realDataMap={realDataMap} />
            </div>

            {/* Column 2: Sector Heatmap（全市场行业板块数据） */}
            <SectorHeatmapCard sectorHeatmap={sectorHeatmap} />

            {/* Column 3: Capital Flow */}
            <CapitalFlowCard marketFlow={marketFlow} />

            {/* Column 4: 全市场成交额热度榜TOP10 */}
            <HeatTop10Card heatTop10={heatTop10} />
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-void py-8 border-t border-[rgba(206,209,213,0.06)]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="flex items-start gap-2"
          >
            <Activity size={12} className="text-ash/20 mt-0.5 shrink-0" />
            <p className="font-mono text-[10px] text-ash/25 leading-relaxed">
              以上建议基于模拟数据和技术指标生成，仅供学习参考，不构成任何投资建议。股市有风险，投资需谨慎。
              策略匹配结果通过回测引擎对历史K线数据运行评分得出，过往表现不代表未来收益。
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}