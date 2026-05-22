/* ═══════════════════════════════════════════════════════════════
   Market State Engine — 市场状态判别引擎
   基于研究报告"三阶段模型"+"三维异动监测体系"实现

   三阶段模型:
   - IMPACT(冲击期): 波动率急升, 资金全线流出, 量缩价跌
   - REPRICE(重新定价期): 波动率见顶回落, 量能恢复, 分化初现
   - ROTATE(轮动期): 指数企稳, 结构性行情, 强势板块独立走强

   三维监测:
   - 波动率共振: 已实现波动率(Parkinson/Garman-Klass) + OVX(不可用)
   - 流动性骤变: 资金流向 + 成交量异常 + 换手率
   - 跨资产验证: 股债跷跷板(真实计算) + 黄金美元联动 + 原油权益负相关(真实计算)

   数据来源标识:
   - REAL_API: 从真实API获取
   - REAL_CALCULATED: 基于真实K线数据科学计算
   - ESTIMATED_FROM_PRICE: 基于价格粗略估算（fallback）
   - NEED_EXTERNAL_DATA: 需外部数据源，当前无法获取
   - NOT_AVAILABLE: A股无此数据产品
   ═══════════════════════════════════════════════════════════════ */

import { fetchMarketFlow } from './marketFlow';
import {
  calculateVolatility,
  calculateVolatilityMovingAverage,
  type OHLC,
} from './volatilityCalculator';

export type MarketPhase = 'IMPACT' | 'REPRICE' | 'ROTATE' | 'NORMAL';
export type AlertLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

/** 数据来源标识 */
export type DataSourceTag =
  | 'REAL_API'
  | 'REAL_CALCULATED'
  | 'ESTIMATED_FROM_PRICE'
  | 'NEED_EXTERNAL_DATA'
  | 'NOT_AVAILABLE';

export interface MarketState {
  phase: MarketPhase;
  alertLevel: AlertLevel;
  /** @deprecated 请使用 estimatedVolIndex */
  vix: number;
  /** 波动率情绪指数：由Garman-Klass/Parkinson波动率科学计算 */
  estimatedVolIndex: number;
  /** OVX原油波动率：A股无此数据，始终为null */
  ovx: number | null;
  correlationSpike: boolean;
  liquidityStress: boolean;
  crossAssetStress: boolean;
  description: string;
  timestamp: string;
  /** 各字段数据来源标识 */
  dataSource: {
    volIndex: DataSourceTag;
    volIndexMethod: 'Garman-Klass' | 'Parkinson' | 'Close-to-Close' | 'none';
    ovx: DataSourceTag;
    northFlow: DataSourceTag;
    mainForceFlow: DataSourceTag;
    turnoverRatio: DataSourceTag;
    stockBondCorrelation: DataSourceTag;
    goldUsdDirection: DataSourceTag;
    oilEquityCorrelation: DataSourceTag;
  };
}

export interface VolatilityMetrics {
  estimatedVolIndex: number; // 由科学方法计算的波动率指数
  ovx: number | null;        // OVX原油波动率（A股无此数据）
  vix5dAvg: number;          // estimatedVolIndex 5日均值
  vixChange: number;         // estimatedVolIndex日变化率
  ovxVixSpread: number | null; // OVX-VIX利差（OVX不可用时为null）
}

export interface LiquidityMetrics {
  northFlow: number;     // 北向资金净流入(亿元) — 从marketFlow.ts获取
  mainForceFlow: number; // 主力资金净流入(亿元) — 从marketFlow.ts获取
  turnoverRatio: number; // 成交额/5日均值-1
  weightedTurnover: number; // 加权换手率(百分位)
}

export interface CrossAssetMetrics {
  /** 股债相关性：基于上证指数与国债期货30日价格计算 */
  stockBondCorrelation: number | null;
  /** 黄金美元关系：A股无直接美元指数数据 */
  goldUsdDirection: 'SAME' | 'OPPOSITE' | null;
  /** 原油权益相关性：基于原油期货与上证指数30日价格计算 */
  oilEquityCorrelation: number | null;
}

// ─── 阈值常量 ───
const VIX_YELLOW = 25;
const VIX_ORANGE = 35;
const VIX_RED = 50;
const VIX_CRISIS = 70;

const TURNOVER_RED = 0.50;     // 成交额异动率50%

const NORTH_FLOW_YELLOW = -50; // 北向净流出50亿
const MAIN_FORCE_YELLOW = -80; // 主力净流出80亿

/** 期货代码前缀映射（腾讯K线API格式） */
const FUTURES_PREFIX_MAP: Record<string, string> = {
  // 中金所 CFFEX
  T: 'cc',   // 10年期国债期货
  TF: 'cc',  // 5年期国债期货
  TS: 'cc',  // 2年期国债期货
  TL: 'cc',  // 30年期国债期货
  IF: 'cc',  // 沪深300股指期货
  IC: 'cc',  // 中证500股指期货
  IM: 'cc',  // 中证1000股指期货
  IH: 'cc',  // 上证50股指期货
  // 上期所 SHFE
  AU: 'sh',  // 黄金期货
  AG: 'sh',  // 白银期货
  CU: 'sh',  // 铜期货
  AL: 'sh',  // 铝期货
  SC: 'sh',  // 原油期货 (INE实际上海能源)
  RU: 'sh',  // 天然橡胶
  // 大商所 DCE
  I: 'dl',   // 铁矿石
  M: 'dl',   // 豆粕
  // 郑商所 CZCE
  CF: 'zz',  // 棉花
  MA: 'zz',  // 甲醇
};

// ─── 波动率计算工具函数 ───

/**
 * 从K线数据科学计算"中国版波动率指数"
 *
 * 优先级：Garman-Klass > Parkinson > Close-to-Close
 * Garman-Klass使用OHLC四个价格，是最高效的已实现波动率估计方法。
 *
 * @param klines 包含open/high/low/close的K线数据
 * @returns 年化波动率（百分比，如25表示25%），数据不足返回null
 */
export function calculateChinaVolIndex(klines: OHLC[]): number | null {
  const result = calculateVolatility(klines);
  return result ? result.recommended : null;
}

// ─── 核心判别函数 ───

/**
 * 判别市场三阶段状态
 * 基于波动率走势+成交量+板块分化度综合判断
 */
export function detectMarketPhase(
  vix: number,
  vix5dAvg: number,
  vix20dAvg: number,
  _turnoverRatio: number,
  sectorDispersion: number, // 板块涨跌幅标准差
): MarketPhase {
  // VIX从高位回落 = 重新定价期或轮动期
  if (vix > VIX_RED && vix < vix5dAvg * 0.9) {
    return sectorDispersion > 2.0 ? 'ROTATE' : 'REPRICE';
  }
  // VIX急升 = 冲击期
  if (vix > vix20dAvg * 1.5 || vix > VIX_ORANGE) {
    return 'IMPACT';
  }
  // VIX中等但分化大 = 轮动期
  if (vix < VIX_ORANGE && sectorDispersion > 1.5) {
    return 'ROTATE';
  }
  // VIX回落+分化 = 重新定价期
  if (vix < vix5dAvg * 0.8 && sectorDispersion > 1.0) {
    return 'REPRICE';
  }
  return 'NORMAL';
}

/**
 * 三维异动综合评分 (0-100)
 */
export function calculateStressScore(
  vol: VolatilityMetrics,
  liq: LiquidityMetrics,
  cross: CrossAssetMetrics,
): number {
  // 波动率维度 (0-40分) — 使用 estimatedVolIndex 替代 VIX
  let volScore = 0;
  if (vol.estimatedVolIndex > VIX_CRISIS) volScore = 40;
  else if (vol.estimatedVolIndex > VIX_RED) volScore = 35;
  else if (vol.estimatedVolIndex > VIX_ORANGE) volScore = 25;
  else if (vol.estimatedVolIndex > VIX_YELLOW) volScore = 15;
  // OVX-VIX共振加成（OVX不可用时跳过）
  if (vol.ovxVixSpread !== null && vol.ovxVixSpread > 10 && vol.estimatedVolIndex > VIX_YELLOW) volScore += 5;

  // 流动性维度 (0-35分)
  let liqScore = 0;
  if (liq.mainForceFlow < -200) liqScore = 35;
  else if (liq.mainForceFlow < -100) liqScore = 25;
  else if (liq.mainForceFlow < MAIN_FORCE_YELLOW) liqScore = 15;
  if (liq.turnoverRatio > TURNOVER_RED) liqScore += 5;
  if (liq.northFlow < NORTH_FLOW_YELLOW) liqScore += 5;

  // 跨资产维度 (0-25分) — 优先使用真实计算数据
  let crossScore = 0;
  if (cross.stockBondCorrelation !== null) {
    if (cross.stockBondCorrelation > 0) crossScore = 25; // 股债同跌=流动性危机
    else if (cross.stockBondCorrelation > -0.3) crossScore = 15;
  } else {
    // 无数据时保守估算（降低权重，不给强信号）
    crossScore = 5;
  }
  if (cross.goldUsdDirection === 'SAME') crossScore += 5;
  if (cross.oilEquityCorrelation !== null && cross.oilEquityCorrelation < -0.7) crossScore += 5;

  return Math.min(100, volScore + liqScore + crossScore);
}

/**
 * 综合市场状态判别
 */
export function assessMarketState(
  vol: VolatilityMetrics,
  liq: LiquidityMetrics,
  cross: CrossAssetMetrics,
  sectorDispersion: number,
  dataSource?: Partial<MarketState['dataSource']>,
): MarketState {
  const phase = detectMarketPhase(vol.estimatedVolIndex, vol.vix5dAvg, vol.estimatedVolIndex * 1.2, liq.turnoverRatio, sectorDispersion);
  const stressScore = calculateStressScore(vol, liq, cross);

  let alertLevel: AlertLevel = 'GREEN';
  if (stressScore >= 75) alertLevel = 'RED';
  else if (stressScore >= 50) alertLevel = 'ORANGE';
  else if (stressScore >= 25) alertLevel = 'YELLOW';

  const phaseDesc: Record<MarketPhase, string> = {
    NORMAL: '市场正常运行，无显著异动',
    IMPACT: '【冲击期】地缘冲突冲击，资金无差别避险，波动率急升',
    REPRICE: '【重新定价期】恐慌消退，资产精准迁移，结构性行情萌芽',
    ROTATE: '【轮动期】结构性行情展开，强势板块独立走强',
  };

  const defaultSource: MarketState['dataSource'] = {
    volIndex: 'REAL_CALCULATED',
    volIndexMethod: 'Garman-Klass',
    ovx: 'NOT_AVAILABLE',
    northFlow: 'NOT_AVAILABLE',
    mainForceFlow: 'ESTIMATED_FROM_PRICE',
    turnoverRatio: 'ESTIMATED_FROM_PRICE',
    stockBondCorrelation: 'NEED_EXTERNAL_DATA',
    goldUsdDirection: 'NEED_EXTERNAL_DATA',
    oilEquityCorrelation: 'NEED_EXTERNAL_DATA',
  };

  return {
    phase,
    alertLevel,
    vix: vol.estimatedVolIndex, // 保持向后兼容
    estimatedVolIndex: vol.estimatedVolIndex,
    ovx: vol.ovx, // A股无OVX数据，应为null
    correlationSpike: vol.ovxVixSpread !== null && vol.ovxVixSpread > 10,
    liquidityStress: liq.mainForceFlow < MAIN_FORCE_YELLOW || liq.turnoverRatio > TURNOVER_RED,
    crossAssetStress: (cross.stockBondCorrelation !== null && cross.stockBondCorrelation > 0),
    description: phaseDesc[phase],
    timestamp: new Date().toISOString(),
    dataSource: { ...defaultSource, ...dataSource },
  };
}

// ─── 期货数据获取 ───

/**
 * 解析期货代码获取腾讯K线API前缀
 *
 * @param code 期货代码，如'T2509'（国债期货）、'AU2506'（沪金）
 * @returns API前缀，如'cc'、'sh'等
 */
function resolveFuturesPrefix(code: string): string | null {
  // 提取品种字母部分（去除数字年份月份）
  const match = code.match(/^([A-Za-z]+)/);
  if (!match) return null;

  const product = match[1].toUpperCase();
  return FUTURES_PREFIX_MAP[product] ?? null;
}

/**
 * 获取期货历史K线数据
 *
 * 使用腾讯K线API获取期货历史价格，用于计算跨资产相关性。
 * 支持的期货品种包括国债期货(T)、黄金(AU)、原油(SC)等。
 *
 * @param code 期货代码，如'T2509'（10年期国债期货）、'AU2506'（沪金期货）
 * @param days 历史天数（默认30天）
 * @returns K线数据数组 {date, close}，获取失败返回空数组
 *
 * @example
 * ```typescript
 * const tBondKLines = await fetchFuturesKLines('T2509', 30);
 * const goldKLines = await fetchFuturesKLines('AU2506', 30);
 * ```
 */
export async function fetchFuturesKLines(
  code: string,
  days = 30,
): Promise<Array<{ date: string; close: number; open: number; high: number; low: number }>> {
  const prefix = resolveFuturesPrefix(code);
  if (!prefix) {
    console.warn(`[FuturesKLines] 无法识别期货品种前缀: ${code}`);
    return [];
  }

  // 计算日期范围
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000 * 2); // *2 补偿周末节假日
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

  const limit = Math.max(days * 2, 100);

  // 尝试多个可能的API格式
  const urlsToTry = [
    // 标准格式
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${prefix}${code},day,${startStr},${endStr},${limit},qfq`,
    // 无qfq后缀格式
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${prefix}${code},day,${startStr},${endStr},${limit}`,
  ];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const json = await res.json();

      // 尝试多个可能的数据路径
      const dataKey = `${prefix}${code}`;
      let dayArr: string[][] | null = null;

      if (json?.data?.[dataKey]?.qfqday) {
        dayArr = json.data[dataKey].qfqday;
      } else if (json?.data?.[dataKey]?.day) {
        dayArr = json.data[dataKey].day;
      } else if (json?.[dataKey]?.day) {
        dayArr = json[dataKey].day;
      }

      if (!Array.isArray(dayArr) || dayArr.length === 0) continue;

      const result = dayArr
        .map((item: string[]) => {
          if (!Array.isArray(item) || item.length < 5) return null;
          return {
            date: item[0],
            open: parseFloat(item[1]) || 0,
            close: parseFloat(item[2]) || 0,
            high: parseFloat(item[3]) || 0,
            low: parseFloat(item[4]) || 0,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null && item.close > 0);

      if (result.length > 0) {
        return result;
      }
    } catch {
      // 继续尝试下一个URL
    }
  }

  console.warn(`[FuturesKLines] ❌ ${code} 所有API格式尝试失败`);
  return [];
}

// ─── 统计计算工具 ───

/**
 * 计算皮尔逊相关系数 (Pearson Correlation Coefficient)
 *
 * 衡量两组数据的线性相关程度，范围[-1, 1]：
 * - +1 表示完全正相关
 * - -1 表示完全负相关
 * - 0 表示无线性相关
 *
 * 用于计算股债相关性、原油权益相关性等跨资产关系。
 *
 * @param x 第一组数据（如股指日收益率）
 * @param y 第二组数据（如国债期货日收益率）
 * @returns 皮尔逊相关系数，数据不足或计算失败返回null
 */
export function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (!x || !y || x.length !== y.length || x.length < 3) return null;

  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let validCount = 0;

  for (let i = 0; i < n; i++) {
    if (!isFinite(x[i]) || !isFinite(y[i])) continue;
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
    validCount++;
  }

  if (validCount < 3) return null;

  const numerator = validCount * sumXY - sumX * sumY;
  const denominator = Math.sqrt((validCount * sumX2 - sumX * sumX) * (validCount * sumY2 - sumY * sumY));

  if (denominator === 0 || !isFinite(denominator)) return null;

  const r = numerator / denominator;

  // 限制在[-1, 1]范围内（防止浮点误差）
  return Math.max(-1, Math.min(1, r));
}

/**
 * 从价格序列计算日收益率序列（对数收益率）
 *
 * @param prices 价格数组
 * @returns 日对数收益率数组（长度比价格少1）
 */
function calculateLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

/**
 * 计算两组K线数据的日收益率相关系数
 *
 * @param seriesA 第一组K线 {date, close}[]
 * @param seriesB 第二组K线 {date, close}[]
 * @returns 皮尔逊相关系数，数据不足返回null
 */
function correlationFromKLines(
  seriesA: Array<{ date: string; close: number }>,
  seriesB: Array<{ date: string; close: number }>,
): number | null {
  // 按日期对齐
  const closeMapA = new Map(seriesA.map((k) => [k.date, k.close]));
  const alignedPricesA: number[] = [];
  const alignedPricesB: number[] = [];

  for (const bar of seriesB) {
    const closeA = closeMapA.get(bar.date);
    if (closeA !== undefined && closeA > 0 && bar.close > 0) {
      alignedPricesA.push(closeA);
      alignedPricesB.push(bar.close);
    }
  }

  if (alignedPricesA.length < 5) return null;

  const returnsA = calculateLogReturns(alignedPricesA);
  const returnsB = calculateLogReturns(alignedPricesB);

  if (returnsA.length !== returnsB.length || returnsA.length < 3) return null;

  return pearsonCorrelation(returnsA, returnsB);
}

// ─── 跨资产相关性计算 ───

/**
 * 计算股债相关性（上证指数 vs 10年期国债期货）
 *
 * 通过获取上证指数和国债期货(T)的30日历史价格，
 * 计算日收益率的皮尔逊相关系数。
 *
 * 正常市场环境下应为负相关（股债跷跷板效应），
 * 若转为正相关则表明流动性危机。
 *
 * @returns 相关系数[-1,1]或null（获取数据失败时）
 */
async function calculateStockBondCorrelation(): Promise<number | null> {
  try {
    // 获取上证指数K线
    const indexKLines = await fetchFuturesKLines('sh000001', 35);
    if (indexKLines.length < 10) {
      console.warn('[StockBondCorr] 上证指数数据不足');
      return null;
    }

    // 获取10年期国债期货K线（尝试当前主力合约月份）
    const now = new Date();
    const year = now.getFullYear() % 100;
    const months = ['03', '06', '09', '12'];
    let tBondKLines: Array<{ date: string; close: number }> = [];

    // 尝试近4个合约月份
    for (const month of months) {
      const code = `T${year}${month}`;
      tBondKLines = await fetchFuturesKLines(code, 35);
      if (tBondKLines.length >= 10) break;
    }

    // 如果当前年份的合约都失败，尝试上一年
    if (tBondKLines.length < 10) {
      for (const month of months) {
        const code = `T${year - 1}${month}`;
        tBondKLines = await fetchFuturesKLines(code, 35);
        if (tBondKLines.length >= 10) break;
      }
    }

    if (tBondKLines.length < 10) {
      console.warn('[StockBondCorr] 国债期货数据不足');
      return null;
    }

    const corr = correlationFromKLines(indexKLines, tBondKLines);
    if (corr !== null) {
    }
    return corr;
  } catch (err) {
    console.warn('[StockBondCorr] 计算失败:', err);
    return null;
  }
}

/**
 * 计算原油权益相关性（上证指数 vs 原油期货）
 *
 * 通过获取上证指数和原油期货(SC)的30日历史价格，
 * 计算日收益率的皮尔逊相关系数。
 *
 * 正常市场环境下原油与权益市场通常为负相关
 *（避险模式下同跌可能导致正相关）。
 *
 * @returns 相关系数[-1,1]或null（获取数据失败时）
 */
async function calculateOilEquityCorrelation(): Promise<number | null> {
  try {
    // 获取上证指数K线
    const indexKLines = await fetchFuturesKLines('sh000001', 35);
    if (indexKLines.length < 10) {
      console.warn('[OilEquityCorr] 上证指数数据不足');
      return null;
    }

    // 获取原油期货K线（INE上海原油，代码如SC2507）
    const now = new Date();
    const year = now.getFullYear() % 100;
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    let oilKLines: Array<{ date: string; close: number }> = [];

    // 尝试近6个月合约
    const startIdx = now.getMonth();
    for (let i = 0; i < 6; i++) {
      const monthIdx = (startIdx + i) % 12;
      const code = `SC${year}${months[monthIdx]}`;
      oilKLines = await fetchFuturesKLines(code, 35);
      if (oilKLines.length >= 10) break;

      // 尝试下一年
      const codeNext = `SC${year + 1}${months[monthIdx]}`;
      oilKLines = await fetchFuturesKLines(codeNext, 35);
      if (oilKLines.length >= 10) break;
    }

    if (oilKLines.length < 10) {
      console.warn('[OilEquityCorr] 原油期货数据不足');
      return null;
    }

    const corr = correlationFromKLines(indexKLines, oilKLines);
    if (corr !== null) {
    }
    return corr;
  } catch (err) {
    console.warn('[OilEquityCorr] 计算失败:', err);
    return null;
  }
}

// ─── 主入口：从MonitorData判别状态 ───

/**
 * 从MonitorData提取指标并判别状态
 *
 * 改进说明（v2.0）:
 * - 波动率指数 → 使用 Garman-Klass / Parkinson 科学计算（替代原来的 vol20*1.5）
 * - OVX → 设为 null（A股无此数据产品）
 * - 股债相关性 → 基于上证指数+国债期货真实价格计算皮尔逊相关系数
 * - 原油权益相关性 → 基于原油期货+上证指数真实价格计算皮尔逊相关系数
 * - 黄金美元 → 标记为 NEED_EXTERNAL_DATA（A股无直接美元指数数据）
 * - 返回结果包含 dataSource 字段，明确标识每个数据的来源和计算方法
 */
export async function assessFromMonitorData(data: {
  stock: { changePercent: number; volume: number };
  indicators: { rsi6: number[]; atr14: number[]; volatility20: number[] };
  signals: { type: string }[];
  kline: { close: number; open: number; high: number; low: number; volume: number; date: string }[];
}): Promise<MarketState> {
  // ─── 1. 科学计算波动率指数（Garman-Klass / Parkinson） ───
  let estimatedVolIndex: number;
  let volIndexMethod: MarketState['dataSource']['volIndexMethod'] = 'Garman-Klass';
  let volSource: DataSourceTag = 'REAL_CALCULATED';

  // 使用完整OHLC计算Garman-Klass波动率
  const volResult = calculateVolatility(data.kline);

  if (volResult && isFinite(volResult.recommended) && volResult.recommended > 0) {
    estimatedVolIndex = volResult.recommended;
    volIndexMethod = volResult.recommendedMethod;
  } else {
    // Fallback: 使用传统的close-to-close方法
    const closes = data.kline.map((k) => k.close);
    const returns = closes.slice(1).map((p, i) => Math.log(p / closes[i]));
    if (returns.length >= 2) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
      estimatedVolIndex = Math.sqrt(variance) * Math.sqrt(252) * 100;
      volIndexMethod = 'Close-to-Close';
    } else {
      // 最终fallback
      estimatedVolIndex = 20;
      volIndexMethod = 'none';
      volSource = 'ESTIMATED_FROM_PRICE';
    }
    console.warn(`[VolIndex] ⚠️ 使用fallback: ${volIndexMethod} = ${estimatedVolIndex.toFixed(2)}%`);
  }

  // ─── 2. 计算成交额异动率 ───
  const recentVol = data.kline.slice(-5).map((k) => k.volume);
  const avgVol = data.kline.slice(-25, -5).reduce((a, k) => a + k.volume, 0) / 20;
  const turnoverRatio = avgVol > 0 ? (recentVol.reduce((a, v) => a + v, 0) / 5 / avgVol) - 1 : 0;

  // ─── 3. 板块分化度（用K线日涨跌幅标准差模拟） ───
  const dailyChanges = data.kline
    .slice(-5)
    .map((k, i, arr) => (i > 0 ? ((k.close - arr[i - 1].close) / arr[i - 1].close) * 100 : 0))
    .slice(1);
  const sectorDispersion =
    dailyChanges.length > 1
      ? Math.sqrt(dailyChanges.reduce((a, c) => a + c ** 2, 0) / dailyChanges.length)
      : 0;

  // ─── 4. 获取真实资金流向数据（优先从marketFlow.ts） ───
  let northFlow: number;
  let mainForceFlow: number;
  let flowSource: DataSourceTag;

  try {
    const marketFlow = await fetchMarketFlow();
    if (marketFlow) {
      northFlow = 0; // A股北向资金已停止实时披露
      mainForceFlow = marketFlow.mainFlow;
      flowSource = 'REAL_API';
    } else {
      northFlow = 0;
      mainForceFlow = -Math.abs(data.stock.changePercent) * 15;
      flowSource = 'ESTIMATED_FROM_PRICE';
    }
  } catch {
    northFlow = 0;
    mainForceFlow = -Math.abs(data.stock.changePercent) * 15;
    flowSource = 'ESTIMATED_FROM_PRICE';
  }

  // ─── 5. 计算5日均波动率 ───
  const vol5dAvg = calculateVolatilityMovingAverage(data.kline.slice(-10), 5) ?? estimatedVolIndex * 0.95;

  // ─── 6. 计算波动率日变化率 ───
  let vixChange = 0;
  if (data.kline.length >= 5) {
    const yesterdayVol = calculateVolatility(data.kline.slice(-6, -1))?.recommended;
    if (yesterdayVol && yesterdayVol > 0) {
      vixChange = ((estimatedVolIndex - yesterdayVol) / yesterdayVol) * 100;
    }
  }

  const vol: VolatilityMetrics = {
    estimatedVolIndex,
    ovx: null, // A股无OVX（原油波动率）数据
    vix5dAvg: vol5dAvg,
    vixChange,
    ovxVixSpread: null, // OVX不可用时为null
  };

  const liq: LiquidityMetrics = {
    northFlow,
    mainForceFlow,
    turnoverRatio,
    weightedTurnover: 50,
  };

  // ─── 7. 跨资产相关性计算（基于真实价格数据） ───
  let stockBondCorrelation: number | null = null;
  let oilEquityCorrelation: number | null = null;
  let goldUsdDirection: 'SAME' | 'OPPOSITE' | null = null;

  let stockBondSource: DataSourceTag = 'NEED_EXTERNAL_DATA';
  let oilEquitySource: DataSourceTag = 'NEED_EXTERNAL_DATA';
  let goldUsdSource: DataSourceTag = 'NEED_EXTERNAL_DATA';

  try {
    // 并行计算股债相关性和原油权益相关性
    const [sbCorr, oeCorr] = await Promise.all([
      calculateStockBondCorrelation(),
      calculateOilEquityCorrelation(),
    ]);

    if (sbCorr !== null) {
      stockBondCorrelation = sbCorr;
      stockBondSource = 'REAL_CALCULATED';
    }

    if (oeCorr !== null) {
      oilEquityCorrelation = oeCorr;
      oilEquitySource = 'REAL_CALCULATED';
    }

    // 黄金美元关系：A股无直接美元指数数据，标记为NEED_EXTERNAL_DATA
    goldUsdDirection = null;
    goldUsdSource = 'NEED_EXTERNAL_DATA';
  } catch (err) {
    console.warn('[CrossAsset] 跨资产相关性计算失败:', err);
    // 保持null，数据源标记为NEED_EXTERNAL_DATA
  }

  const cross: CrossAssetMetrics = {
    stockBondCorrelation,
    goldUsdDirection,
    oilEquityCorrelation,
  };

  const dataSource: MarketState['dataSource'] = {
    volIndex: volSource,
    volIndexMethod,
    ovx: 'NOT_AVAILABLE',
    northFlow: 'NOT_AVAILABLE',
    mainForceFlow: flowSource,
    turnoverRatio: 'ESTIMATED_FROM_PRICE',
    stockBondCorrelation: stockBondSource,
    goldUsdDirection: goldUsdSource,
    oilEquityCorrelation: oilEquitySource,
  };

  return assessMarketState(vol, liq, cross, sectorDispersion, dataSource);
}

/**
 * 获取阶段颜色
 */
export function getPhaseColor(phase: MarketPhase): string {
  switch (phase) {
    case 'IMPACT':
      return '#FF2A6D'; // 红色
    case 'REPRICE':
      return '#D4AF37'; // 金色
    case 'ROTATE':
      return '#00FF94'; // 绿色
    case 'NORMAL':
      return '#CED1D5'; // 白色
  }
}

/**
 * 获取预警颜色
 */
export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case 'GREEN':
      return '#00FF94';
    case 'YELLOW':
      return '#D4AF37';
    case 'ORANGE':
      return '#FF6B35';
    case 'RED':
      return '#FF2A6D';
  }
}

/**
 * 获取阶段中文名称
 */
export function getPhaseName(phase: MarketPhase): string {
  switch (phase) {
    case 'IMPACT':
      return '冲击期';
    case 'REPRICE':
      return '重新定价期';
    case 'ROTATE':
      return '轮动期';
    case 'NORMAL':
      return '正常运行';
  }
}
