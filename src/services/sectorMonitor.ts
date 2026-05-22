/* ═══════════════════════════════════════════════════════════════
   Sector Monitor — 板块异动监测引擎
   基于研究报告"板块资金异动对个股策略的影响"实现

   核心功能:
   - 板块资金流向分析（主力净流入/成交额占比）
   - 板块拥挤度计算（成交额占比+换手率+融资余额+相关性）
   - 板块轮动检测（相对强度/动量/资金流向变化）
   - 个股-板块关联度评估

   监测维度:
   - 资金维度: 主力净流入、成交额占比、北向资金行业流向
   - 情绪维度: 换手率、融资余额变化、新增开户数
   - 结构维度: 成分股相关性、龙头-跟随分化度
   - 轮动维度: 相对强度RS、动量排序、资金流向趋势
   ═══════════════════════════════════════════════════════════════ */

import { fetchMarketFlow } from './marketFlow';

// ─── 类型定义 ───

/** 板块数据 */
export interface SectorData {
  name: string;              // 板块名称
  code: string;              // 板块代码
  changePercent: number;     // 涨跌幅(%)
  turnover: number;          // 成交额(亿元)
  turnoverRate: number;      // 换手率(%)
    marginBalance: number;     // 融资余额(亿元)
  marginChange: number;      // 融资余额变化(亿元)
  mainForceFlow: number;     // 主力资金净流入(亿元)
  northFlow: number;         // 北向资金净流入(亿元)
  leadingStock?: string;     // 龙头股代码
  leadingChange?: number;    // 龙头股涨跌幅
  stockCount: number;        // 成分股数量
  avgCorrelation?: number;   // 成分股平均相关性
}

/** 板块资金流向结果 */
export interface SectorFlowResult {
  inflowSectors: SectorFlowItem[];   // 净流入板块（排序）
  outflowSectors: SectorFlowItem[];  // 净流出板块（排序）
  totalInflow: number;               // 总净流入
  totalOutflow: number;              // 总净流出
  netFlow: number;                   // 净流向
  extremeFlowSectors: string[];      // 极端流入板块（需关注）
  timestamp: string;
}

/** 板块资金流向项 */
export interface SectorFlowItem {
  name: string;
  code: string;
  mainForceFlow: number;     // 主力净流入
  turnoverRatio: number;     // 成交额占全市场比例(%)
  flowScore: number;         // 综合流入评分(0-100)
  alertLevel: 'NORMAL' | 'YELLOW' | 'ORANGE' | 'RED';
}

/** 板块拥挤度 */
export interface SectorCrowding {
  sector: string;
  code: string;
  turnoverRatio: number;     // 成交额占比(%)
  turnoverRate: number;      // 换手率(%)
  marginBalance: number;     // 融资余额(亿元)
  marginChangePercent: number; // 融资余额变化率(%)
  correlation: number;       // 成分股相关性(0-1)
  compositeScore: number;    // 综合拥挤度评分(0-100)
  alertLevel: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  description: string;
}

/** 板块轮动信号 */
export interface RotationSignal {
  type: 'LEADERSHIP_CHANGE' | 'MOMENTUM_SHIFT' | 'FLOW_REVERSAL' | 'NONE';
  fromSector?: string;       // 流出板块
  toSector?: string;         // 流入板块
  strength: number;          // 轮动强度(0-100)
  confidence: number;        // 置信度(0-100)
  description: string;
  timestamp: string;
}

/** 个股-板块关联评估 */
export interface StockSectorRelation {
  stockCode: string;
  stockName: string;
  primarySector: string;     // 主属板块
  sectorCorrelation: number; // 与板块指数相关性
  sectorBeta: number;        // 板块贝塔
  relativeStrength: number;  // 相对强度(个股/板块)
  isLeading: boolean;        // 是否为龙头
  riskFromSector: 'LOW' | 'MEDIUM' | 'HIGH'; // 板块传导风险
}

/** 板块预警 */
export interface SectorAlert {
  sector: string;
  code: string;
  alertType: 'CROWDING' | 'FLOW_EXTREME' | 'MOMENTUM_DIVERGENCE' | 'CORRELATION_BREAKDOWN';
  severity: 'YELLOW' | 'ORANGE' | 'RED';
  message: string;
  metrics: Record<string, number>;
  suggestedAction: string;
  timestamp: string;
}

// ─── 阈值常量 ───

const CROWDING_YELLOW = 40;   // 拥挤度40分黄色预警
const CROWDING_ORANGE = 60;   // 拥挤度60分橙色预警
const CROWDING_RED = 80;      // 拥挤度80分红色预警

const FLOW_YELLOW = 20;       // 单板块流入占全市场20%
const FLOW_ORANGE = 30;       // 单板块流入占全市场30%
const FLOW_RED = 45;          // 单板块流入占全市场45%

const TURNOVER_RATE_YELLOW = 5;  // 换手率5%
const TURNOVER_RATE_RED = 10;    // 换手率10%

const MARGIN_CHANGE_YELLOW = 10; // 融资余额变化10%
const MARGIN_CHANGE_RED = 20;    // 融资余额变化20%

const DEFAULT_TOTAL_TURNOVER = 15000; // 默认全市场成交额约1.5万亿（当缓存不可用时fallback）
const MARKET_FLOW_CACHE_KEY = 'market_flow_cache';
const CACHE_TTL = 60 * 1000; // 60秒缓存（与marketFlow.ts一致）

/**
 * 从本地缓存读取全市场成交额（同步，无需网络请求）
 * 返回缓存中的全市场成交额（亿元），若缓存过期或不存在则返回null
 */
function getCachedTotalMarketTurnover(): number | null {
  try {
    const cached = localStorage.getItem(MARKET_FLOW_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) return null; // 缓存过期
    const totalTurnover = data?.totalTurnover;
    return typeof totalTurnover === 'number' && totalTurnover > 0 ? totalTurnover : null;
  } catch {
    return null;
  }
}

/**
 * 异步获取全市场成交额（优先缓存，缓存不存在时从API获取）
 * 返回真实成交额（亿元），获取失败时返回默认值
 */
async function getTotalMarketTurnover(): Promise<number> {
  // 1. 先尝试读缓存
  const cached = getCachedTotalMarketTurnover();
  if (cached) return cached;

  // 2. 缓存不存在，尝试从API获取
  try {
    const flow = await fetchMarketFlow();
    if (flow && flow.totalTurnover > 0) return flow.totalTurnover;
  } catch {
    // API调用失败，使用默认值
  }

  // 3. Fallback: 返回默认值并标注
  console.warn('[SectorMonitor] 使用默认全市场成交额估算值:', DEFAULT_TOTAL_TURNOVER, '亿');
  return DEFAULT_TOTAL_TURNOVER;
}

// ─── 核心函数 ───

/**
 * 分析板块资金流向
 * 识别净流入/流出板块，标记极端流入
 */
export function analyzeSectorFlow(sectors: SectorData[]): SectorFlowResult {
  const totalTurnover = sectors.reduce((sum, s) => sum + s.turnover, 0);

  const items: SectorFlowItem[] = sectors.map((s) => {
    const turnoverRatio = totalTurnover > 0 ? (s.turnover / totalTurnover) * 100 : 0;

    // 综合流入评分 (0-100)
    const flowScore = calculateFlowScore(s, turnoverRatio);

    // 预警级别
    let alertLevel: SectorFlowItem['alertLevel'] = 'NORMAL';
    if (turnoverRatio >= FLOW_RED || s.mainForceFlow > 100) {
      alertLevel = 'RED';
    } else if (turnoverRatio >= FLOW_ORANGE || s.mainForceFlow > 50) {
      alertLevel = 'ORANGE';
    } else if (turnoverRatio >= FLOW_YELLOW || s.mainForceFlow > 20) {
      alertLevel = 'YELLOW';
    }

    return {
      name: s.name,
      code: s.code,
      mainForceFlow: s.mainForceFlow,
      turnoverRatio,
      flowScore,
      alertLevel,
    };
  });

  // 排序
  const inflowSectors = items
    .filter((i) => i.mainForceFlow > 0)
    .sort((a, b) => b.mainForceFlow - a.mainForceFlow);

  const outflowSectors = items
    .filter((i) => i.mainForceFlow <= 0)
    .sort((a, b) => a.mainForceFlow - b.mainForceFlow);

  // 极端流入板块
  const extremeFlowSectors = items
    .filter((i) => i.alertLevel === 'RED' || i.alertLevel === 'ORANGE')
    .map((i) => i.name);

  const totalInflow = inflowSectors.reduce((sum, i) => sum + i.mainForceFlow, 0);
  const totalOutflow = outflowSectors.reduce((sum, i) => sum + i.mainForceFlow, 0);

  return {
    inflowSectors,
    outflowSectors,
    totalInflow,
    totalOutflow,
    netFlow: totalInflow + totalOutflow,
    extremeFlowSectors,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 计算板块综合流入评分
 */
function calculateFlowScore(sector: SectorData, turnoverRatio: number): number {
  let score = 0;

  // 主力资金流入 (0-40分)
  if (sector.mainForceFlow > 50) score += 40;
  else if (sector.mainForceFlow > 20) score += 30;
  else if (sector.mainForceFlow > 0) score += 20;
  else if (sector.mainForceFlow > -20) score += 10;

  // 成交额占比 (0-30分)
  if (turnoverRatio > 15) score += 30;
  else if (turnoverRatio > 10) score += 20;
  else if (turnoverRatio > 5) score += 10;

  // 北向资金 (0-20分)
  if (sector.northFlow > 10) score += 20;
  else if (sector.northFlow > 5) score += 15;
  else if (sector.northFlow > 0) score += 10;

  // 涨跌幅加分 (0-10分)
  if (sector.changePercent > 3) score += 10;
  else if (sector.changePercent > 1) score += 5;

  return Math.min(100, score);
}

/**
 * 计算板块拥挤度
 * 基于成交额占比、换手率、融资余额变化、成分股相关性
 * 
 * @param sector 板块数据
 * @param totalMarketTurnover 可选：全市场成交额（亿元）。
 *   若提供则直接使用；若不提供，优先从本地缓存读取真实数据，缓存不存在时使用默认值
 */
export function calculateCrowding(
  sector: SectorData,
  totalMarketTurnover?: number
): SectorCrowding {
  // 各维度评分 (0-25分)

  // 成交额占比拥挤度：优先使用传入值 > 缓存值 > 默认值
  let turnoverRatioScore = 0;
  const marketTurnover = totalMarketTurnover ?? getCachedTotalMarketTurnover() ?? DEFAULT_TOTAL_TURNOVER;
  const tr = (sector.turnover / marketTurnover) * 100;
  if (tr > 20) turnoverRatioScore = 25;
  else if (tr > 15) turnoverRatioScore = 20;
  else if (tr > 10) turnoverRatioScore = 15;
  else if (tr > 5) turnoverRatioScore = 10;
  else turnoverRatioScore = 5;

  // 换手率拥挤度
  let turnoverRateScore = 0;
  if (sector.turnoverRate > TURNOVER_RATE_RED) turnoverRateScore = 25;
  else if (sector.turnoverRate > TURNOVER_RATE_YELLOW) turnoverRateScore = 15;
  else turnoverRateScore = 5;

  // 融资余额变化拥挤度
  let marginScore = 0;
  const marginChangePercent = sector.marginBalance > 0
    ? (sector.marginChange / sector.marginBalance) * 100
    : 0;
  if (Math.abs(marginChangePercent) > MARGIN_CHANGE_RED) marginScore = 25;
  else if (Math.abs(marginChangePercent) > MARGIN_CHANGE_YELLOW) marginScore = 15;
  else marginScore = 5;

  // 相关性拥挤度（成分股走势一致性越高越拥挤）
  let correlationScore = 0;
  const corr = sector.avgCorrelation ?? 0.5;
  if (corr > 0.85) correlationScore = 25;
  else if (corr > 0.7) correlationScore = 20;
  else if (corr > 0.5) correlationScore = 10;
  else correlationScore = 5;

  const compositeScore = turnoverRatioScore + turnoverRateScore + marginScore + correlationScore;

  // 预警级别
  let alertLevel: SectorCrowding['alertLevel'] = 'GREEN';
  let description = '板块运行正常';
  if (compositeScore >= CROWDING_RED) {
    alertLevel = 'RED';
    description = '【严重拥挤】交易过热，资金过度集中，警惕回调风险';
  } else if (compositeScore >= CROWDING_ORANGE) {
    alertLevel = 'ORANGE';
    description = '【中度拥挤】交易活跃，需关注分化风险';
  } else if (compositeScore >= CROWDING_YELLOW) {
    alertLevel = 'YELLOW';
    description = '【轻度拥挤】资金关注度上升';
  }

  return {
    sector: sector.name,
    code: sector.code,
    turnoverRatio: tr,
    turnoverRate: sector.turnoverRate,
    marginBalance: sector.marginBalance,
    marginChangePercent,
    correlation: corr,
    compositeScore,
    alertLevel,
    description,
  };
}

/**
 * 检测板块轮动信号
 * 基于相对强度、动量、资金流向变化
 */
export function detectSectorRotation(
  currentSectors: SectorData[],
  previousSectors?: SectorData[],
): RotationSignal {
  // 按主力资金流向排序
  const sortedByFlow = [...currentSectors].sort((a, b) => b.mainForceFlow - a.mainForceFlow);

  // 检查是否有明显的资金转向
  if (previousSectors && previousSectors.length > 0) {
    const flowChanges = sortedByFlow.map((current) => {
      const prev = previousSectors.find((p) => p.code === current.code);
      return {
        name: current.name,
        code: current.code,
        currentFlow: current.mainForceFlow,
        previousFlow: prev?.mainForceFlow ?? 0,
        change: current.mainForceFlow - (prev?.mainForceFlow ?? 0),
        changePercent: prev && prev.mainForceFlow !== 0
          ? ((current.mainForceFlow - prev.mainForceFlow) / Math.abs(prev.mainForceFlow)) * 100
          : 0,
      };
    });

    // 找资金流向逆转最大的
    const reversal = flowChanges
      .filter((f) => f.previousFlow < 0 && f.currentFlow > 20)
      .sort((a, b) => b.change - a.change)[0];

    if (reversal && reversal.change > 30) {
      const fromSector = flowChanges
        .filter((f) => f.currentFlow < -10)
        .sort((a, b) => a.currentFlow - b.currentFlow)[0];

      return {
        type: 'FLOW_REVERSAL',
        fromSector: fromSector?.name,
        toSector: reversal.name,
        strength: Math.min(100, reversal.changePercent),
        confidence: Math.min(100, 60 + reversal.change / 2),
        description: `${reversal.name}板块资金由流出转为大幅流入，可能形成新一轮主线`,
        timestamp: new Date().toISOString(),
      };
    }

    // 检查龙头切换
    const prevLeader = previousSectors.reduce((max, s) =>
      (s.mainForceFlow > max.mainForceFlow ? s : max), previousSectors[0]);
    const currLeader = sortedByFlow[0];

    if (prevLeader && currLeader && prevLeader.code !== currLeader.code) {
      return {
        type: 'LEADERSHIP_CHANGE',
        fromSector: prevLeader.name,
        toSector: currLeader.name,
        strength: Math.min(100, (currLeader.mainForceFlow - prevLeader.mainForceFlow) / 2),
        confidence: 70,
        description: `板块龙头由${prevLeader.name}切换至${currLeader.name}，关注风格转换`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // 检查动量排序变化（没有历史数据时，检查当日极端分化）
  const topSector = sortedByFlow[0];
  const bottomSector = sortedByFlow[sortedByFlow.length - 1];
  const spread = topSector.mainForceFlow - bottomSector.mainForceFlow;

  if (spread > 80 && topSector.changePercent > 3) {
    return {
      type: 'MOMENTUM_SHIFT',
      toSector: topSector.name,
      strength: Math.min(100, spread / 2),
      confidence: 55,
      description: `${topSector.name}板块资金集中流入，动量优势显著`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    type: 'NONE',
    strength: 0,
    confidence: 0,
    description: '未检测到明显板块轮动信号',
    timestamp: new Date().toISOString(),
  };
}

/**
 * 评估个股与板块的关联度
 * @param totalMarketTurnover 可选：全市场成交额（亿元），用于计算板块拥挤度
 */
export function assessStockSectorRelation(
  stockCode: string,
  stockName: string,
  stockChange: number,
  sector: SectorData,
  sectorIndexChange: number,
  totalMarketTurnover?: number,
): StockSectorRelation {
  // 计算相关性（确定性近似：涨跌幅差异越小相关性越高）
  const diff = Math.abs(stockChange - sectorIndexChange);
  const correlation = Math.max(0.3, 1 - diff / 5); // 差异越小相关性越高，最低0.3

  // 板块贝塔
  const sectorBeta = sectorIndexChange !== 0 ? stockChange / sectorIndexChange : 1;

  // 相对强度
  const relativeStrength = sectorIndexChange !== 0
    ? stockChange / sectorIndexChange
    : 1;

  // 是否龙头（相对强度>1.2且涨幅大于板块）
  const isLeading = relativeStrength > 1.2 && stockChange > sectorIndexChange;

  // 板块传导风险
  let riskFromSector: StockSectorRelation['riskFromSector'] = 'LOW';
  const crowding = calculateCrowding(sector, totalMarketTurnover);
  if (crowding.alertLevel === 'RED') {
    riskFromSector = 'HIGH';
  } else if (crowding.alertLevel === 'ORANGE' || crowding.alertLevel === 'YELLOW') {
    riskFromSector = 'MEDIUM';
  }

  return {
    stockCode,
    stockName,
    primarySector: sector.name,
    sectorCorrelation: Math.min(0.99, correlation),
    sectorBeta: Math.round(sectorBeta * 100) / 100,
    relativeStrength: Math.round(relativeStrength * 100) / 100,
    isLeading,
    riskFromSector,
  };
}

/**
 * 批量计算板块拥挤度（同步版本，使用缓存数据）
 * @param sectors 板块数据数组
 * @param totalMarketTurnover 可选：全市场成交额（亿元）
 */
export function batchCalculateCrowding(
  sectors: SectorData[],
  totalMarketTurnover?: number
): SectorCrowding[] {
  return sectors.map((s) => calculateCrowding(s, totalMarketTurnover));
}

/**
 * 批量计算板块拥挤度（异步版本，自动获取最新全市场成交额）
 * @param sectors 板块数据数组
 */
export async function batchCalculateCrowdingAsync(
  sectors: SectorData[]
): Promise<SectorCrowding[]> {
  const marketTurnover = await getTotalMarketTurnover();
  return sectors.map((s) => calculateCrowding(s, marketTurnover));
}

/**
 * 扫描板块预警
 * @param sectors 板块数据数组
 * @param totalMarketTurnover 可选：全市场成交额（亿元）
 */
export function scanSectorAlerts(
  sectors: SectorData[],
  totalMarketTurnover?: number
): SectorAlert[] {
  const alerts: SectorAlert[] = [];

  for (const sector of sectors) {
    const crowding = calculateCrowding(sector, totalMarketTurnover);
    const totalTurnover = sectors.reduce((sum, s) => sum + s.turnover, 0);
    const turnoverRatio = totalTurnover > 0 ? (sector.turnover / totalTurnover) * 100 : 0;

    // 拥挤度预警
    if (crowding.alertLevel !== 'GREEN') {
      alerts.push({
        sector: sector.name,
        code: sector.code,
        alertType: 'CROWDING',
        severity: crowding.alertLevel === 'RED' ? 'RED' : crowding.alertLevel === 'ORANGE' ? 'ORANGE' : 'YELLOW',
        message: `${sector.name}板块${crowding.description}，综合评分${crowding.compositeScore.toFixed(0)}`,
        metrics: {
          compositeScore: crowding.compositeScore,
          turnoverRatio,
          turnoverRate: sector.turnoverRate,
          marginChangePercent: crowding.marginChangePercent,
        },
        suggestedAction: crowding.alertLevel === 'RED'
          ? '建议减仓或止盈，避免拥挤踩踏'
          : crowding.alertLevel === 'ORANGE'
            ? '密切关注，设置 tighter 止损'
            : '保持关注',
        timestamp: new Date().toISOString(),
      });
    }

    // 极端资金流入预警
    if (turnoverRatio >= FLOW_ORANGE) {
      alerts.push({
        sector: sector.name,
        code: sector.code,
        alertType: 'FLOW_EXTREME',
        severity: turnoverRatio >= FLOW_RED ? 'RED' : 'ORANGE',
        message: `${sector.name}板块成交额占全市场${turnoverRatio.toFixed(1)}%，资金过度集中`,
        metrics: { turnoverRatio, mainForceFlow: sector.mainForceFlow },
        suggestedAction: '警惕资金转向后的回调风险',
        timestamp: new Date().toISOString(),
      });
    }

    // 龙头-板块分化预警
    if (sector.leadingChange !== undefined) {
      const divergence = Math.abs(sector.leadingChange - sector.changePercent);
      if (divergence > 5) {
        alerts.push({
          sector: sector.name,
          code: sector.code,
          alertType: 'MOMENTUM_DIVERGENCE',
          severity: divergence > 8 ? 'RED' : 'ORANGE',
          message: `${sector.name}板块龙头(${sector.leadingStock})与板块指数分化${divergence.toFixed(1)}%`,
          metrics: { divergence, leadingChange: sector.leadingChange, sectorChange: sector.changePercent },
          suggestedAction: divergence > 8 ? '板块可能见顶，考虑减仓' : '关注龙头持续性',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 相关性瓦解预警（成分股走势分化）
    if (sector.avgCorrelation !== undefined && sector.avgCorrelation < 0.3) {
      alerts.push({
        sector: sector.name,
        code: sector.code,
        alertType: 'CORRELATION_BREAKDOWN',
        severity: 'YELLOW',
        message: `${sector.name}板块成分股相关性降至${(sector.avgCorrelation * 100).toFixed(0)}%，走势分化严重`,
        metrics: { avgCorrelation: sector.avgCorrelation },
        suggestedAction: '精选个股，减少对板块Beta的依赖',
        timestamp: new Date().toISOString(),
      });
    }
  }

  return alerts.sort((a, b) => {
    const severityOrder = { RED: 0, ORANGE: 1, YELLOW: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * 获取板块数据摘要（用于UI展示）
 * @param sectors 板块数据数组
 * @param totalMarketTurnover 可选：全市场成交额（亿元）
 */
export function getSectorSummary(
  sectors: SectorData[],
  totalMarketTurnover?: number
): {
  topInflow: SectorFlowItem[];
  topOutflow: SectorFlowItem[];
  mostCrowded: SectorCrowding[];
  rotationSignal: RotationSignal;
  alertCount: { yellow: number; orange: number; red: number };
} {
  const flowResult = analyzeSectorFlow(sectors);
  const crowdingList = batchCalculateCrowding(sectors, totalMarketTurnover);
  const rotationSignal = detectSectorRotation(sectors);
  const alerts = scanSectorAlerts(sectors, totalMarketTurnover);

  return {
    topInflow: flowResult.inflowSectors.slice(0, 5),
    topOutflow: flowResult.outflowSectors.slice(0, 5),
    mostCrowded: crowdingList
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 5),
    rotationSignal,
    alertCount: {
      yellow: alerts.filter((a) => a.severity === 'YELLOW').length,
      orange: alerts.filter((a) => a.severity === 'ORANGE').length,
      red: alerts.filter((a) => a.severity === 'RED').length,
    },
  };
}

/**
 * 获取拥挤度颜色
 */
export function getCrowdingColor(level: SectorCrowding['alertLevel']): string {
  switch (level) {
    case 'GREEN': return '#00FF94';
    case 'YELLOW': return '#D4AF37';
    case 'ORANGE': return '#FF6B35';
    case 'RED': return '#FF2A6D';
    default: return '#CED1D5';
  }
}

/**
 * 获取预警类型中文名
 */
export function getAlertTypeName(type: SectorAlert['alertType']): string {
  switch (type) {
    case 'CROWDING': return '拥挤度预警';
    case 'FLOW_EXTREME': return '极端资金流';
    case 'MOMENTUM_DIVERGENCE': return '动量分化';
    case 'CORRELATION_BREAKDOWN': return '相关性瓦解';
    default: return '未知';
  }
}
