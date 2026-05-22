/* ═══════════════════════════════════════════════════════════════
   Strategy Intervention Engine — 策略干预引擎
   基于研究报告"三级响应框架"+"四级应急体系"实现

   三级响应框架:
   - Level 1 信号降权: 市场异动初现，降低信号置信度，收紧止损
   - Level 2 对冲切换: 恐慌确认，切换对冲策略，大幅降低仓位
   - Level 3 现金防守: 极端行情，清仓或仅持防御性资产

   四级应急体系:
   - Level 1 预警(VIX≥25): 启动预警，增加监控频率
   - Level 2 警戒(VIX≥35): 暂停新增开仓，收紧止损
   - Level 3 危机(VIX≥50): 强制减仓至30%以下
   - Level 4 灾难(VIX≥70): 清仓，仅持黄金/国债/现金

   策略干预原则:
   - 渐进式干预，避免过度反应
   - 分级响应，不同级别对应不同操作
   - 可逆操作，市场恢复后可快速解除
   ═══════════════════════════════════════════════════════════════ */

import type { MarketState, MarketPhase } from './marketStateEngine';

// ─── 类型定义 ───

/** 干预级别 */
export type InterventionLevel = 1 | 2 | 3;

/** 应急级别 */
export type EmergencyLevel = 1 | 2 | 3 | 4;

/** 策略类型 */
export type StrategyType = 'TREND_FOLLOW' | 'MEAN_REVERSION' | 'MOMENTUM' | 'BREAKOUT' | 'FACTOR' | 'VALUE';

/** 交易信号 */
export interface TradeSignal {
  id: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  code: string;
  name: string;
  price: number;
  confidence: number;    // 原始置信度 0-100
  strategy: StrategyType;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** 干预配置 */
export interface InterventionConfig {
  level: InterventionLevel;
  name: string;
  positionLimit: number;       // 仓位上限 (%)
  signalConfidence: number;    // 信号置信度阈值 (%)
  stopLossMultiplier: number;  // ATR止损倍数
  maxHoldingPeriod: number;    // 最大持仓周期 (天)
  allowNewOpen: boolean;       // 是否允许新开仓
  allowHedge: boolean;         // 是否启用对冲
  description: string;
}

/** 应急配置 */
export interface EmergencyConfig {
  level: EmergencyLevel;
  name: string;
  vixThreshold: number;        // VIX阈值
  stressScoreThreshold: number; // 综合压力分阈值
  action: string;              // 执行动作描述
  positionCap: number;         // 仓位上限 (%)
  requiredActions: string[];   // 必须执行的操作清单
}

/** 干预结果 */
export interface InterventionResult {
  originalSignals: TradeSignal[];
  filteredSignals: TradeSignal[];
  rejectedSignals: TradeSignal[];
  interventionLevel: InterventionLevel;
  emergencyLevel: EmergencyLevel | null;
  positionTarget: number;      // 目标仓位 (%)
  positionAction: string;      // 仓位操作建议
  hedgeRequired: boolean;      // 是否需要对冲
  alerts: string[];            // 预警信息列表
  timestamp: string;
}

/** 仓位建议 */
export interface PositionAdvice {
  currentPosition: number;     // 当前仓位
  targetPosition: number;      // 建议仓位
  action: string;              // 操作描述
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
}

// ─── 常量配置 ───

/** 三级干预配置表 */
const INTERVENTION_CONFIGS: Record<InterventionLevel, InterventionConfig> = {
  1: {
    level: 1,
    name: '信号降权',
    positionLimit: 70,
    signalConfidence: 50,
    stopLossMultiplier: 1.2,
    maxHoldingPeriod: 5,
    allowNewOpen: true,
    allowHedge: false,
    description: '市场异动初现，降低信号置信度，收紧止损倍数至1.2x',
  },
  2: {
    level: 2,
    name: '对冲切换',
    positionLimit: 40,
    signalConfidence: 65,
    stopLossMultiplier: 1.0,
    maxHoldingPeriod: 3,
    allowNewOpen: false,
    allowHedge: true,
    description: '恐慌情绪确认，暂停新开仓，启用对冲，仓位上限40%',
  },
  3: {
    level: 3,
    name: '现金防守',
    positionLimit: 10,
    signalConfidence: 80,
    stopLossMultiplier: 0.5,
    maxHoldingPeriod: 1,
    allowNewOpen: false,
    allowHedge: true,
    description: '极端行情，清仓或仅持防御性资产，仓位上限10%',
  },
};

/** 四级应急配置表 */
const EMERGENCY_CONFIGS: Record<EmergencyLevel, EmergencyConfig> = {
  1: {
    level: 1,
    name: '预警',
    vixThreshold: 25,
    stressScoreThreshold: 25,
    action: '启动预警，增加监控频率至每15分钟一次',
    positionCap: 80,
    requiredActions: ['增加监控频率', '收紧止损至1.2x', '降低仓位至80%以下'],
  },
  2: {
    level: 2,
    name: '警戒',
    vixThreshold: 35,
    stressScoreThreshold: 50,
    action: '暂停新增开仓，收紧止损至1.0x，降低仓位至50%',
    positionCap: 50,
    requiredActions: ['暂停新增开仓', '收紧止损至1.0x', '降低仓位至50%以下', '启用对冲准备'],
  },
  3: {
    level: 3,
    name: '危机',
    vixThreshold: 50,
    stressScoreThreshold: 75,
    action: '强制减仓至30%以下，仅保留核心持仓',
    positionCap: 30,
    requiredActions: ['强制减仓至30%', '清仓非核心持仓', '启用全额对冲', '暂停所有策略'],
  },
  4: {
    level: 4,
    name: '灾难',
    vixThreshold: 70,
    stressScoreThreshold: 90,
    action: '清仓，仅持黄金/国债/现金等避险资产',
    positionCap: 0,
    requiredActions: ['清仓所有风险资产', '仅持黄金/国债/现金', '关闭所有策略信号', '启动应急沟通'],
  },
};

// ─── 核心函数 ───

/**
 * 根据市场状态确定干预级别
 * 基于AlertLevel + MarketPhase综合判断
 */
export function determineIntervention(state: MarketState): InterventionConfig {
  // 根据预警级别确定干预级别
  switch (state.alertLevel) {
    case 'RED':
      return INTERVENTION_CONFIGS[3]; // 现金防守
    case 'ORANGE':
      return state.phase === 'IMPACT'
        ? INTERVENTION_CONFIGS[2]      // 对冲切换
        : INTERVENTION_CONFIGS[1];     // 信号降权
    case 'YELLOW':
      return INTERVENTION_CONFIGS[1];  // 信号降权
    case 'GREEN':
    default:
      return {
        ...INTERVENTION_CONFIGS[1],
        name: '正常运行',
        positionLimit: 100,
        signalConfidence: 40,
        allowNewOpen: true,
        description: '市场正常运行，无干预措施',
      };
  }
}

/**
 * 根据市场状态确定应急级别
 */
export function determineEmergency(state: MarketState): EmergencyConfig | null {
  // 优先按VIX判断
  if (state.vix >= EMERGENCY_CONFIGS[4].vixThreshold) {
    return EMERGENCY_CONFIGS[4];
  }
  if (state.vix >= EMERGENCY_CONFIGS[3].vixThreshold) {
    return EMERGENCY_CONFIGS[3];
  }
  if (state.vix >= EMERGENCY_CONFIGS[2].vixThreshold) {
    return EMERGENCY_CONFIGS[2];
  }
  if (state.vix >= EMERGENCY_CONFIGS[1].vixThreshold) {
    return EMERGENCY_CONFIGS[1];
  }
  return null;
}

/**
 * 计算调整后的信号置信度
 * 根据干预级别对原始置信度进行惩罚
 */
export function adjustConfidence(
  originalConfidence: number,
  config: InterventionConfig,
  state: MarketState,
): number {
  let adjusted = originalConfidence;

  // 基础惩罚：根据干预级别降低置信度
  const penaltyMap: Record<InterventionLevel, number> = {
    1: 10,  // 降权10%
    2: 25,  // 降权25%
    3: 45,  // 降权45%
  };
  adjusted -= penaltyMap[config.level] || 0;

  // 冲击期额外惩罚动量类策略
  if (state.phase === 'IMPACT' && state.alertLevel === 'RED') {
    adjusted -= 15;
  }

  // 重新定价期奖励价值类策略
  if (state.phase === 'REPRICE') {
    adjusted += 5;
  }

  return Math.max(0, Math.min(100, Math.round(adjusted)));
}

/**
 * 过滤信号列表
 * 根据干预配置和当前市场状态过滤/调整交易信号
 */
export function filterSignals(
  signals: TradeSignal[],
  state: MarketState,
): InterventionResult {
  const intervention = determineIntervention(state);
  const emergency = determineEmergency(state);
  const alerts: string[] = [];

  // 生成预警信息
  if (emergency) {
    alerts.push(`[应急${emergency.level}级-${emergency.name}] ${emergency.action}`);
  }
  if (intervention.level >= 2) {
    alerts.push(`[干预${intervention.level}级-${intervention.name}] ${intervention.description}`);
  }

  const filtered: TradeSignal[] = [];
  const rejected: TradeSignal[] = [];

  for (const signal of signals) {
    // 根据策略类型在冲击期进行差异化处理
    const strategyMultiplier = getStrategyMultiplier(signal.strategy, state);
    const adjustedConfidence = adjustConfidence(
      signal.confidence * strategyMultiplier,
      intervention,
      state,
    );

    const adjustedSignal: TradeSignal = {
      ...signal,
      confidence: adjustedConfidence,
    };

    // 判断是否通过过滤
    const passes = checkSignalPasses(adjustedSignal, intervention, state);

    if (passes) {
      filtered.push(adjustedSignal);
    } else {
      rejected.push({
        ...adjustedSignal,
        metadata: {
          ...adjustedSignal.metadata,
          rejectReason: `置信度${adjustedConfidence}%低于阈值${intervention.signalConfidence}%`,
          originalConfidence: signal.confidence,
        },
      });
    }
  }

  // 计算目标仓位
  const positionTarget = emergency
    ? Math.min(intervention.positionLimit, emergency.positionCap)
    : intervention.positionLimit;

  // 生成仓位操作建议
  const positionAction = generatePositionAction(positionTarget, state);

  return {
    originalSignals: signals,
    filteredSignals: filtered,
    rejectedSignals: rejected,
    interventionLevel: intervention.level,
    emergencyLevel: emergency?.level || null,
    positionTarget,
    positionAction,
    hedgeRequired: intervention.allowHedge || (emergency?.level ?? 0) >= 2,
    alerts,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 获取策略在当前市场状态下的乘数
 * 不同策略在不同市场阶段表现不同
 */
function getStrategyMultiplier(
  strategy: StrategyType,
  state: MarketState,
): number {
  const multipliers: Record<MarketPhase, Partial<Record<StrategyType, number>>> = {
    IMPACT: {
      TREND_FOLLOW: 0.6,
      MOMENTUM: 0.4,
      BREAKOUT: 0.5,
      MEAN_REVERSION: 0.7,
      FACTOR: 0.8,
      VALUE: 1.1,
    },
    REPRICE: {
      TREND_FOLLOW: 0.8,
      MOMENTUM: 0.9,
      BREAKOUT: 1.0,
      MEAN_REVERSION: 1.2,
      FACTOR: 1.1,
      VALUE: 1.2,
    },
    ROTATE: {
      TREND_FOLLOW: 1.1,
      MOMENTUM: 1.2,
      BREAKOUT: 1.1,
      MEAN_REVERSION: 0.9,
      FACTOR: 1.0,
      VALUE: 0.9,
    },
    NORMAL: {
      TREND_FOLLOW: 1.0,
      MOMENTUM: 1.0,
      BREAKOUT: 1.0,
      MEAN_REVERSION: 1.0,
      FACTOR: 1.0,
      VALUE: 1.0,
    },
  };

  return multipliers[state.phase]?.[strategy] ?? 1.0;
}

/**
 * 检查信号是否通过过滤
 */
function checkSignalPasses(
  signal: TradeSignal,
  config: InterventionConfig,
  state: MarketState,
): boolean {
  // 置信度检查
  if (signal.confidence < config.signalConfidence) {
    return false;
  }

  // 不允许新开仓时，只保留SELL信号（用于减仓）
  if (!config.allowNewOpen && signal.type === 'BUY') {
    return false;
  }

  // 冲击期只保留高置信度SELL和高置信度VALUE信号
  if (state.phase === 'IMPACT' && state.alertLevel === 'RED') {
    if (signal.type === 'BUY' && signal.strategy !== 'VALUE') {
      return false;
    }
    if (signal.confidence < 70) {
      return false;
    }
  }

  return true;
}

/**
 * 生成仓位操作建议
 */
function generatePositionAction(targetPosition: number, _state: MarketState): string {
  if (targetPosition === 0) {
    return '【紧急清仓】立即清仓所有风险资产，仅持有黄金/国债/现金';
  }
  if (targetPosition <= 10) {
    return '【极端防守】大幅减仓至10%以下，仅保留核心防御性持仓';
  }
  if (targetPosition <= 30) {
    return '【危机减仓】强制减仓至30%以下，清仓非核心持仓';
  }
  if (targetPosition <= 40) {
    return '【对冲切换】减仓至40%，启用对冲保护';
  }
  if (targetPosition <= 50) {
    return '【警戒减仓】降低仓位至50%以下，暂停新增开仓';
  }
  if (targetPosition <= 70) {
    return '【信号降权】降低仓位至70%，收紧止损';
  }
  if (targetPosition <= 80) {
    return '【预警响应】降低仓位至80%以内，增加监控频率';
  }
  return '【正常运行】维持正常仓位管理';
}

/**
 * 计算仓位调整建议
 */
export function calculatePositionAdjustment(
  currentPosition: number,  // 当前仓位百分比
  state: MarketState,
): PositionAdvice {
  const intervention = determineIntervention(state);
  const emergency = determineEmergency(state);

  const targetPosition = emergency
    ? Math.min(intervention.positionLimit, emergency.positionCap)
    : intervention.positionLimit;

  const reduction = currentPosition - targetPosition;

  let action: string;
  let urgency: PositionAdvice['urgency'];

  if (reduction > 30) {
    action = `需减仓${reduction.toFixed(0)}%，从${currentPosition}%降至${targetPosition}%`;
    urgency = 'CRITICAL';
  } else if (reduction > 15) {
    action = `建议减仓${reduction.toFixed(0)}%至${targetPosition}%`;
    urgency = 'HIGH';
  } else if (reduction > 5) {
    action = `适度减仓${reduction.toFixed(0)}%至${targetPosition}%`;
    urgency = 'MEDIUM';
  } else if (reduction > 0) {
    action = `微调仓位至${targetPosition}%`;
    urgency = 'LOW';
  } else {
    action = `当前仓位${currentPosition}%符合要求（上限${targetPosition}%）`;
    urgency = 'LOW';
  }

  return {
    currentPosition,
    targetPosition,
    action,
    urgency,
    reason: generateReason(intervention, emergency, state),
  };
}

/**
 * 生成调整原因
 */
function generateReason(
  intervention: InterventionConfig,
  emergency: EmergencyConfig | null,
  state: MarketState,
): string {
  const parts: string[] = [];

  if (emergency) {
    parts.push(`应急级别${emergency.level}（${emergency.name}）`);
  }
  if (intervention.level > 0) {
    parts.push(`干预级别${intervention.level}（${intervention.name}）`);
  }
  parts.push(`市场阶段：${state.phase}`);
  parts.push(`VIX：${state.vix.toFixed(1)}`);

  return parts.join('，');
}

/**
 * 获取止损倍数建议
 */
export function getStopLossMultiplier(state: MarketState): number {
  const intervention = determineIntervention(state);
  return intervention.stopLossMultiplier;
}

/**
 * 获取最大持仓周期建议
 */
export function getMaxHoldingPeriod(state: MarketState): number {
  const intervention = determineIntervention(state);
  return intervention.maxHoldingPeriod;
}

/**
 * 获取干预颜色（用于UI展示）
 */
export function getInterventionColor(level: InterventionLevel): string {
  switch (level) {
    case 1: return '#D4AF37'; // 金色 - 信号降权
    case 2: return '#FF6B35'; // 橙色 - 对冲切换
    case 3: return '#FF2A6D'; // 红色 - 现金防守
    default: return '#CED1D5';
  }
}

/**
 * 获取应急颜色（用于UI展示）
 */
export function getEmergencyColor(level: EmergencyLevel): string {
  switch (level) {
    case 1: return '#D4AF37'; // 黄色 - 预警
    case 2: return '#FF6B35'; // 橙色 - 警戒
    case 3: return '#FF2A6D'; // 红色 - 危机
    case 4: return '#8B0000'; // 深红 - 灾难
    default: return '#CED1D5';
  }
}

/**
 * 获取干预级别名称
 */
export function getInterventionName(level: InterventionLevel): string {
  return INTERVENTION_CONFIGS[level]?.name || '未知';
}

/**
 * 获取应急级别名称
 */
export function getEmergencyName(level: EmergencyLevel): string {
  return EMERGENCY_CONFIGS[level]?.name || '未知';
}

/**
 * 快速评估：是否需要干预
 */
export function needsIntervention(state: MarketState): boolean {
  return state.alertLevel !== 'GREEN' || state.phase !== 'NORMAL';
}

/**
 * 快速评估：是否需要应急
 */
export function needsEmergency(state: MarketState): boolean {
  return state.vix >= EMERGENCY_CONFIGS[1].vixThreshold;
}

/**
 * 生成完整的干预报告
 */
export function generateInterventionReport(
  marketState: MarketState,
  signals: TradeSignal[],
  currentPosition: number,
): {
  state: MarketState;
  intervention: InterventionConfig;
  emergency: EmergencyConfig | null;
  signalResult: InterventionResult;
  positionAdvice: PositionAdvice;
  stopLossMultiplier: number;
  maxHoldingPeriod: number;
  summary: string;
} {
  const intervention = determineIntervention(marketState);
  const emergency = determineEmergency(marketState);
  const signalResult = filterSignals(signals, marketState);
  const positionAdvice = calculatePositionAdjustment(currentPosition, marketState);
  const stopLoss = getStopLossMultiplier(marketState);
  const holdingPeriod = getMaxHoldingPeriod(marketState);

  // 生成摘要
  const summaryLines: string[] = [];
  summaryLines.push(`市场状态：${marketState.phase}（${marketState.description}）`);
  summaryLines.push(`预警级别：${marketState.alertLevel}`);
  if (emergency) {
    summaryLines.push(`应急级别：${emergency.level}级（${emergency.name}）`);
  }
  summaryLines.push(`干预级别：${intervention.level}级（${intervention.name}）`);
  summaryLines.push(`信号过滤：${signalResult.filteredSignals.length}/${signalResult.originalSignals.length}个通过`);
  summaryLines.push(`仓位建议：${currentPosition}% → ${positionAdvice.targetPosition}%`);
  summaryLines.push(`止损倍数：${stopLoss}x ATR`);
  if (signalResult.hedgeRequired) {
    summaryLines.push('对冲：建议启用');
  }

  return {
    state: marketState,
    intervention,
    emergency,
    signalResult,
    positionAdvice,
    stopLossMultiplier: stopLoss,
    maxHoldingPeriod: holdingPeriod,
    summary: summaryLines.join('\n'),
  };
}
