/**
 * ============================================================
 * factorLibrary.ts - 量化金融因子计算库
 * ============================================================
 * 基于 KLine 数据计算 40+ 个技术分析因子，覆盖八大类：
 *   1. 趋势类    2. 动量类    3. 波动率类   4. 量价类
 *   5. 资金流向类 6. 统计套利类 7. 复合因子   8. 统一接口
 * ============================================================
 */

import type { KLineData } from './stockApi';

// ────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────

/**
 * 滑动窗口简单移动平均 (Simple Moving Average)
 * @param data 数值数组
 * @param period 窗口长度
 * @returns 与输入等长的数组，前 period-1 位为 NaN
 */
export function sma(data: number[], period: number): number[] {
  if (period <= 0 || data.length === 0) return data.map(() => NaN);
  const res: number[] = new Array(data.length).fill(NaN);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (!Number.isNaN(data[i])) {
      sum += data[i];
      count++;
    }
    if (i >= period) {
      if (!Number.isNaN(data[i - period])) {
        sum -= data[i - period];
        count--;
      }
    }
    if (i >= period - 1 && count === period) {
      res[i] = sum / period;
    }
  }
  return res;
}

/**
 * 滑动窗口指数移动平均 (Exponential Moving Average)
 * @param data 数值数组
 * @param period 周期
 * @returns 与输入等长的数组
 */
export function ema(data: number[], period: number): number[] {
  if (period <= 0 || data.length === 0) return data.map(() => NaN);
  const k = 2 / (period + 1);
  const res: number[] = new Array(data.length).fill(NaN);
  let prev: number | undefined;
  for (let i = 0; i < data.length; i++) {
    if (Number.isNaN(data[i])) {
      res[i] = NaN;
      continue;
    }
    if (prev === undefined) {
      // 首个有效值用 SMA 初始化
      let sum = 0;
      let cnt = 0;
      for (let j = i; j >= 0 && cnt < period; j--) {
        if (!Number.isNaN(data[j])) {
          sum += data[j];
          cnt++;
        }
      }
      res[i] = cnt > 0 ? sum / cnt : data[i];
      prev = res[i];
    } else {
      res[i] = data[i] * k + prev * (1 - k);
      prev = res[i];
    }
  }
  return res;
}

/**
 * 滑动窗口标准差
 * @param data 数值数组
 * @param period 窗口长度
 * @returns 与输入等长的数组
 */
export function stdDev(data: number[], period: number): number[] {
  if (period <= 1 || data.length === 0) return data.map(() => NaN);
  const res: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    if (slice.length < 2) continue;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    res[i] = Math.sqrt(variance);
  }
  return res;
}

/**
 * 滑动窗口最大值
 * @param data 数值数组
 * @param period 窗口长度
 * @returns 与输入等长的数组
 */
export function max(data: number[], period: number): number[] {
  if (period <= 0 || data.length === 0) return data.map(() => NaN);
  const res: number[] = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    const slice = data.slice(Math.max(0, i - period + 1), i + 1).filter(v => !Number.isNaN(v));
    if (slice.length > 0) res[i] = Math.max(...slice);
  }
  return res;
}

/**
 * 滑动窗口最小值
 * @param data 数值数组
 * @param period 窗口长度
 * @returns 与输入等长的数组
 */
export function min(data: number[], period: number): number[] {
  if (period <= 0 || data.length === 0) return data.map(() => NaN);
  const res: number[] = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    const slice = data.slice(Math.max(0, i - period + 1), i + 1).filter(v => !Number.isNaN(v));
    if (slice.length > 0) res[i] = Math.min(...slice);
  }
  return res;
}

/**
 * 滑动窗口求和
 * @param data 数值数组
 * @param period 窗口长度
 * @returns 与输入等长的数组
 */
export function sum(data: number[], period: number): number[] {
  if (period <= 0 || data.length === 0) return data.map(() => NaN);
  const res: number[] = new Array(data.length).fill(NaN);
  let s = 0;
  let cnt = 0;
  for (let i = 0; i < data.length; i++) {
    if (!Number.isNaN(data[i])) {
      s += data[i];
      cnt++;
    }
    const outIdx = i - period;
    if (outIdx >= 0 && !Number.isNaN(data[outIdx])) {
      s -= data[outIdx];
      cnt--;
    }
    if (i >= period - 1) res[i] = s;
  }
  return res;
}

/**
 * 真实波幅 (True Range)
 * @param klines K线数组
 * @returns 真实波幅数组
 */
export function trueRange(klines: KLineData[]): number[] {
  if (klines.length === 0) return [];
  const res: number[] = new Array(klines.length).fill(NaN);
  res[0] = klines[0].high - klines[0].low;
  for (let i = 1; i < klines.length; i++) {
    const h = klines[i].high;
    const l = klines[i].low;
    const prevClose = klines[i - 1].close;
    res[i] = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
  }
  return res;
}

/**
 * 确定性伪随机数生成器（线性同余法）
 * @param seed 种子值
 * @returns 生成器函数，每次调用返回 [0, 1) 区间的伪随机数
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ────────────────────────────────────────────────
// 1. 趋势类因子
// ────────────────────────────────────────────────

/**
 * 收盘价简单均线 (Moving Average on Close)
 * @param klines K线数据
 * @param period 均线周期
 * @returns 均线序列
 */
export function ma_close(klines: KLineData[], period: number): number[] {
  const closes = klines.map(k => k.close);
  return sma(closes, period);
}

/**
 * 收盘价指数均线 (Exponential Moving Average on Close)
 * @param klines K线数据
 * @param period 均线周期
 * @returns EMA序列
 */
export function ema_close(klines: KLineData[], period: number): number[] {
  const closes = klines.map(k => k.close);
  return ema(closes, period);
}

/**
 * MACD 指标
 * 快线 DIF = EMA(12) - EMA(26)，慢线 DEA = EMA(DIF, 9)，柱状图 = 2*(DIF-DEA)
 * @param klines K线数据
 * @returns { dif, dea, hist } 序列
 */
export function macd(klines: KLineData[]): { dif: number[]; dea: number[]; hist: number[] } {
  const closes = klines.map(k => k.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif: number[] = new Array(klines.length).fill(NaN);
  for (let i = 0; i < klines.length; i++) {
    if (!Number.isNaN(ema12[i]) && !Number.isNaN(ema26[i])) {
      dif[i] = ema12[i] - ema26[i];
    }
  }
  const dea = ema(dif, 9);
  const hist: number[] = new Array(klines.length).fill(NaN);
  for (let i = 0; i < klines.length; i++) {
    if (!Number.isNaN(dif[i]) && !Number.isNaN(dea[i])) {
      hist[i] = 2 * (dif[i] - dea[i]);
    }
  }
  return { dif, dea, hist };
}

/**
 * 趋势强度因子：近N日涨跌幅的标准化度量
 * 取近20日累计涨跌幅除以其标准差
 * @param klines K线数据
 * @returns 趋势强度序列
 */
export function trend_strength(klines: KLineData[]): number[] {
  const period = 20;
  if (klines.length < 2) return new Array(klines.length).fill(NaN);
  const returns: number[] = new Array(klines.length).fill(NaN);
  for (let i = 1; i < klines.length; i++) {
    returns[i] = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
  }
  const res: number[] = new Array(klines.length).fill(NaN);
  for (let i = period; i < klines.length; i++) {
    const slice = returns.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    if (slice.length < 2) continue;
    const totalRet = slice.reduce((a, b) => a + b, 0);
    const mean = totalRet / slice.length;
    const vol = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    res[i] = vol === 0 ? 0 : totalRet / vol;
  }
  return res;
}

/**
 * ADX 平均趋向指数
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns ADX序列
 */
export function adx(klines: KLineData[], period: number = 14): number[] {
  if (klines.length < period + 1) return new Array(klines.length).fill(NaN);
  const n = klines.length;
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = klines[i].high - klines[i - 1].high;
    const downMove = klines[i - 1].low - klines[i].low;
    if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
    if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
  }
  const atrArr = atr(klines, period);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  const dx: number[] = new Array(n).fill(NaN);
  // 使用平滑后的DM和ATR
  const smPlusDM = ema(plusDM, period);
  const smMinusDM = ema(minusDM, period);
  const smATR = atrArr; // atr 已经是 EMA 平滑
  for (let i = period; i < n; i++) {
    if (smATR[i] && smATR[i] > 0) {
      plusDI[i] = (smPlusDM[i] / smATR[i]) * 100;
      minusDI[i] = (smMinusDM[i] / smATR[i]) * 100;
      const diDiff = Math.abs(plusDI[i] - minusDI[i]);
      const diSum = plusDI[i] + minusDI[i];
      dx[i] = diSum === 0 ? 0 : (diDiff / diSum) * 100;
    }
  }
  const adxVal = ema(dx, period);
  return adxVal;
}

/**
 * Aroon 指标
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns { aroonUp, aroonDown } 序列
 */
export function aroon(klines: KLineData[], period: number = 14): { aroonUp: number[]; aroonDown: number[] } {
  const n = klines.length;
  const aroonUp: number[] = new Array(n).fill(NaN);
  const aroonDown: number[] = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    let maxIdx = i - period;
    let minIdx = i - period;
    let maxVal = klines[maxIdx].high;
    let minVal = klines[minIdx].low;
    for (let j = i - period + 1; j <= i; j++) {
      if (klines[j].high >= maxVal) { maxVal = klines[j].high; maxIdx = j; }
      if (klines[j].low <= minVal) { minVal = klines[j].low; minIdx = j; }
    }
    aroonUp[i] = ((period - (i - maxIdx)) / period) * 100;
    aroonDown[i] = ((period - (i - minIdx)) / period) * 100;
  }
  return { aroonUp, aroonDown };
}

/**
 * DPO 区间震荡线（去趋势价格）
 * 当前价格减去前 N/2+1 期的 MA
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns DPO序列
 */
export function dpo(klines: KLineData[], period: number = 20): number[] {
  const closes = klines.map(k => k.close);
  const maArr = sma(closes, period);
  const shift = Math.floor(period / 2) + 1;
  const res: number[] = new Array(klines.length).fill(NaN);
  for (let i = shift; i < klines.length; i++) {
    if (!Number.isNaN(maArr[i - shift])) {
      res[i] = closes[i] - maArr[i - shift];
    }
  }
  return res;
}

/**
 * CCI 商品通道指数
 * CCI = (TP - SMA(TP, period)) / (0.015 * MeanDev)
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns CCI序列
 */
export function cci(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const tp: number[] = klines.map(k => (k.high + k.low + k.close) / 3);
  const tpMa = sma(tp, period);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const mean = tpMa[i];
    if (Number.isNaN(mean)) continue;
    const meanDev = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
    res[i] = meanDev === 0 ? 0 : (tp[i] - mean) / (0.015 * meanDev);
  }
  return res;
}

// ────────────────────────────────────────────────
// 2. 动量类因子
// ────────────────────────────────────────────────

/**
 * RSI 相对强弱指标
 * RSI = 100 - 100 / (1 + RS), RS = 平均涨幅 / 平均跌幅
 * @param klines K线数据
 * @param period 周期（默认6）
 * @returns RSI序列
 */
export function rsi(klines: KLineData[], period: number = 6): number[] {
  const n = klines.length;
  if (n < 2) return new Array(n).fill(NaN);
  const changes: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    changes[i] = klines[i].close - klines[i - 1].close;
  }
  const res: number[] = new Array(n).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  // 初始化
  let count = 0;
  for (let i = 1; i < n && count < period; i++) {
    if (!Number.isNaN(changes[i])) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
      count++;
    }
  }
  if (count === period) {
    avgGain /= period;
    avgLoss /= period;
  }
  for (let i = period; i < n; i++) {
    const change = changes[i];
    if (!Number.isNaN(change)) {
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) {
      res[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      res[i] = 100 - 100 / (1 + rs);
    }
  }
  return res;
}

/**
 * KDJ 随机指标
 * RSV = (close - LLV(low,9)) / (HHV(high,9) - LLV(low,9)) * 100
 * K = EMA(RSV, 3), D = EMA(K, 3), J = 3K - 2D
 * @param klines K线数据
 * @returns { k, d, j } 序列
 */
export function kdj(klines: KLineData[]): { k: number[]; d: number[]; j: number[] } {
  const n = klines.length;
  const period = 9;
  const rsv: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const lows = klines.slice(i - period + 1, i + 1).map(k => k.low);
    const highs = klines.slice(i - period + 1, i + 1).map(k => k.high);
    const llv = Math.min(...lows);
    const hhv = Math.max(...highs);
    const denom = hhv - llv;
    if (denom !== 0) {
      rsv[i] = ((klines[i].close - llv) / denom) * 100;
    }
  }
  const k = ema(rsv, 3);
  const d = ema(k, 3);
  const j: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(k[i]) && !Number.isNaN(d[i])) {
      j[i] = 3 * k[i] - 2 * d[i];
    }
  }
  return { k, d, j };
}

/**
 * 动量因子（当前价 - N日前价格）
 * @param klines K线数据
 * @param period 周期（默认10）
 * @returns 动量序列
 */
export function momentum(klines: KLineData[], period: number = 10): number[] {
  const closes = klines.map(k => k.close);
  const res: number[] = new Array(klines.length).fill(NaN);
  for (let i = period; i < klines.length; i++) {
    res[i] = closes[i] - closes[i - period];
  }
  return res;
}

/**
 * ROC 变动率 (Rate of Change)
 * ROC = (close - close[n]) / close[n] * 100
 * @param klines K线数据
 * @param period 周期（默认10）
 * @returns ROC序列
 */
export function roc(klines: KLineData[], period: number = 10): number[] {
  const closes = klines.map(k => k.close);
  const res: number[] = new Array(klines.length).fill(NaN);
  for (let i = period; i < klines.length; i++) {
    if (closes[i - period] !== 0) {
      res[i] = ((closes[i] - closes[i - period]) / closes[i - period]) * 100;
    }
  }
  return res;
}

/**
 * Williams %R 威廉指标
 * %R = (HHV - close) / (HHV - LLV) * -100
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns Williams %R序列
 */
export function williams_r(klines: KLineData[], period: number = 14): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const highs = klines.slice(i - period + 1, i + 1).map(k => k.high);
    const lows = klines.slice(i - period + 1, i + 1).map(k => k.low);
    const hhv = Math.max(...highs);
    const llv = Math.min(...lows);
    const denom = hhv - llv;
    if (denom !== 0) {
      res[i] = ((hhv - klines[i].close) / denom) * -100;
    }
  }
  return res;
}

/**
 * TSI 真实强度指数
 * TSI = 100 * EMA(EMA(PC, r), s) / EMA(EMA(|PC|, r), s)
 * @param klines K线数据
 * @param r 长周期平滑（默认25）
 * @param s 短周期平滑（默认13）
 * @returns TSI序列
 */
export function tsi(klines: KLineData[], r: number = 25, s: number = 13): number[] {
  const n = klines.length;
  if (n < 2) return new Array(n).fill(NaN);
  const pc: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    pc[i] = klines[i].close - klines[i - 1].close;
  }
  const absPC = pc.map(v => Number.isNaN(v) ? NaN : Math.abs(v));
  // 简化处理：对 PC 序列（首位置0）做双重EMA
  const pcClean = pc.map(v => Number.isNaN(v) ? 0 : v);
  const absPCClean = absPC.map(v => Number.isNaN(v) ? 0 : v);
  const emaPC_r = ema(pcClean, r);
  const emaAbsPC_r = ema(absPCClean, r);
  const emaPC_s = ema(emaPC_r, s);
  const emaAbsPC_s = ema(emaAbsPC_r, s);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(emaPC_s[i]) && !Number.isNaN(emaAbsPC_s[i]) && emaAbsPC_s[i] !== 0) {
      res[i] = 100 * (emaPC_s[i] / emaAbsPC_s[i]);
    }
  }
  return res;
}

// ────────────────────────────────────────────────
// 3. 波动率类因子
// ────────────────────────────────────────────────

/**
 * ATR 平均真实波幅
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns ATR序列
 */
export function atr(klines: KLineData[], period: number = 14): number[] {
  const trArr = trueRange(klines);
  return ema(trArr, period);
}

/**
 * 布林带 (Bollinger Bands)
 * mid = SMA(close, period), upper = mid + stdDev * k, lower = mid - stdDev * k
 * @param klines K线数据
 * @param period 周期（默认20）
 * @param stdDevMul 标准差倍数（默认2）
 * @returns { upper, mid, lower } 序列
 */
export function bollinger_bands(
  klines: KLineData[],
  period: number = 20,
  stdDevMul: number = 2,
): { upper: number[]; mid: number[]; lower: number[] } {
  const closes = klines.map(k => k.close);
  const mid = sma(closes, period);
  const sd = stdDev(closes, period);
  const n = klines.length;
  const upper: number[] = new Array(n).fill(NaN);
  const lower: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(mid[i]) && !Number.isNaN(sd[i])) {
      upper[i] = mid[i] + stdDevMul * sd[i];
      lower[i] = mid[i] - stdDevMul * sd[i];
    }
  }
  return { upper, mid, lower };
}

/**
 * 肯特纳通道 (Keltner Channel)
 * mid = EMA(close, period), upper = mid + atr * mult, lower = mid - atr * mult
 * @param klines K线数据
 * @param period 周期（默认20）
 * @param atrMult ATR倍数（默认2）
 * @returns { upper, mid, lower } 序列
 */
export function keltner_channel(
  klines: KLineData[],
  period: number = 20,
  atrMult: number = 2,
): { upper: number[]; mid: number[]; lower: number[] } {
  const closes = klines.map(k => k.close);
  const mid = ema(closes, period);
  const atrArr = atr(klines, period);
  const n = klines.length;
  const upper: number[] = new Array(n).fill(NaN);
  const lower: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(mid[i]) && !Number.isNaN(atrArr[i])) {
      upper[i] = mid[i] + atrMult * atrArr[i];
      lower[i] = mid[i] - atrMult * atrArr[i];
    }
  }
  return { upper, mid, lower };
}

/**
 * 历史波动率（收益率标准差）
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns 波动率序列
 */
export function volatility(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  if (n < 2) return new Array(n).fill(NaN);
  const returns: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    returns[i] = Math.log(klines[i].close / klines[i - 1].close);
  }
  return stdDev(returns, period);
}

/**
 * Chaikin 波动率
 * 衡量 EMA(high-low) 的 ROC
 * @param klines K线数据
 * @returns Chaikin波动率序列
 */
export function chaikin_volatility(klines: KLineData[]): number[] {
  const n = klines.length;
  const hlRange = klines.map(k => k.high - k.low);
  const emaHL = ema(hlRange, 10);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 10; i < n; i++) {
    if (!Number.isNaN(emaHL[i]) && !Number.isNaN(emaHL[i - 10]) && emaHL[i - 10] !== 0) {
      res[i] = ((emaHL[i] - emaHL[i - 10]) / emaHL[i - 10]) * 100;
    }
  }
  return res;
}

/**
 * 溃疡指数（下行波动度量）
 * UI = sqrt(sum((close - maxClose)^2 / period))
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns 溃疡指数序列
 */
export function ulcer_index(klines: KLineData[], period: number = 14): number[] {
  const n = klines.length;
  const closes = klines.map(k => k.close);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let maxClose = closes[i - period + 1];
    for (let j = i - period + 2; j <= i; j++) {
      if (closes[j] > maxClose) maxClose = closes[j];
    }
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const pct = (closes[j] - maxClose) / maxClose * 100;
      sqSum += pct * pct;
    }
    res[i] = Math.sqrt(sqSum / period);
  }
  return res;
}

// ────────────────────────────────────────────────
// 4. 量价类因子
// ────────────────────────────────────────────────

/**
 * 成交量均线
 * @param klines K线数据
 * @param period 周期（默认5）
 * @returns 成交量均线序列
 */
export function volume_ma(klines: KLineData[], period: number = 5): number[] {
  const volumes = klines.map(k => k.volume);
  return sma(volumes, period);
}

/**
 * 量比（当前成交量 / N期均量）
 * @param klines K线数据
 * @param period 周期（默认5）
 * @returns 量比序列
 */
export function volume_ratio(klines: KLineData[], period: number = 5): number[] {
  const volumes = klines.map(k => k.volume);
  const volMa = sma(volumes, period);
  const res: number[] = new Array(klines.length).fill(NaN);
  for (let i = 0; i < klines.length; i++) {
    if (!Number.isNaN(volMa[i]) && volMa[i] !== 0) {
      res[i] = volumes[i] / volMa[i];
    }
  }
  return res;
}

/**
 * OBV 能量潮（On Balance Volume）
 * 涨则加量，跌则减量
 * @param klines K线数据
 * @returns OBV序列
 */
export function obv(klines: KLineData[]): number[] {
  const n = klines.length;
  if (n === 0) return [];
  const res: number[] = new Array(n).fill(NaN);
  res[0] = klines[0].volume;
  for (let i = 1; i < n; i++) {
    if (klines[i].close > klines[i - 1].close) {
      res[i] = res[i - 1] + klines[i].volume;
    } else if (klines[i].close < klines[i - 1].close) {
      res[i] = res[i - 1] - klines[i].volume;
    } else {
      res[i] = res[i - 1];
    }
  }
  return res;
}

/**
 * VWMA 成交量加权均线
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns VWMA序列
 */
export function vwma(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let volSum = 0;
    let pvSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      volSum += klines[j].volume;
      pvSum += klines[j].close * klines[j].volume;
    }
    if (volSum !== 0) {
      res[i] = pvSum / volSum;
    }
  }
  return res;
}

/**
 * MFI 资金流量指标（Money Flow Index）
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns MFI序列
 */
export function mfi(klines: KLineData[], period: number = 14): number[] {
  const n = klines.length;
  const tp: number[] = klines.map(k => (k.high + k.low + k.close) / 3);
  const rawMF: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    rawMF[i] = tp[i] * klines[i].volume;
  }
  const res: number[] = new Array(n).fill(NaN);
  let posFlow = 0;
  let negFlow = 0;
  for (let i = 1; i < n && i <= period; i++) {
    if (!Number.isNaN(tp[i]) && !Number.isNaN(tp[i - 1])) {
      if (tp[i] > tp[i - 1]) posFlow += rawMF[i];
      else if (tp[i] < tp[i - 1]) negFlow += rawMF[i];
    }
  }
  for (let i = period; i < n; i++) {
    if (negFlow === 0) {
      res[i] = 100;
    } else {
      const mr = posFlow / negFlow;
      res[i] = 100 - 100 / (1 + mr);
    }
    // 滑动窗口更新
    const outIdx = i - period + 1;
    if (outIdx >= 1) {
      if (tp[outIdx] > tp[outIdx - 1]) posFlow -= rawMF[outIdx];
      else if (tp[outIdx] < tp[outIdx - 1]) negFlow -= rawMF[outIdx];
    }
    if (i + 1 < n) {
      if (tp[i + 1] > tp[i]) posFlow += rawMF[i + 1];
      else if (tp[i + 1] < tp[i]) negFlow += rawMF[i + 1];
    }
  }
  return res;
}

/**
 * CMF 柴金资金流量（Chaikin Money Flow）
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns CMF序列
 */
export function cmf(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const mfv: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const range = klines[i].high - klines[i].low;
    if (range !== 0) {
      mfv[i] = ((klines[i].close - klines[i].low) - (klines[i].high - klines[i].close)) / range * klines[i].volume;
    } else {
      mfv[i] = 0;
    }
  }
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const volSum = klines.slice(i - period + 1, i + 1).reduce((a, k) => a + k.volume, 0);
    const mfvSum = mfv.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    if (volSum !== 0) {
      res[i] = mfvSum / volSum;
    }
  }
  return res;
}

/**
 * A/D 累积派发线（Accumulation/Distribution Line）
 * @param klines K线数据
 * @returns A/D线序列
 */
export function ad_line(klines: KLineData[]): number[] {
  const n = klines.length;
  if (n === 0) return [];
  const res: number[] = new Array(n).fill(NaN);
  let adl = 0;
  for (let i = 0; i < n; i++) {
    const range = klines[i].high - klines[i].low;
    if (range !== 0) {
      const mfv = ((klines[i].close - klines[i].low) - (klines[i].high - klines[i].close)) / range * klines[i].volume;
      adl += mfv;
    }
    res[i] = adl;
  }
  return res;
}

/**
 * 力量指数（Force Index）
 * @param klines K线数据
 * @param period 周期（默认13）
 * @returns 力量指数序列
 */
export function force_index(klines: KLineData[], period: number = 13): number[] {
  const n = klines.length;
  const raw: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    raw[i] = (klines[i].close - klines[i - 1].close) * klines[i].volume;
  }
  return ema(raw, period);
}

// ────────────────────────────────────────────────
// 5. 资金流向类因子
// ────────────────────────────────────────────────

/**
 * 资金流（正/负/净资金流比率）
 * @param klines K线数据
 * @param period 周期（默认14）
 * @returns 净资金流比率序列
 */
export function money_flow(klines: KLineData[], period: number = 14): number[] {
  const n = klines.length;
  const tp: number[] = klines.map(k => (k.high + k.low + k.close) / 3);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    let posMF = 0;
    let negMF = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (!Number.isNaN(tp[j]) && !Number.isNaN(tp[j - 1])) {
        if (tp[j] > tp[j - 1]) posMF += tp[j] * klines[j].volume;
        else negMF += tp[j] * klines[j].volume;
      }
    }
    const total = posMF + negMF;
    if (total !== 0) {
      res[i] = (posMF - negMF) / total;
    }
  }
  return res;
}

/**
 * 买盘压力（上影线比例）
 * 衡量买方将价格推高至高点的能力
 * @param klines K线数据
 * @returns 买盘压力序列
 */
export function buy_pressure(klines: KLineData[]): number[] {
  return klines.map(k => {
    const range = k.high - k.low;
    if (range === 0) return 0;
    const bodyTop = Math.max(k.open, k.close);
    return (k.high - bodyTop) / range;
  });
}

/**
 * 卖盘压力（下影线比例）
 * 衡量卖方将价格推低至低点的能力
 * @param klines K线数据
 * @returns 卖盘压力序列
 */
export function sell_pressure(klines: KLineData[]): number[] {
  return klines.map(k => {
    const range = k.high - k.low;
    if (range === 0) return 0;
    const bodyBottom = Math.min(k.open, k.close);
    return (bodyBottom - k.low) / range;
  });
}

/**
 * 日内动量（close-open 标准化）
 * 衡量日内收盘相对开盘的强势程度
 * @param klines K线数据
 * @returns 日内动量序列
 */
export function intraday_momentum(klines: KLineData[]): number[] {
  return klines.map(k => {
    const range = k.high - k.low;
    if (range === 0) return 0;
    return (k.close - k.open) / range;
  });
}

/**
 * 量价趋势（Volume Price Trend）
 * VPT 累积：(close - prevClose) / prevClose * volume
 * @param klines K线数据
 * @returns VPT序列
 */
export function volume_price_trend(klines: KLineData[]): number[] {
  const n = klines.length;
  if (n === 0) return [];
  const res: number[] = new Array(n).fill(NaN);
  res[0] = 0;
  for (let i = 1; i < n; i++) {
    if (klines[i - 1].close !== 0) {
      const pctChange = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
      res[i] = res[i - 1] + pctChange * klines[i].volume;
    } else {
      res[i] = res[i - 1];
    }
  }
  return res;
}

// ────────────────────────────────────────────────
// 6. 统计套利类因子
// ────────────────────────────────────────────────

/**
 * Z分数（价格偏离度）
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns Z分数序列
 */
export function z_score(klines: KLineData[], period: number = 20): number[] {
  const closes = klines.map(k => k.close);
  const n = closes.length;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    if (sd !== 0) {
      res[i] = (closes[i] - mean) / sd;
    }
  }
  return res;
}

/**
 * %B 指标（价格在布林带中的位置）
 * %B = (close - lower) / (upper - lower)
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns %B序列
 */
export function percent_b(klines: KLineData[], period: number = 20): number[] {
  const closes = klines.map(k => k.close);
  const bb = bollinger_bands(klines, period, 2);
  const res: number[] = new Array(klines.length).fill(NaN);
  for (let i = 0; i < klines.length; i++) {
    const width = bb.upper[i] - bb.lower[i];
    if (!Number.isNaN(width) && width !== 0) {
      res[i] = (closes[i] - bb.lower[i]) / width;
    }
  }
  return res;
}

/**
 * 线性回归（斜率、截距、R²）
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns { slope, intercept, r2 } 序列
 */
export function linear_regression(
  klines: KLineData[],
  period: number = 20,
): { slope: number[]; intercept: number[]; r2: number[] } {
  const closes = klines.map(k => k.close);
  const n = closes.length;
  const slope: number[] = new Array(n).fill(NaN);
  const intercept: number[] = new Array(n).fill(NaN);
  const r2: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const xMean = (period - 1) / 2;
    let yMean = 0;
    for (let j = 0; j < period; j++) yMean += slice[j];
    yMean /= period;
    let ssXX = 0;
    let ssXY = 0;
    let ssYY = 0;
    for (let j = 0; j < period; j++) {
      const xDev = j - xMean;
      const yDev = slice[j] - yMean;
      ssXX += xDev * xDev;
      ssXY += xDev * yDev;
      ssYY += yDev * yDev;
    }
    if (ssXX !== 0) {
      slope[i] = ssXY / ssXX;
      intercept[i] = yMean - slope[i] * xMean;
      if (ssYY !== 0) {
        r2[i] = (ssXY * ssXY) / (ssXX * ssYY);
      }
    }
  }
  return { slope, intercept, r2 };
}

/**
 * 赫斯特指数（Hurst Exponent）
 * 判断序列是趋势型（H>0.5）、均值回归型（H<0.5）还是随机游走（H=0.5）
 * @param klines K线数据
 * @param maxLag 最大滞后阶数（默认100）
 * @returns 赫斯特指数序列
 */
export function hurst_exponent(klines: KLineData[], maxLag: number = 100): number[] {
  const closes = klines.map(k => k.close);
  const n = closes.length;
  const res: number[] = new Array(n).fill(NaN);
  if (n < maxLag + 1) return res;
  for (let i = maxLag; i < n; i++) {
    const slice = closes.slice(i - maxLag + 1, i + 1);
    const tau: number[] = [];
    const lagVec: number[] = [];
    // 使用对数收益率
    const lags = [2, 4, 8, 16, 32, 64].filter(l => l < maxLag);
    for (const lag of lags) {
      const rsValues: number[] = [];
      const chunkSize = Math.floor(slice.length / lag);
      for (let chunk = 0; chunk < chunkSize; chunk++) {
        const subSlice = slice.slice(chunk * lag, (chunk + 1) * lag);
        const mean = subSlice.reduce((a, b) => a + b, 0) / subSlice.length;
        const cumDevs: number[] = [];
        let cumSum = 0;
        for (const val of subSlice) {
          cumSum += val - mean;
          cumDevs.push(cumSum);
        }
        const range = Math.max(...cumDevs) - Math.min(...cumDevs);
        const sd = Math.sqrt(subSlice.reduce((a, b) => a + (b - mean) ** 2, 0) / subSlice.length);
        if (sd !== 0) rsValues.push(range / sd);
      }
      if (rsValues.length > 0) {
        tau.push(Math.log(rsValues.reduce((a, b) => a + b, 0) / rsValues.length));
        lagVec.push(Math.log(lag));
      }
    }
    if (lagVec.length >= 2) {
      const lMean = lagVec.reduce((a, b) => a + b, 0) / lagVec.length;
      const tMean = tau.reduce((a, b) => a + b, 0) / tau.length;
      let lt = 0;
      let ll = 0;
      for (let j = 0; j < lagVec.length; j++) {
        lt += (lagVec[j] - lMean) * (tau[j] - tMean);
        ll += (lagVec[j] - lMean) ** 2;
      }
      if (ll !== 0) {
        res[i] = lt / ll;
      }
    }
  }
  return res;
}

/**
 * 收益率偏度（Skewness）
 * 衡量收益率分布的不对称性
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns 偏度序列
 */
export function skewness(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  if (n < 2) return new Array(n).fill(NaN);
  const returns: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    returns[i] = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
  }
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    const slice = returns.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    if (slice.length < 3) continue;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    if (sd === 0) {
      res[i] = 0;
      continue;
    }
    let m3 = 0;
    for (const v of slice) {
      m3 += (v - mean) ** 3;
    }
    m3 /= slice.length;
    res[i] = m3 / (sd ** 3);
  }
  return res;
}

// ────────────────────────────────────────────────
// 7. 复合因子
// ────────────────────────────────────────────────

/**
 * 复合趋势因子（多均线+MACD综合）
 * 综合 ma5>ma10>ma20 多头排列 + MACD正值 + 趋势强度
 * @param klines K线数据
 * @returns 复合趋势序列（-1 到 1）
 */
export function composite_trend(klines: KLineData[]): number[] {
  const n = klines.length;
  const ma5 = ma_close(klines, 5);
  const ma10 = ma_close(klines, 10);
  const ma20 = ma_close(klines, 20);
  const macdVal = macd(klines);
  const strength = trend_strength(klines);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let score = 0;
    // 均线排列
    if (!Number.isNaN(ma5[i]) && !Number.isNaN(ma10[i]) && ma5[i] > ma10[i]) score += 0.25;
    if (!Number.isNaN(ma10[i]) && !Number.isNaN(ma20[i]) && ma10[i] > ma20[i]) score += 0.25;
    // MACD
    if (!Number.isNaN(macdVal.hist[i]) && macdVal.hist[i] > 0) score += 0.25;
    // 趋势强度标准化到 [-1, 1]
    let str = 0;
    if (!Number.isNaN(strength[i])) {
      str = Math.tanh(strength[i] * 0.1); // 压缩到合理范围
    }
    score += str * 0.25;
    res[i] = score * 2 - 1; // 映射到 [-1, 1]
  }
  return res;
}

/**
 * 复合动量因子（RSI+KDJ+威廉综合）
 * @param klines K线数据
 * @returns 复合动量序列（-1 到 1）
 */
export function composite_momentum(klines: KLineData[]): number[] {
  const n = klines.length;
  const rsi6 = rsi(klines, 6);
  const kdjVal = kdj(klines);
  const wr = williams_r(klines, 14);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let score = 0;
    // RSI (50为中性)
    if (!Number.isNaN(rsi6[i])) score += (rsi6[i] - 50) / 50 * 0.4;
    // KDJ K值 (50为中性)
    if (!Number.isNaN(kdjVal.k[i])) score += (kdjVal.k[i] - 50) / 50 * 0.35;
    // 威廉指标 (-50为中性，范围-100到0)
    if (!Number.isNaN(wr[i])) score += ((-wr[i]) - 50) / 50 * 0.25;
    res[i] = Math.max(-1, Math.min(1, score));
  }
  return res;
}

/**
 * 复合波动因子（ATR+布林带宽度）
 * @param klines K线数据
 * @returns 复合波动序列
 */
export function composite_volatility(klines: KLineData[]): number[] {
  const n = klines.length;
  const atr14 = atr(klines, 14);
  const bb = bollinger_bands(klines, 20, 2);
  const closes = klines.map(k => k.close);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let score = 0;
    let count = 0;
    // ATR 相对值
    if (!Number.isNaN(atr14[i]) && closes[i] !== 0) {
      score += (atr14[i] / closes[i]) * 100;
      count++;
    }
    // 布林带宽度
    if (!Number.isNaN(bb.mid[i]) && bb.mid[i] !== 0) {
      const width = (bb.upper[i] - bb.lower[i]) / bb.mid[i];
      score += width * 50;
      count++;
    }
    if (count > 0) {
      res[i] = score / count;
    }
  }
  return res;
}

/**
 * 复合量能因子（量比+OBV+MFI综合）
 * @param klines K线数据
 * @returns 复合量能序列
 */
export function composite_volume(klines: KLineData[]): number[] {
  const n = klines.length;
  const vr = volume_ratio(klines, 5);
  const obvVal = obv(klines);
  const mfiVal = mfi(klines, 14);
  // OBV标准化
  const obvMean = obvVal.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0) / obvVal.filter(v => !Number.isNaN(v)).length || 1;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let score = 0;
    let count = 0;
    // 量比（偏离1的程度）
    if (!Number.isNaN(vr[i])) {
      score += (vr[i] - 1) * 0.4;
      count++;
    }
    // OBV 变化率
    if (!Number.isNaN(obvVal[i]) && obvMean !== 0) {
      score += (obvVal[i] - obvMean) / Math.abs(obvMean) * 0.35;
      count++;
    }
    // MFI 偏离50
    if (!Number.isNaN(mfiVal[i])) {
      score += (mfiVal[i] - 50) / 50 * 0.25;
      count++;
    }
    if (count > 0) {
      res[i] = Math.max(-1, Math.min(1, score));
    }
  }
  return res;
}

// ────────────────────────────────────────────────
// 8. 统一接口
// ────────────────────────────────────────────────

export interface FactorValues {
  // 趋势
  ma5: number; ma10: number; ma20: number; ma60: number;
  ema12: number; ema26: number;
  macdDif: number; macdDea: number; macdHist: number;
  trendStrength: number;
  adx: number;
  aroonUp: number; aroonDown: number;
  dpo: number;
  cci: number;
  // 动量
  rsi6: number; rsi12: number; rsi24: number;
  kdjK: number; kdjD: number; kdjJ: number;
  momentum10: number;
  roc10: number;
  williamsR: number;
  tsi: number;
  // 波动率
  atr14: number;
  bbUpper: number; bbMid: number; bbLower: number;
  bbWidth: number; bbPercentB: number;
  keltnerUpper: number; keltnerLower: number;
  volatility20: number;
  chaikinVol: number;
  ulcerIndex: number;
  // 量价
  volMa5: number; volMa20: number;
  volumeRatio: number;
  obv: number;
  vwma20: number;
  mfi: number;
  cmf: number;
  adLine: number;
  forceIndex: number;
  // 资金流向
  moneyFlow: number;
  buyPressure: number;
  sellPressure: number;
  intradayMomentum: number;
  vpt: number;
  // 统计
  zScore20: number;
  percentB: number;
  linRegSlope: number; linRegR2: number;
  hurst: number;
  skewness20: number;
  // 复合
  compTrend: number;
  compMomentum: number;
  compVolatility: number;
  compVolume: number;
}

/**
 * 计算所有因子，返回最新值
 * @param klines K线数据
 * @returns 所有因子的最新值
 */
export function calculateAllFactors(klines: KLineData[]): FactorValues {
  const last = (arr: number[]): number => {
    if (arr.length === 0) return NaN;
    return arr[arr.length - 1];
  };
  // lastObj helper available if needed for batch extraction

  // 趋势
  const ma5Arr = ma_close(klines, 5);
  const ma10Arr = ma_close(klines, 10);
  const ma20Arr = ma_close(klines, 20);
  const ma60Arr = ma_close(klines, 60);
  const ema12Arr = ema_close(klines, 12);
  const ema26Arr = ema_close(klines, 26);
  const macdVal = macd(klines);
  const trendStrArr = trend_strength(klines);
  const adxArr = adx(klines, 14);
  const aroonVal = aroon(klines, 14);
  const dpoArr = dpo(klines, 20);
  const cciArr = cci(klines, 20);

  // 动量
  const rsi6Arr = rsi(klines, 6);
  const rsi12Arr = rsi(klines, 12);
  const rsi24Arr = rsi(klines, 24);
  const kdjVal = kdj(klines);
  const momArr = momentum(klines, 10);
  const rocArr = roc(klines, 10);
  const wrArr = williams_r(klines, 14);
  const tsiArr = tsi(klines, 25, 13);

  // 波动率
  const atrArr = atr(klines, 14);
  const bbVal = bollinger_bands(klines, 20, 2);
  const keltnerVal = keltner_channel(klines, 20, 2);
  const volArr = volatility(klines, 20);
  const chaikinVolArr = chaikin_volatility(klines);
  const uiArr = ulcer_index(klines, 14);

  // 量价
  const volMa5Arr = volume_ma(klines, 5);
  const volMa20Arr = volume_ma(klines, 20);
  const vrArr = volume_ratio(klines, 5);
  const obvArr = obv(klines);
  const vwmaArr = vwma(klines, 20);
  const mfiArr = mfi(klines, 14);
  const cmfArr = cmf(klines, 20);
  const adArr = ad_line(klines);
  const fiArr = force_index(klines, 13);

  // 资金流向
  const mfArr = money_flow(klines, 14);
  const bpArr = buy_pressure(klines);
  const spArr = sell_pressure(klines);
  const imArr = intraday_momentum(klines);
  const vptArr = volume_price_trend(klines);

  // 统计
  const zsArr = z_score(klines, 20);
  const pbArr = percent_b(klines, 20);
  const lrVal = linear_regression(klines, 20);
  const hurstArr = hurst_exponent(klines, 100);
  const skewArr = skewness(klines, 20);

  // 复合
  const ctArr = composite_trend(klines);
  const cmoArr = composite_momentum(klines);
  const cvoArr = composite_volatility(klines);
  const cvuArr = composite_volume(klines);

  // 布林带宽度和 %B
  const lastBBUpper = last(bbVal.upper);
  const lastBBMid = last(bbVal.mid);
  const lastBBLower = last(bbVal.lower);
  let bbWidth = NaN;
  if (!Number.isNaN(lastBBMid) && lastBBMid !== 0) {
    bbWidth = ((lastBBUpper - lastBBLower) / lastBBMid) * 100;
  }

  return {
    // 趋势
    ma5: last(ma5Arr), ma10: last(ma10Arr), ma20: last(ma20Arr), ma60: last(ma60Arr),
    ema12: last(ema12Arr), ema26: last(ema26Arr),
    macdDif: last(macdVal.dif), macdDea: last(macdVal.dea), macdHist: last(macdVal.hist),
    trendStrength: last(trendStrArr),
    adx: last(adxArr),
    aroonUp: last(aroonVal.aroonUp), aroonDown: last(aroonVal.aroonDown),
    dpo: last(dpoArr),
    cci: last(cciArr),
    // 动量
    rsi6: last(rsi6Arr), rsi12: last(rsi12Arr), rsi24: last(rsi24Arr),
    kdjK: last(kdjVal.k), kdjD: last(kdjVal.d), kdjJ: last(kdjVal.j),
    momentum10: last(momArr),
    roc10: last(rocArr),
    williamsR: last(wrArr),
    tsi: last(tsiArr),
    // 波动率
    atr14: last(atrArr),
    bbUpper: lastBBUpper, bbMid: lastBBMid, bbLower: lastBBLower,
    bbWidth: bbWidth, bbPercentB: last(pbArr),
    keltnerUpper: last(keltnerVal.upper), keltnerLower: last(keltnerVal.lower),
    volatility20: last(volArr),
    chaikinVol: last(chaikinVolArr),
    ulcerIndex: last(uiArr),
    // 量价
    volMa5: last(volMa5Arr), volMa20: last(volMa20Arr),
    volumeRatio: last(vrArr),
    obv: last(obvArr),
    vwma20: last(vwmaArr),
    mfi: last(mfiArr),
    cmf: last(cmfArr),
    adLine: last(adArr),
    forceIndex: last(fiArr),
    // 资金流向
    moneyFlow: last(mfArr),
    buyPressure: last(bpArr),
    sellPressure: last(spArr),
    intradayMomentum: last(imArr),
    vpt: last(vptArr),
    // 统计
    zScore20: last(zsArr),
    percentB: last(pbArr),
    linRegSlope: last(lrVal.slope), linRegR2: last(lrVal.r2),
    hurst: last(hurstArr),
    skewness20: last(skewArr),
    // 复合
    compTrend: last(ctArr),
    compMomentum: last(cmoArr),
    compVolatility: last(cvoArr),
    compVolume: last(cvuArr),
  };
}

// ────────────────────────────────────────────────
// 9. 因子分类配置（UI用）
// ────────────────────────────────────────────────

export interface FactorDefinition {
  id: string;
  name: string;
  category: string;
  defaultWeight: number;
}

export interface FactorCategory {
  name: string;
  factors: FactorDefinition[];
}

export const FACTOR_CATEGORIES: FactorCategory[] = [
  {
    name: '趋势类',
    factors: [
      { id: 'trend_ma_cross', name: '均线交叉 (MA Cross)', category: '趋势类', defaultWeight: 0.2 },
      { id: 'trend_macd', name: 'MACD 信号', category: '趋势类', defaultWeight: 0.15 },
      { id: 'trend_strength', name: '趋势强度', category: '趋势类', defaultWeight: 0.15 },
      { id: 'trend_adx', name: 'ADX 趋向指数', category: '趋势类', defaultWeight: 0.1 },
      { id: 'trend_supertrend', name: 'SuperTrend 超级趋势', category: '趋势类', defaultWeight: 0.15 },
      { id: 'trend_psar', name: 'Parabolic SAR', category: '趋势类', defaultWeight: 0.1 },
      { id: 'trend_ichimoku', name: 'Ichimoku 一目均衡', category: '趋势类', defaultWeight: 0.15 },
    ],
  },
  {
    name: '动量类',
    factors: [
      { id: 'momentum_rsi', name: 'RSI 相对强弱', category: '动量类', defaultWeight: 0.2 },
      { id: 'momentum_kdj', name: 'KDJ 随机指标', category: '动量类', defaultWeight: 0.15 },
      { id: 'momentum_roc', name: 'ROC 变动率', category: '动量类', defaultWeight: 0.1 },
      { id: 'momentum_wr', name: '威廉指标', category: '动量类', defaultWeight: 0.1 },
      { id: 'momentum_tsi', name: 'TSI 真实强度', category: '动量类', defaultWeight: 0.1 },
      { id: 'momentum_stoch_rsi', name: 'Stochastic RSI', category: '动量类', defaultWeight: 0.15 },
      { id: 'momentum_cmf', name: 'CMF 柴金资金流量', category: '动量类', defaultWeight: 0.1 },
      { id: 'momentum_risk_adj', name: '风险调整动量', category: '动量类', defaultWeight: 0.1 },
    ],
  },
  {
    name: '量价类',
    factors: [
      { id: 'volume_ratio', name: '量比 (Volume Ratio)', category: '量价类', defaultWeight: 0.2 },
      { id: 'volume_obv', name: 'OBV 能量潮', category: '量价类', defaultWeight: 0.15 },
      { id: 'volume_mfi', name: 'MFI 资金流量', category: '量价类', defaultWeight: 0.15 },
      { id: 'volume_vpt', name: 'VPT 量价趋势', category: '量价类', defaultWeight: 0.1 },
      { id: 'volume_eom', name: 'Ease of Movement', category: '量价类', defaultWeight: 0.1 },
      { id: 'volume_nvi', name: 'NVI 负成交量', category: '量价类', defaultWeight: 0.1 },
      { id: 'volume_vwap_dev', name: 'VWAP偏差', category: '量价类', defaultWeight: 0.1 },
      { id: 'volume_block_trade', name: '大单识别因子', category: '量价类', defaultWeight: 0.1 },
    ],
  },
  {
    name: '波动率类',
    factors: [
      { id: 'volatility_bb', name: '布林带宽度', category: '波动率类', defaultWeight: 0.25 },
      { id: 'volatility_atr', name: 'ATR 平均波幅', category: '波动率类', defaultWeight: 0.2 },
      { id: 'volatility_keltner', name: '肯特纳通道', category: '波动率类', defaultWeight: 0.15 },
      { id: 'volatility_ui', name: '溃疡指数', category: '波动率类', defaultWeight: 0.1 },
      { id: 'volatility_hv_pct', name: '历史波动率百分位', category: '波动率类', defaultWeight: 0.15 },
      { id: 'volatility_skew', name: '波动率微笑偏差', category: '波动率类', defaultWeight: 0.15 },
    ],
  },
  {
    name: '资金流向类',
    factors: [
      { id: 'flow_money_flow', name: '资金流比率', category: '资金流向类', defaultWeight: 0.25 },
      { id: 'flow_buy_pressure', name: '买盘压力', category: '资金流向类', defaultWeight: 0.2 },
      { id: 'flow_sell_pressure', name: '卖盘压力', category: '资金流向类', defaultWeight: 0.15 },
      { id: 'flow_intraday', name: '日内动量', category: '资金流向类', defaultWeight: 0.1 },
      { id: 'flow_accum_mf', name: '资金流量累积', category: '资金流向类', defaultWeight: 0.15 },
      { id: 'flow_ad_line', name: 'A/D 累积派发线', category: '资金流向类', defaultWeight: 0.15 },
    ],
  },
  {
    name: '基本面类',
    factors: [
      { id: 'fund_peg', name: 'PEG 比率', category: '基本面类', defaultWeight: 0.2 },
      { id: 'fund_roe', name: 'ROE 净资产收益率', category: '基本面类', defaultWeight: 0.2 },
      { id: 'fund_gross_margin', name: '毛利率', category: '基本面类', defaultWeight: 0.15 },
      { id: 'fund_net_margin', name: '净利率', category: '基本面类', defaultWeight: 0.15 },
      { id: 'fund_revenue_growth', name: '营收增长率', category: '基本面类', defaultWeight: 0.15 },
      { id: 'fund_profit_growth', name: '净利润增长率', category: '基本面类', defaultWeight: 0.15 },
    ],
  },
  {
    name: '情绪类',
    factors: [
      { id: 'sentiment_limit_ratio', name: '涨跌停比估算', category: '情绪类', defaultWeight: 0.25 },
      { id: 'sentiment_ad_ratio', name: '涨跌家数比', category: '情绪类', defaultWeight: 0.2 },
      { id: 'sentiment_turnover_anomaly', name: '换手率异常', category: '情绪类', defaultWeight: 0.25 },
      { id: 'sentiment_vol_smile', name: '波动率微笑偏差', category: '情绪类', defaultWeight: 0.3 },
    ],
  },
  {
    name: '统计套利类',
    factors: [
      { id: 'stat_zscore', name: 'Z-Score 标准化', category: '统计套利类', defaultWeight: 0.2 },
      { id: 'stat_percent_b', name: '%B 指标', category: '统计套利类', defaultWeight: 0.15 },
      { id: 'stat_hurst', name: '赫斯特指数', category: '统计套利类', defaultWeight: 0.15 },
      { id: 'stat_cointegration', name: '协整检验', category: '统计套利类', defaultWeight: 0.15 },
      { id: 'stat_adf', name: 'ADF 平稳性检验', category: '统计套利类', defaultWeight: 0.15 },
      { id: 'stat_half_life', name: '均值回归半衰期', category: '统计套利类', defaultWeight: 0.2 },
    ],
  },
  {
    name: '复合因子',
    factors: [
      { id: 'composite_trend', name: '复合趋势因子', category: '复合因子', defaultWeight: 0.2 },
      { id: 'composite_momentum', name: '复合动量因子', category: '复合因子', defaultWeight: 0.15 },
      { id: 'composite_volatility', name: '复合波动因子', category: '复合因子', defaultWeight: 0.1 },
      { id: 'composite_volume', name: '复合量能因子', category: '复合因子', defaultWeight: 0.15 },
      { id: 'composite_multi_score', name: '多因子综合评分', category: '复合因子', defaultWeight: 0.2 },
      { id: 'composite_alpha', name: 'Alpha 超额收益', category: '复合因子', defaultWeight: 0.1 },
      { id: 'composite_risk_mom', name: '风险调整动量', category: '复合因子', defaultWeight: 0.1 },
    ],
  },
];

// ────────────────────────────────────────────────
// 扩展因子库 — 八大类40+因子
// ────────────────────────────────────────────────

// ─── 趋势类扩展 ───

/**
 * SuperTrend 超级趋势指标
 * 基于ATR的追踪止损指标，判断趋势方向
 * @param klines K线数据
 * @param period ATR周期（默认10）
 * @param multiplier ATR倍数（默认3）
 * @returns { trend, upperBand, lowerBand, signal } trend: 1=上涨, -1=下跌
 */
export function super_trend(
  klines: KLineData[],
  period: number = 10,
  multiplier: number = 3,
): { trend: number[]; upperBand: number[]; lowerBand: number[]; signal: number[] } {
  const n = klines.length;
  const atrArr = atr(klines, period);
  const basicUpper: number[] = new Array(n).fill(NaN);
  const basicLower: number[] = new Array(n).fill(NaN);
  const finalUpper: number[] = new Array(n).fill(NaN);
  const finalLower: number[] = new Array(n).fill(NaN);
  const trend: number[] = new Array(n).fill(NaN);
  const signal: number[] = new Array(n).fill(0); // 1=买入, -1=卖出

  for (let i = 0; i < n; i++) {
    if (Number.isNaN(atrArr[i])) continue;
    const mid = (klines[i].high + klines[i].low) / 2;
    basicUpper[i] = mid + multiplier * atrArr[i];
    basicLower[i] = mid - multiplier * atrArr[i];
  }

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      finalUpper[i] = basicUpper[i];
      finalLower[i] = basicLower[i];
      trend[i] = 1;
      continue;
    }
    // Final Upper Band
    if (!Number.isNaN(basicUpper[i])) {
      finalUpper[i] = (basicUpper[i] < finalUpper[i - 1] || klines[i - 1].close > finalUpper[i - 1])
        ? basicUpper[i]
        : finalUpper[i - 1];
    }
    // Final Lower Band
    if (!Number.isNaN(basicLower[i])) {
      finalLower[i] = (basicLower[i] > finalLower[i - 1] || klines[i - 1].close < finalLower[i - 1])
        ? basicLower[i]
        : finalLower[i - 1];
    }
    // Trend
    if (!Number.isNaN(finalUpper[i]) && !Number.isNaN(finalLower[i])) {
      if (klines[i].close > finalUpper[i - 1]) {
        trend[i] = 1;
        if (trend[i - 1] === -1) signal[i] = 1;
      } else if (klines[i].close < finalLower[i - 1]) {
        trend[i] = -1;
        if (trend[i - 1] === 1) signal[i] = -1;
      } else {
        trend[i] = trend[i - 1];
      }
    }
  }
  return { trend, upperBand: finalUpper, lowerBand: finalLower, signal };
}

/**
 * Parabolic SAR 抛物线转向指标
 * @param klines K线数据
 * @param step 加速因子步长（默认0.02）
 * @param max 最大加速因子（默认0.2）
 * @returns SAR序列
 */
export function parabolic_sar(
  klines: KLineData[],
  step: number = 0.02,
  max: number = 0.2,
): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (n < 2) return res;

  let af = step;
  let ep = klines[0].high;
  let sar = klines[0].low;
  let isLong = true;

  for (let i = 1; i < n; i++) {
    if (isLong) {
      if (klines[i].low > sar) {
        res[i] = sar;
        if (klines[i].high > ep) {
          ep = klines[i].high;
          af = Math.min(af + step, max);
        }
        sar = sar + af * (ep - sar);
      } else {
        isLong = false;
        sar = ep;
        ep = klines[i].low;
        af = step;
        res[i] = sar;
      }
    } else {
      if (klines[i].high < sar) {
        res[i] = sar;
        if (klines[i].low < ep) {
          ep = klines[i].low;
          af = Math.min(af + step, max);
        }
        sar = sar + af * (ep - sar);
      } else {
        isLong = true;
        sar = ep;
        ep = klines[i].high;
        af = step;
        res[i] = sar;
      }
    }
  }
  return res;
}

/**
 * Ichimoku Cloud 一目均衡表
 * @param klines K线数据
 * @returns { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan }
 */
export function ichimoku_cloud(klines: KLineData[]): {
  tenkanSen: number[];
  kijunSen: number[];
  senkouSpanA: number[];
  senkouSpanB: number[];
  chikouSpan: number[];
} {
  const n = klines.length;
  const tenkanSen: number[] = new Array(n).fill(NaN);
  const kijunSen: number[] = new Array(n).fill(NaN);
  const senkouSpanA: number[] = new Array(n).fill(NaN);
  const senkouSpanB: number[] = new Array(n).fill(NaN);
  const chikouSpan: number[] = new Array(n).fill(NaN);

  const donchian = (period: number, idx: number): number => {
    let h = klines[idx].high;
    let l = klines[idx].low;
    for (let j = Math.max(0, idx - period + 1); j <= idx; j++) {
      if (klines[j].high > h) h = klines[j].high;
      if (klines[j].low < l) l = klines[j].low;
    }
    return (h + l) / 2;
  };

  for (let i = 8; i < n; i++) tenkanSen[i] = donchian(9, i);
  for (let i = 25; i < n; i++) kijunSen[i] = donchian(26, i);
  for (let i = 0; i < n - 26; i++) {
    if (!Number.isNaN(tenkanSen[i]) && !Number.isNaN(kijunSen[i])) {
      senkouSpanA[i + 26] = (tenkanSen[i] + kijunSen[i]) / 2;
    }
  }
  for (let i = 51; i < n; i++) senkouSpanB[i] = donchian(52, i);
  for (let i = 0; i < n - 26; i++) chikouSpan[i] = klines[i + 26].close;

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan };
}

// ─── 动量类扩展 ───

/**
 * Stochastic RSI 随机相对强弱指标
 * 对RSI进行随机化处理，更敏感地捕捉极端值
 * @param klines K线数据
 * @param rsiPeriod RSI周期（默认14）
 * @param stochPeriod 随机周期（默认14）
 * @param kPeriod K平滑（默认3）
 * @param dPeriod D平滑（默认3）
 * @returns { k, d } 序列
 */
export function stochastic_rsi(
  klines: KLineData[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kPeriod: number = 3,
  dPeriod: number = 3,
): { k: number[]; d: number[] } {
  const rsiArr = rsi(klines, rsiPeriod);
  const n = rsiArr.length;
  const kRaw: number[] = new Array(n).fill(NaN);

  for (let i = stochPeriod - 1; i < n; i++) {
    const slice = rsiArr.slice(i - stochPeriod + 1, i + 1).filter(v => !Number.isNaN(v));
    if (slice.length === 0) continue;
    const highest = Math.max(...slice);
    const lowest = Math.min(...slice);
    const denom = highest - lowest;
    if (denom !== 0) {
      kRaw[i] = (rsiArr[i] - lowest) / denom * 100;
    }
  }
  const k = sma(kRaw, kPeriod);
  const d = sma(k, dPeriod);
  return { k, d };
}

// ─── 量价类扩展 ───

/**
 * Ease of Movement 简易波动指标
 * 衡量价格移动所需成交量，值越大说明量价配合越好
 * @param klines K线数据
 * @param period 平滑周期（默认14）
 * @returns EOM序列
 */
export function ease_of_movement(klines: KLineData[], period: number = 14): number[] {
  const n = klines.length;
  const raw: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const midMove = ((klines[i].high + klines[i].low) / 2) - ((klines[i - 1].high + klines[i - 1].low) / 2);
    const boxRatio = (klines[i].volume / 1000000) / (klines[i].high - klines[i].low);
    if (boxRatio !== 0) {
      raw[i] = midMove / boxRatio;
    }
  }
  return sma(raw, period);
}

/**
 * Negative Volume Index 负成交量指标
 * 只在成交量减少时累积价格变化，反映"聪明钱"行为
 * @param klines K线数据
 * @returns NVI序列
 */
export function negative_volume_index(klines: KLineData[]): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (n === 0) return res;
  res[0] = 1000;
  for (let i = 1; i < n; i++) {
    if (klines[i].volume < klines[i - 1].volume && klines[i - 1].close !== 0) {
      const pctChange = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
      res[i] = res[i - 1] + pctChange * res[i - 1];
    } else {
      res[i] = res[i - 1];
    }
  }
  return res;
}

/**
 * Volume Profile 成交量分布（简化版）
 * 计算价格区间内成交量的分布情况
 * @param klines K线数据
 * @param bins 价格分档数（默认10）
 * @returns 每个分档的成交量占比
 */
export function volume_profile(
  klines: KLineData[],
  bins: number = 10,
): number[] {
  if (klines.length === 0) return [];
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const binSize = (maxPrice - minPrice) / bins;
  if (binSize === 0) return new Array(bins).fill(0);

  const volDist = new Array(bins).fill(0);
  for (const k of klines) {
    const midPrice = (k.high + k.low + k.close) / 3;
    const idx = Math.min(Math.floor((midPrice - minPrice) / binSize), bins - 1);
    volDist[idx] += k.volume;
  }
  const totalVol = volDist.reduce((a, b) => a + b, 0);
  if (totalVol === 0) return volDist;
  return volDist.map(v => v / totalVol);
}

// ─── 波动率类扩展 ───

/**
 * Historical Volatility Percentile 历史波动率百分位
 * 当前波动率在历史波动率中的排名位置
 * @param klines K线数据
 * @param volPeriod 波动率计算周期（默认20）
 * @param lookback 历史回看周期（默认100）
 * @returns 百分位序列 (0-100)
 */
export function volatility_percentile(
  klines: KLineData[],
  volPeriod: number = 20,
  lookback: number = 100,
): number[] {
  const volArr = volatility(klines, volPeriod);
  const n = volArr.length;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = volPeriod + lookback - 1; i < n; i++) {
    const current = volArr[i];
    if (Number.isNaN(current)) continue;
    const history = volArr.slice(i - lookback + 1, i).filter(v => !Number.isNaN(v));
    if (history.length === 0) continue;
    let count = 0;
    for (const v of history) {
      if (v < current) count++;
    }
    res[i] = (count / history.length) * 100;
  }
  return res;
}

// ─── 资金流向类扩展 ───

/**
 * VWAP偏差（价格相对VWAP的偏离度）
 * @param klines K线数据
 * @param period VWAP计算周期（默认20）
 * @returns VWAP偏差序列（正=价格在VWAP上方）
 */
export function vwap_deviation(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let pvSum = 0;
    let vSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (klines[j].high + klines[j].low + klines[j].close) / 3;
      pvSum += tp * klines[j].volume;
      vSum += klines[j].volume;
    }
    if (vSum !== 0) {
      const vwap = pvSum / vSum;
      res[i] = ((klines[i].close - vwap) / vwap) * 100;
    }
  }
  return res;
}

/**
 * 资金流量累积（Accumulated Money Flow）
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns 资金流量累积序列
 */
export function accumulated_money_flow(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  let cumMF = 0;
  for (let i = 0; i < n; i++) {
    const tp = (klines[i].high + klines[i].low + klines[i].close) / 3;
    const mf = tp * klines[i].volume;
    if (i > 0) {
      const prevTP = (klines[i - 1].high + klines[i - 1].low + klines[i - 1].close) / 3;
      cumMF += tp > prevTP ? mf : tp < prevTP ? -mf : 0;
    }
    if (i >= period - 1) {
      res[i] = cumMF;
    }
  }
  return res;
}

/**
 * 大单识别因子（基于成交量异常放大）
 * 检测显著高于平均成交量的交易日，视为大单流入信号
 * @param klines K线数据
 * @param period 平均周期（默认20）
 * @param threshold 异常阈值倍数（默认2.0）
 * @returns 大单因子序列（1=大单流入, -1=大单流出, 0=正常）
 */
export function block_trade_factor(
  klines: KLineData[],
  period: number = 20,
  threshold: number = 2.0,
): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(0);
  const volMA = volume_ma(klines, period);
  for (let i = period; i < n; i++) {
    if (Number.isNaN(volMA[i]) || volMA[i] === 0) continue;
    const volRatio = klines[i].volume / volMA[i];
    if (volRatio > threshold) {
      // 大涨+放量 = 大单流入，大跌+放量 = 大单流出
      const priceChange = (klines[i].close - klines[i].open) / klines[i].open;
      res[i] = priceChange > 0 ? 1 : priceChange < 0 ? -1 : 0;
    }
  }
  return res;
}

// ─── 基本面类扩展 ───

/** 基本面数据接口（需从外部传入） */
export interface FundamentalData {
  pe?: number;        // 市盈率
  epsGrowth?: number; // EPS增长率
  revenueGrowth?: number; // 营收增长率
  netProfitGrowth?: number; // 净利润增长率
  roe?: number;       // 净资产收益率
  grossMargin?: number; // 毛利率
  netMargin?: number; // 净利率
  debtRatio?: number; // 负债率
}

/**
 * PEG比率 = PE / 盈利增长率
 * PEG < 1 通常被认为低估
 * @param klines K线数据（仅用于返回等长数组）
 * @param fundamental 基本面数据
 * @returns PEG序列（单一值扩展为序列）
 */
export function peg_ratio(klines: KLineData[], fundamental?: FundamentalData): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (!fundamental || fundamental.pe === undefined || fundamental.epsGrowth === undefined || fundamental.epsGrowth <= 0) {
    return res;
  }
  const peg = fundamental.pe / (fundamental.epsGrowth * 100);
  const lastVal = !Number.isNaN(peg) && isFinite(peg) ? peg : NaN;
  res[n - 1] = lastVal;
  return res;
}

/**
 * ROE因子（净资产收益率）
 * @param klines K线数据
 * @param fundamental 基本面数据
 * @returns ROE序列
 */
export function roe_factor(klines: KLineData[], fundamental?: FundamentalData): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (!fundamental || fundamental.roe === undefined) return res;
  res[n - 1] = fundamental.roe;
  return res;
}

/**
 * 毛利率因子
 * @param klines K线数据
 * @param fundamental 基本面数据
 * @returns 毛利率序列
 */
export function gross_margin_factor(klines: KLineData[], fundamental?: FundamentalData): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (!fundamental || fundamental.grossMargin === undefined) return res;
  res[n - 1] = fundamental.grossMargin;
  return res;
}

/**
 * 净利率因子
 * @param klines K线数据
 * @param fundamental 基本面数据
 * @returns 净利率序列
 */
export function net_margin_factor(klines: KLineData[], fundamental?: FundamentalData): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (!fundamental || fundamental.netMargin === undefined) return res;
  res[n - 1] = fundamental.netMargin;
  return res;
}

/**
 * 营收增长率因子
 * @param klines K线数据
 * @param fundamental 基本面数据
 * @returns 营收增长率序列
 */
export function revenue_growth_factor(klines: KLineData[], fundamental?: FundamentalData): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (!fundamental || fundamental.revenueGrowth === undefined) return res;
  res[n - 1] = fundamental.revenueGrowth;
  return res;
}

/**
 * 净利润增长率因子
 * @param klines K线数据
 * @param fundamental 基本面数据
 * @returns 净利润增长率序列
 */
export function profit_growth_factor(klines: KLineData[], fundamental?: FundamentalData): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (!fundamental || fundamental.netProfitGrowth === undefined) return res;
  res[n - 1] = fundamental.netProfitGrowth;
  return res;
}

// ─── 情绪类扩展 ───

/**
 * 涨跌停比估算因子
 * 基于日内价格波动估算涨停/跌停家数比（单股视角）
 * 价格接近涨停=情绪极度乐观，接近跌停=极度悲观
 * @param klines K线数据
 * @returns 情绪得分序列 (-1 到 1)
 */
export function limit_up_down_ratio(klines: KLineData[]): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const prevClose = klines[i - 1].close;
    if (prevClose === 0) continue;
    const changePct = (klines[i].close - prevClose) / prevClose;
    // A股涨停~10%，跌停~-10%，归一化到 [-1, 1]
    res[i] = Math.max(-1, Math.min(1, changePct / 0.1));
  }
  return res;
}

/**
 * 涨跌家数比估算（基于连涨/连跌天数）
 * @param klines K线数据
 * @param period 周期（默认10）
 * @returns 涨跌天数比序列 (正值=涨多跌少)
 */
export function advance_decline_ratio(klines: KLineData[], period: number = 10): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (n < 2) return res;
  let upDays = 0;
  let downDays = 0;
  for (let i = 1; i < n; i++) {
    if (klines[i].close > klines[i - 1].close) upDays++;
    else if (klines[i].close < klines[i - 1].close) downDays++;

    if (i >= period) {
      // 滑动窗口移除
      if (klines[i - period + 1].close > klines[i - period].close) upDays--;
      else if (klines[i - period + 1].close < klines[i - period].close) downDays--;
    }
    if (i >= period - 1) {
      const total = upDays + downDays;
      res[i] = total === 0 ? 0 : (upDays - downDays) / total;
    }
  }
  return res;
}

/**
 * 换手率异常检测
 * 检测成交量是否显著偏离正常水平
 * @param klines K线数据
 * @param period 平均周期（默认20）
 * @param zThreshold Z分数阈值（默认2）
 * @returns 换手率异常序列（正值=放量，负值=缩量）
 */
export function turnover_anomaly(
  klines: KLineData[],
  period: number = 20,
  zThreshold: number = 2,
): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(0);
  const vols = klines.map(k => k.volume);
  const volMA = sma(vols, period);
  const volStd = stdDev(vols, period);
  for (let i = period - 1; i < n; i++) {
    if (Number.isNaN(volMA[i]) || Number.isNaN(volStd[i]) || volStd[i] === 0) continue;
    const zScore = (vols[i] - volMA[i]) / volStd[i];
    if (Math.abs(zScore) > zThreshold) {
      res[i] = zScore;
    }
  }
  return res;
}

/**
 * 波动率微笑偏差（基于涨跌幅分布不对称性）
 * 衡量上涨日和下跌日的波动率不对称程度
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns 微笑偏差序列（正值=上涨波动更大）
 */
export function volatility_skew(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (n < 2) return res;
  const returns: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    returns[i] = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
  }
  for (let i = period; i < n; i++) {
    const slice = returns.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    if (slice.length < 5) continue;
    const upReturns = slice.filter(r => r > 0);
    const downReturns = slice.filter(r => r < 0);
    if (upReturns.length === 0 || downReturns.length === 0) continue;
    const upVol = Math.sqrt(upReturns.reduce((a, r) => a + r * r, 0) / upReturns.length);
    const downVol = Math.sqrt(downReturns.reduce((a, r) => a + r * r, 0) / downReturns.length);
    if (downVol !== 0) {
      res[i] = (upVol / downVol) - 1;
    }
  }
  return res;
}

// ─── 统计套利类扩展 ───

/**
 * 协整检验简化版（Engle-Granger方法）
 * 检验两组价格序列是否存在协整关系
 * @param klinesA 资产A的K线数据
 * @param klinesB 资产B的K线数据
 * @param period 回归周期（默认60）
 * @returns 残差序列（用于判断协整）
 */
export function cointegration_residual(
  klinesA: KLineData[],
  klinesB: KLineData[],
  period: number = 60,
): { residual: number[]; beta: number[]; spread: number[] } {
  const n = Math.min(klinesA.length, klinesB.length);
  const residual: number[] = new Array(n).fill(NaN);
  const beta: number[] = new Array(n).fill(NaN);
  const spread: number[] = new Array(n).fill(NaN);
  const priceA = klinesA.map(k => k.close);
  const priceB = klinesB.map(k => k.close);

  for (let i = period - 1; i < n; i++) {
    const sliceA = priceA.slice(i - period + 1, i + 1);
    const sliceB = priceB.slice(i - period + 1, i + 1);
    const meanA = sliceA.reduce((a, b) => a + b, 0) / period;
    const meanB = sliceB.reduce((a, b) => a + b, 0) / period;
    let cov = 0;
    let varB = 0;
    for (let j = 0; j < period; j++) {
      cov += (sliceA[j] - meanA) * (sliceB[j] - meanB);
      varB += (sliceB[j] - meanB) ** 2;
    }
    const b = varB !== 0 ? cov / varB : 0;
    const alpha = meanA - b * meanB;
    const resVal = priceA[i] - (alpha + b * priceB[i]);
    beta[i] = b;
    residual[i] = resVal;
    // Z-score of residual
    const resSlice = residual.slice(i - Math.min(20, period) + 1, i + 1).filter(v => !Number.isNaN(v));
    if (resSlice.length >= 5) {
      const resMean = resSlice.reduce((a, v) => a + v, 0) / resSlice.length;
      const resStd = Math.sqrt(resSlice.reduce((a, v) => a + (v - resMean) ** 2, 0) / resSlice.length);
      spread[i] = resStd !== 0 ? (resVal - resMean) / resStd : 0;
    }
  }
  return { residual, beta, spread };
}

/**
 * ADF检验近似值（Augmented Dickey-Fuller Test）
 * 检验序列的平稳性，返回ADF统计量（简化版）
 * @param klines K线数据
 * @param period 检验周期（默认30）
 * @returns ADF统计量序列（越负越平稳）
 */
export function adf_statistic(klines: KLineData[], period: number = 30): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  if (n < period + 1) return res;
  const prices = klines.map(k => k.close);
  for (let i = period; i < n; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const diffs: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      diffs.push(slice[j] - slice[j - 1]);
    }
    const lagged = slice.slice(0, slice.length - 1);
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const stdDiff = Math.sqrt(diffs.reduce((a, b) => a + (b - meanDiff) ** 2, 0) / diffs.length);
    const meanPrice = lagged.reduce((a, b) => a + b, 0) / lagged.length;
    const stdPrice = Math.sqrt(lagged.reduce((a, b) => a + (b - meanPrice) ** 2, 0) / lagged.length);
    if (stdDiff !== 0 && stdPrice !== 0) {
      // 简化ADF统计量：变化率的均值/标准差 ÷ 价格水平的标准差
      res[i] = (meanDiff / stdDiff) / (stdPrice / Math.sqrt(lagged.length));
    }
  }
  return res;
}

/**
 * Half-life 半衰期（均值回归速度）
 * 衡量价格偏离均值后回归一半所需时间
 * @param klines K线数据
 * @param period 周期（默认60）
 * @returns 半衰期序列（天数，值越小回归越快）
 */
export function half_life(klines: KLineData[], period: number = 60): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  const prices = klines.map(k => k.close);
  for (let i = period; i < n; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const lagged = slice.slice(0, slice.length - 1);
    const delta = slice.slice(1).map((v, idx) => v - lagged[idx]);
    const y = slice.slice(1).map((v, idx) => v - lagged[idx]);
    const x = slice.slice(0, slice.length - 1).map(v => v - lagged.reduce((a, b) => a + b, 0) / lagged.length);
    let xy = 0, xx = 0;
    for (let j = 0; j < y.length; j++) {
      xy += x[j] * y[j];
      xx += x[j] * x[j];
    }
    const lambda = xx !== 0 ? xy / xx : 0;
    if (lambda < 0) {
      res[i] = -Math.log(2) / lambda;
    } else {
      res[i] = NaN; // 不均值回归
    }
  }
  return res;
}

// ─── 复合因子扩展 ───

/**
 * 多因子综合评分
 * 综合趋势、动量、波动率、量价四大类因子给出0-100评分
 * @param klines K线数据
 * @returns 综合评分序列
 */
export function multi_factor_score(klines: KLineData[]): number[] {
  const n = klines.length;
  const trend = composite_trend(klines);
  const momentum = composite_momentum(klines);
  const vol = composite_volatility(klines);
  const volume = composite_volume(klines);
  const res: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let score = 50;
    if (!Number.isNaN(trend[i])) score += trend[i] * 20;
    if (!Number.isNaN(momentum[i])) score += momentum[i] * 15;
    if (!Number.isNaN(volume[i])) score += volume[i] * 10;
    // 波动率适中最好
    if (!Number.isNaN(vol[i])) {
      score -= Math.abs(vol[i] - 2) * 5;
    }
    res[i] = Math.max(0, Math.min(100, score));
  }
  return res;
}

/**
 * Alpha因子（超额收益能力）
 * 基于CAPM简化计算，评估相对市场的超额收益
 * @param klines 个股K线数据
 * @param marketKlines 市场指数K线数据（如沪深300）
 * @param period 计算周期（默认60）
 * @returns Alpha序列
 */
export function alpha_factor(
  klines: KLineData[],
  marketKlines: KLineData[],
  period: number = 60,
): number[] {
  const n = Math.min(klines.length, marketKlines.length);
  const res: number[] = new Array(n).fill(NaN);
  const stockReturns: number[] = new Array(n).fill(NaN);
  const marketReturns: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    if (klines[i - 1].close !== 0) {
      stockReturns[i] = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
    }
    if (marketKlines[i - 1].close !== 0) {
      marketReturns[i] = (marketKlines[i].close - marketKlines[i - 1].close) / marketKlines[i - 1].close;
    }
  }
  for (let i = period; i < n; i++) {
    const sSlice = stockReturns.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    const mSlice = marketReturns.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    if (sSlice.length < 5 || mSlice.length < 5) continue;
    const sMean = sSlice.reduce((a, b) => a + b, 0) / sSlice.length;
    const mMean = mSlice.reduce((a, b) => a + b, 0) / mSlice.length;
    let cov = 0, mVar = 0;
    const len = Math.min(sSlice.length, mSlice.length);
    for (let j = 0; j < len; j++) {
      cov += (sSlice[j] - sMean) * (mSlice[j] - mMean);
      mVar += (mSlice[j] - mMean) ** 2;
    }
    const beta = mVar !== 0 ? cov / mVar : 0;
    // 年化 alpha（简化：日收益率 * 252）
    const dailyAlpha = sMean - beta * mMean;
    res[i] = dailyAlpha * 252 * 100; // 转为百分比
  }
  return res;
}

/**
 * Risk-Adjusted Momentum 风险调整动量
 * 动量除以波动率，夏普比率风格的动量指标
 * @param klines K线数据
 * @param period 周期（默认20）
 * @returns 风险调整动量序列
 */
export function risk_adjusted_momentum(klines: KLineData[], period: number = 20): number[] {
  const n = klines.length;
  const res: number[] = new Array(n).fill(NaN);
  const returns: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    returns[i] = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
  }
  for (let i = period; i < n; i++) {
    const slice = returns.slice(i - period + 1, i + 1).filter(v => !Number.isNaN(v));
    if (slice.length < 3) continue;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    if (std !== 0) {
      res[i] = (mean / std) * Math.sqrt(252); // 年化
    }
  }
  return res;
}
