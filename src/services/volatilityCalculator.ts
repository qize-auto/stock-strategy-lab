/* ═══════════════════════════════════════════════════════════════
   Volatility Calculator — 科学波动率计算模块

   A股无官方VIX期权产品，使用以下科学方法从价格序列
   推算"已实现波动率"(Realized Volatility)作为替代指标：

   1. Parkinson Volatility — 使用High/Low，比close-to-close更精确
      （利用日内价格波动信息，方差估计效率提升约5倍）

   2. Garman-Klass Volatility — 使用OHLC，估计效率最高
      （利用开盘、最高、最低、收盘四个价格信息，效率提升约8倍）

   3. Close-to-Close Volatility — 传统方法，仅使用收盘价
      （作为基准对比）

   参考：
   - Parkinson, M. (1980) "The Extreme Value Method for Estimating the Variance of the Rate of Return"
   - Garman, M. & Klass, M. (1980) "On the Estimation of Security Price Volatilities from Historical Data"
   ═══════════════════════════════════════════════════════════════ */

/** K线数据点（最小必要字段） */
export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 波动率计算结果 */
export interface VolatilityResult {
  /** Parkinson波动率（年化%） */
  parkinson: number;
  /** Garman-Klass波动率（年化%） */
  garmanKlass: number;
  /** Close-to-Close波动率（年化%） */
  closeToClose: number;
  /** 样本数量 */
  sampleSize: number;
  /** 推荐使用：GK > Parkinson > Close-to-Close */
  recommended: number;
  /** recommended 的来源方法 */
  recommendedMethod: 'Garman-Klass' | 'Parkinson' | 'Close-to-Close';
}

const LOG_2 = Math.log(2);

/**
 * 计算Parkinson波动率
 *
 * 使用日内最高价和最低价计算，比传统的close-to-close方法更精确，
 * 因为它利用了日内价格波动的信息。
 *
 * 公式：σ_p = sqrt( (1 / (4N * ln2)) * Σ(ln(high_i / low_i))^2 ) * sqrt(252) * 100
 *
 * @param data K线数据数组（需包含high和low字段），至少2天
 * @returns 年化Parkinson波动率（百分比，如25表示25%），数据不足返回null
 */
export function calculateParkinsonVolatility(data: Array<{ high: number; low: number }>): number | null {
  if (!data || data.length < 2) return null;

  let sum = 0;
  let validCount = 0;

  for (const bar of data) {
    const { high, low } = bar;
    if (high <= 0 || low <= 0 || high < low) continue;

    const logHL = Math.log(high / low);
    sum += logHL * logHL;
    validCount++;
  }

  if (validCount < 2) return null;

  const n = validCount;
  const variance = sum / (4 * n * LOG_2);
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252) * 100; // 年化，转为百分比

  return annualizedVol;
}

/**
 * 计算Garman-Klass波动率
 *
 * 使用开盘、最高、最低、收盘四个价格，是目前最高效的
 * 历史波动率估计方法（方差估计效率约为close-to-close的8倍）。
 *
 * 公式：
 *   σ_gk = sqrt( Σ(0.5 * (ln(high/low))^2 - (2ln2-1) * (ln(close/open))^2) / N ) * sqrt(252) * 100
 *
 * @param data K线数据数组（需包含open, high, low, close字段），至少2天
 * @returns 年化Garman-Klass波动率（百分比），数据不足返回null
 */
export function calculateGarmanKlassVolatility(data: OHLC[]): number | null {
  if (!data || data.length < 2) return null;

  const twoLog2Minus1 = 2 * LOG_2 - 1; // ≈ 0.386
  let sum = 0;
  let validCount = 0;

  for (const bar of data) {
    const { open, high, low, close } = bar;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < low) continue;

    const logHL = Math.log(high / low);
    const logCO = Math.log(close / open);
    const term = 0.5 * logHL * logHL - twoLog2Minus1 * logCO * logCO;

    sum += term;
    validCount++;
  }

  if (validCount < 2) return null;

  const variance = Math.max(sum / validCount, 0); // 防止数值误差导致负值
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252) * 100;

  return annualizedVol;
}

/**
 * 计算传统的Close-to-Close波动率
 *
 * 公式：σ_cc = sqrt( Σ((r_i - r̄)^2) / (N-1) ) * sqrt(252) * 100
 * 其中 r_i = ln(close_i / close_{i-1})
 *
 * @param closes 收盘价数组，至少2天
 * @returns 年化Close-to-Close波动率（百分比），数据不足返回null
 */
export function calculateCloseToCloseVolatility(closes: number[]): number | null {
  if (!closes || closes.length < 2) return null;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }

  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252) * 100;

  return annualizedVol;
}

/**
 * 综合波动率计算 — 使用最高效可用方法
 *
 * 优先级：Garman-Klass > Parkinson > Close-to-Close
 * 返回结果包含三种方法和推荐值
 *
 * @param klines 包含open/high/low/close的K线数组
 * @returns VolatilityResult 或 null（数据不足时）
 */
export function calculateVolatility(klines: OHLC[]): VolatilityResult | null {
  if (!klines || klines.length < 5) return null;

  const parkinson = calculateParkinsonVolatility(klines);
  const garmanKlass = calculateGarmanKlassVolatility(klines);
  const closeToClose = calculateCloseToCloseVolatility(klines.map((k) => k.close));

  // 选择推荐值：GK最优先
  let recommended: number;
  let recommendedMethod: VolatilityResult['recommendedMethod'];

  if (garmanKlass !== null && isFinite(garmanKlass) && garmanKlass > 0) {
    recommended = garmanKlass;
    recommendedMethod = 'Garman-Klass';
  } else if (parkinson !== null && isFinite(parkinson) && parkinson > 0) {
    recommended = parkinson;
    recommendedMethod = 'Parkinson';
  } else if (closeToClose !== null && isFinite(closeToClose) && closeToClose > 0) {
    recommended = closeToClose;
    recommendedMethod = 'Close-to-Close';
  } else {
    return null;
  }

  return {
    parkinson: parkinson ?? 0,
    garmanKlass: garmanKlass ?? 0,
    closeToClose: closeToClose ?? 0,
    sampleSize: klines.length,
    recommended,
    recommendedMethod,
  };
}

/**
 * 计算N日波动率的5日移动平均
 *
 * @param klines K线数据
 * @param window 滚动窗口天数（默认5）
 * @returns 波动率5日移动平均值
 */
export function calculateVolatilityMovingAverage(
  klines: OHLC[],
  window = 5,
): number | null {
  if (klines.length < window + 1) return null;

  const vols: number[] = [];
  for (let i = window - 1; i < klines.length; i++) {
    const slice = klines.slice(i - window + 1, i + 1);
    const vol = calculateGarmanKlassVolatility(slice);
    if (vol !== null) vols.push(vol);
  }

  if (vols.length === 0) return null;
  return vols.reduce((a, b) => a + b, 0) / vols.length;
}
