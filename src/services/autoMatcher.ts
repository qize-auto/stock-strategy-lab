/**
 * 自动回测匹配引擎
 * 对多种策略自动运行真实回测，基于回测结果排序推荐最佳策略
 */

import { runRealBacktest } from '@/services/stockApi';
import type { RealBacktestResult } from '@/services/stockApi';

/** 策略定义 */
export interface MatchStrategy {
  key: string;
  name: string;
  shortName: string;
  description: string;
  colorHex: string;
}

/** 单个策略的回测结果 */
export interface StrategyBacktestResult {
  strategy: MatchStrategy;
  result: RealBacktestResult;
  compositeScore: number;
  sharpeScore: number;
  returnScore: number;
  drawdownScore: number;
}

/** 自动匹配最终结果 */
export interface AutoMatchResult {
  rankings: StrategyBacktestResult[];
  primary: StrategyBacktestResult;
  secondary: StrategyBacktestResult;
  tertiary: StrategyBacktestResult;
  totalBacktests: number;
  failedBacktests: number;
}

// ═══════════════════════════════════════════
// Strategy definitions
// ═══════════════════════════════════════════

const MATCH_STRATEGIES: MatchStrategy[] = [
  {
    key: 'trend',
    name: '趋势跟踪',
    shortName: 'Trend Following',
    description: '跟随市场趋势方向，动量驱动持仓',
    colorHex: '#00FF94',
  },
  {
    key: 'revert',
    name: '均值回归',
    shortName: 'Mean Reversion',
    description: '价格偏离均值后逆向操作，等待回归',
    colorHex: '#FF2A6D',
  },
  {
    key: 'breakout',
    name: '突破交易',
    shortName: 'Breakout',
    description: '捕捉价格突破关键位置的爆发行情',
    colorHex: '#D4AF37',
  },
  {
    key: 'factor',
    name: '因子选股',
    shortName: 'Factor Alpha',
    description: '多因子模型筛选优质标的，分散持仓',
    colorHex: '#4A9EFF',
  },
];

// ═══════════════════════════════════════════
// Scoring
// ═══════════════════════════════════════════

/**
 * 计算综合评分
 * 公式：夏普比率×0.4 + 年化收益×0.3 - |最大回撤|×0.3
 * 各分量先归一化到0-100范围
 */
function calcCompositeScore(r: RealBacktestResult): {
  composite: number;
  sharpe: number;
  returnS: number;
  drawdown: number;
} {
  // 夏普分量：假设夏普0-3为合理范围，归一化到0-100
  const sharpeScore = Math.min(100, Math.max(0, r.sharpeRatio / 3 * 100));

  // 年化收益分量：假设-20%到+50%为合理范围
  const returnScore = Math.min(100, Math.max(0, (r.annualizedReturn + 20) / 70 * 100));

  // 回撤分量：0回撤=100分，-30%回撤=0分
  const drawdownAbs = Math.abs(r.maxDrawdown);
  const drawdownScore = Math.max(0, 100 - (drawdownAbs / 30) * 100);

  // 加权综合
  const composite = sharpeScore * 0.4 + returnScore * 0.3 + drawdownScore * 0.3;

  return {
    composite: parseFloat(composite.toFixed(1)),
    sharpe: parseFloat(sharpeScore.toFixed(1)),
    returnS: parseFloat(returnScore.toFixed(1)),
    drawdown: parseFloat(drawdownScore.toFixed(1)),
  };
}

// ═══════════════════════════════════════════
// Main Engine
// ═══════════════════════════════════════════

/**
 * 运行自动匹配
 * @param code 股票代码（6位数字）
 * @param onProgress 进度回调 (current, total, strategyName)
 * @returns 排序后的策略匹配结果
 */
export async function runAutoMatch(
  code: string,
  onProgress?: (current: number, total: number, strategyName: string, yearRange: string) => void
): Promise<AutoMatchResult | null> {
  /** 默认回测时间范围：近3年（保证数据充足且反映近期市场特征） */
  const today = new Date();
  const startDate = new Date(today.getTime() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);
  const capital = 100000;

  const results: StrategyBacktestResult[] = [];
  let failedCount = 0;
  const total = MATCH_STRATEGIES.length;

  for (let i = 0; i < MATCH_STRATEGIES.length; i++) {
    const strategy = MATCH_STRATEGIES[i];

    if (onProgress) {
      onProgress(i + 1, total, strategy.name, `${startDate} 至 ${endDate}`);
    }

    try {
      // 使用真实历史数据运行回测
      const result = await runRealBacktest(
        code,
        strategy.key,
        startDate,
        endDate,
        capital
      );

      if (!result) {
        console.warn(`[AutoMatch] 策略 ${strategy.name} 回测无结果`);
        failedCount++;
        continue;
      }

      // 过滤掉交易次数太少的策略（数据不足）
      if (result.totalTrades < 3) {
        console.warn(`[AutoMatch] 策略 ${strategy.name} 交易次数不足(${result.totalTrades}次)`);
        // 仍然保留，但分数会较低
      }

      const scores = calcCompositeScore(result);

      results.push({
        strategy,
        result,
        compositeScore: scores.composite,
        sharpeScore: scores.sharpe,
        returnScore: scores.returnS,
        drawdownScore: scores.drawdown,
      });
    } catch (err) {
      console.warn(`[AutoMatch] 策略 ${strategy.name} 回测失败:`, err);
      failedCount++;
    }

    // 小延迟让UI有时间更新，避免阻塞
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // 如果没有成功的回测，返回null
  if (results.length === 0) {
    console.error('[AutoMatch] 所有策略回测均失败');
    return null;
  }

  // 按综合评分降序排序
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  return {
    rankings: results,
    primary: results[0],
    secondary: results[1] || results[0],
    tertiary: results[2] || results[1] || results[0],
    totalBacktests: total,
    failedBacktests: failedCount,
  };
}

/**
 * 快速估算匹配（不运行完整回测，仅基于指标特征）
 * 用于在回测前给出一个初步推荐
 */
export function quickEstimateMatch(
  volatility: number,
  momentum: number,
  pe: number,
  changePercent: number
): { primary: string; secondary: string; confidence: number } {
  let scores: Record<string, number> = {
    trend: 50,
    revert: 50,
    breakout: 50,
    factor: 50,
  };

  // 波动率偏好
  if (volatility > 25) {
    scores.breakout += 15;
    scores.trend += 10;
    scores.revert -= 5;
  } else if (volatility < 15) {
    scores.factor += 15;
    scores.revert += 10;
  }

  // 动量偏好
  if (momentum > 60) {
    scores.trend += 20;
    scores.breakout += 10;
  } else if (momentum < 40) {
    scores.revert += 15;
    scores.factor += 10;
  }

  // 估值偏好
  if (pe > 0 && pe < 15) {
    scores.factor += 15;
  } else if (pe > 40) {
    scores.trend += 10;
    scores.breakout += 10;
  }

  // 当日涨跌幅偏好
  if (Math.abs(changePercent) > 3) {
    scores.revert += 15;
  }

  // 排序取前两名
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const maxScore = sorted[0][1];
  const minScore = sorted[sorted.length - 1][1];
  const range = Math.max(maxScore - minScore, 10);
  const confidence = Math.min(95, Math.round(((maxScore - minScore) / range) * 50 + 50));

  return {
    primary: sorted[0][0],
    secondary: sorted[1][0],
    confidence,
  };
}
