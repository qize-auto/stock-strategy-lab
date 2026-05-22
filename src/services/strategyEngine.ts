import type { KLineData, TechnicalIndicators } from '@/services/stockApi';
import type { StrategyElement, CustomStrategy } from '@/contexts/AppContext';

/* Re-export type for backward compatibility */
export type { CustomStrategy };

/* ─── Local storage helpers for custom strategies ─── */

const STORAGE_KEY = 'quant_lab_strategies';

export function getCustomStrategies(): CustomStrategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomStrategy[];
      return parsed.filter((s) => !s.isSystem);
    }
  } catch { /* ignore */ }
  return [];
}

/* ──────────────────────── Indicator helpers ──────────────────────── */

export function ma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j];
      result.push(sum / period);
    }
  }
  return result;
}

function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
    } else {
      result.push(data[i] * multiplier + result[i - 1] * (1 - multiplier));
    }
  }
  return result;
}

function rsi(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
      continue;
    }
    let gain = 0, loss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j] - data[j - 1];
      if (change > 0) gain += change;
      else loss += -change;
    }
    if (loss === 0) result.push(100);
    else result.push(100 - 100 / (1 + gain / loss));
  }
  return result;
}

function kdj(klines: KLineData[]) {
  const k: number[] = [];
  const d: number[] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < klines.length; i++) {
    let lowestLow = klines[i].low;
    let highestHigh = klines[i].high;
    const lookback = Math.min(i + 1, 9);
    for (let t = i - lookback + 1; t <= i; t++) {
      if (klines[t].low < lowestLow) lowestLow = klines[t].low;
      if (klines[t].high > highestHigh) highestHigh = klines[t].high;
    }
    const rsv = highestHigh === lowestLow ? 0 : ((klines[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
    const curK = (2 / 3) * prevK + (1 / 3) * rsv;
    const curD = (2 / 3) * prevD + (1 / 3) * curK;
    k.push(curK);
    d.push(curD);
    prevK = curK;
    prevD = curD;
  }
  return { k, d };
}

/* Williams %R indicator */
function wr(klines: KLineData[], period: number = 14): number[] {
  const result: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let highestHigh = klines[i].high;
    let lowestLow = klines[i].low;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      if (klines[j].high > highestHigh) highestHigh = klines[j].high;
      if (klines[j].low < lowestLow) lowestLow = klines[j].low;
    }
    const range = highestHigh - lowestLow;
    if (range === 0) result.push(-50);
    else result.push(((highestHigh - klines[i].close) / range) * -100);
  }
  return result;
}

/* Commodity Channel Index */
function cci(klines: KLineData[], period: number = 14): number[] {
  const result: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sumTP = 0;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      const tp = (klines[j].high + klines[j].low + klines[j].close) / 3;
      sumTP += tp;
    }
    const smaTP = sumTP / period;
    let sumDev = 0;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      const tp = (klines[j].high + klines[j].low + klines[j].close) / 3;
      sumDev += Math.abs(tp - smaTP);
    }
    const meanDev = sumDev / period;
    const tp = (klines[i].high + klines[i].low + klines[i].close) / 3;
    if (meanDev === 0) result.push(0);
    else result.push((tp - smaTP) / (0.015 * meanDev));
  }
  return result;
}

/* Average True Range */
function atr(klines: KLineData[], period: number = 14): number[] {
  const result: number[] = [];
  const trValues: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    const highLow = klines[i].high - klines[i].low;
    const highClosePrev = i > 0 ? Math.abs(klines[i].high - klines[i - 1].close) : highLow;
    const lowClosePrev = i > 0 ? Math.abs(klines[i].low - klines[i - 1].close) : highLow;
    trValues.push(Math.max(highLow, highClosePrev, lowClosePrev));
  }
  for (let i = 0; i < trValues.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += trValues[i - j];
      result.push(sum / period);
    } else {
      result.push((result[i - 1] * (period - 1) + trValues[i]) / period);
    }
  }
  return result;
}

/* ADX (Average Directional Index) */
function adx(klines: KLineData[], period: number = 14): number[] {
  const diPlus: number[] = [];
  const diMinus: number[] = [];
  const dxValues: number[] = [];
  const result: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (i === 0) {
      diPlus.push(0);
      diMinus.push(0);
      dxValues.push(0);
      result.push(NaN);
      continue;
    }
    const upMove = klines[i].high - klines[i - 1].high;
    const downMove = klines[i - 1].low - klines[i].low;
    let plusDM = 0, minusDM = 0;
    if (upMove > downMove && upMove > 0) plusDM = upMove;
    if (downMove > upMove && downMove > 0) minusDM = downMove;
    diPlus.push(plusDM);
    diMinus.push(minusDM);
    if (i < period) {
      dxValues.push(0);
      result.push(NaN);
      continue;
    }
    let sumTR = 0, sumPlus = 0, sumMinus = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumTR += Math.max(
        klines[j].high - klines[j].low,
        Math.abs(klines[j].high - klines[j - 1].close),
        Math.abs(klines[j].low - klines[j - 1].close)
      );
      sumPlus += diPlus[j];
      sumMinus += diMinus[j];
    }
    const pDI = sumTR === 0 ? 0 : (sumPlus / sumTR) * 100;
    const mDI = sumTR === 0 ? 0 : (sumMinus / sumTR) * 100;
    const dx = (pDI + mDI) === 0 ? 0 : (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
    dxValues.push(dx);
    if (i === period * 2 - 1) {
      let sumDx = 0;
      for (let j = period; j < period * 2; j++) sumDx += dxValues[j];
      result.push(sumDx / period);
    } else if (i > period * 2 - 1) {
      result.push((result[i - 1] * (period - 1) + dx) / period);
    } else {
      result.push(NaN);
    }
  }
  return result;
}

/* Bollinger Band %B */
function percentB(close: number, upper: number, lower: number): number {
  const range = upper - lower;
  if (range === 0) return 0.5;
  return (close - lower) / range;
}

/* Detect bullish divergence between price and indicator */
function findBullDivergence(closes: number[], indicator: number[], lookback: number = 20): boolean[] {
  const result: boolean[] = new Array(closes.length).fill(false);
  for (let i = lookback; i < closes.length; i++) {
    let priceLowIdx = i - lookback;
    let indLowIdx = i - lookback;
    for (let j = i - lookback; j <= i; j++) {
      if (!isNaN(closes[j]) && closes[j] <= closes[priceLowIdx]) priceLowIdx = j;
      if (!isNaN(indicator[j]) && indicator[j] <= indicator[indLowIdx]) indLowIdx = j;
    }
    if (closes[i] < closes[priceLowIdx] && indicator[i] > indicator[indLowIdx]) {
      result[i] = true;
    }
  }
  return result;
}

/* Detect bearish divergence between price and indicator */
function findBearDivergence(closes: number[], indicator: number[], lookback: number = 20): boolean[] {
  const result: boolean[] = new Array(closes.length).fill(false);
  for (let i = lookback; i < closes.length; i++) {
    let priceHighIdx = i - lookback;
    let indHighIdx = i - lookback;
    for (let j = i - lookback; j <= i; j++) {
      if (!isNaN(closes[j]) && closes[j] >= closes[priceHighIdx]) priceHighIdx = j;
      if (!isNaN(indicator[j]) && indicator[j] >= indicator[indHighIdx]) indHighIdx = j;
    }
    if (closes[i] > closes[priceHighIdx] && indicator[i] < indicator[indHighIdx]) {
      result[i] = true;
    }
  }
  return result;
}

/* VWAP (Volume Weighted Average Price) */
function vwap(klines: KLineData[]): number[] {
  const result: number[] = [];
  let cumPV = 0;
  let cumVol = 0;
  for (let i = 0; i < klines.length; i++) {
    const tp = (klines[i].high + klines[i].low + klines[i].close) / 3;
    cumPV += tp * klines[i].volume;
    cumVol += klines[i].volume;
    if (cumVol !== 0) {
      result.push(cumPV / cumVol);
    } else {
      result.push(tp);
    }
  }
  return result;
}

/* SuperTrend indicator */
function supertrend(klines: KLineData[], period: number = 10, multiplier: number = 3): { upper: number[]; lower: number[]; direction: number[] } {
  const n = klines.length;
  const atrArr = atr(klines, period);
  const upper: number[] = new Array(n).fill(NaN);
  const lower: number[] = new Array(n).fill(NaN);
  const direction: number[] = new Array(n).fill(1); // 1 = uptrend, -1 = downtrend

  for (let i = 1; i < n; i++) {
    if (isNaN(atrArr[i])) continue;
    const mid = (klines[i].high + klines[i].low) / 2;
    upper[i] = mid + multiplier * atrArr[i];
    lower[i] = mid - multiplier * atrArr[i];

    // Adjust bands
    if (i > 1) {
      if (!isNaN(upper[i - 1])) {
        upper[i] = Math.min(upper[i], upper[i - 1]);
        if (klines[i].close > upper[i - 1]) upper[i] = mid + multiplier * atrArr[i];
      }
      if (!isNaN(lower[i - 1])) {
        lower[i] = Math.max(lower[i], lower[i - 1]);
        if (klines[i].close < lower[i - 1]) lower[i] = mid - multiplier * atrArr[i];
      }
    }

    // Determine direction
    if (klines[i].close > (isNaN(upper[i - 1]) ? Infinity : upper[i - 1])) {
      direction[i] = 1;
    } else if (klines[i].close < (isNaN(lower[i - 1]) ? -Infinity : lower[i - 1])) {
      direction[i] = -1;
    } else {
      direction[i] = direction[i - 1];
    }
  }
  return { upper, lower, direction };
}

/* Parabolic SAR */
function parabolicSAR(klines: KLineData[], afStep: number = 0.02, afMax: number = 0.2): number[] {
  const n = klines.length;
  const psar: number[] = new Array(n).fill(NaN);
  if (n < 2) return psar;

  let bull = true;
  let af = afStep;
  let ep = klines[0].high;
  let sar = klines[0].low;
  psar[0] = sar;

  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);

    if (bull) {
      psar[i] = Math.min(sar, klines[i - 1].low, i > 1 ? klines[i - 2].low : klines[i - 1].low);
      if (klines[i].high > ep) {
        ep = klines[i].high;
        af = Math.min(af + afStep, afMax);
      }
      if (klines[i].low < psar[i]) {
        bull = false;
        sar = ep;
        ep = klines[i].low;
        af = afStep;
      }
    } else {
      psar[i] = Math.max(sar, klines[i - 1].high, i > 1 ? klines[i - 2].high : klines[i - 1].high);
      if (klines[i].low < ep) {
        ep = klines[i].low;
        af = Math.min(af + afStep, afMax);
      }
      if (klines[i].high > psar[i]) {
        bull = true;
        sar = ep;
        ep = klines[i].high;
        af = afStep;
      }
    }
  }
  return psar;
}

/* Ichimoku Cloud */
function ichimoku(klines: KLineData[]): { tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[]; chikou: number[] } {
  const n = klines.length;
  const tenkan: number[] = new Array(n).fill(NaN);
  const kijun: number[] = new Array(n).fill(NaN);
  const senkouA: number[] = new Array(n).fill(NaN);
  const senkouB: number[] = new Array(n).fill(NaN);
  const chikou: number[] = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    // Chikou = close shifted back 26 periods
    if (i + 26 < n) chikou[i] = klines[i + 26].close;

    // Tenkan-sen (9-period)
    if (i >= 8) {
      const high9 = Math.max(...klines.slice(i - 8, i + 1).map(k => k.high));
      const low9 = Math.min(...klines.slice(i - 8, i + 1).map(k => k.low));
      tenkan[i] = (high9 + low9) / 2;
    }

    // Kijun-sen (26-period)
    if (i >= 25) {
      const high26 = Math.max(...klines.slice(i - 25, i + 1).map(k => k.high));
      const low26 = Math.min(...klines.slice(i - 25, i + 1).map(k => k.low));
      kijun[i] = (high26 + low26) / 2;
    }

    // Senkou Span A
    if (!isNaN(tenkan[i]) && !isNaN(kijun[i])) {
      const val = (tenkan[i] + kijun[i]) / 2;
      if (i + 26 < n) senkouA[i + 26] = val;
    }

    // Senkou Span B (52-period)
    if (i >= 51) {
      const high52 = Math.max(...klines.slice(i - 51, i + 1).map(k => k.high));
      const low52 = Math.min(...klines.slice(i - 51, i + 1).map(k => k.low));
      const val = (high52 + low52) / 2;
      if (i + 26 < n) senkouB[i + 26] = val;
    }
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/* Double bottom pattern detection */
function detectDoubleBottom(klines: KLineData[], lookback: number = 30, tolerance: number = 0.03): boolean[] {
  const result: boolean[] = new Array(klines.length).fill(false);
  const n = klines.length;
  for (let i = lookback * 2; i < n; i++) {
    const slice = klines.slice(i - lookback * 2, i + 1);
    const lows = slice.map((k, idx) => ({ low: k.low, idx: i - lookback * 2 + idx }));
    // Find two significant lows
    lows.sort((a, b) => a.low - b.low);
    const bottom1 = lows[0];
    const bottom2 = lows.find(l => Math.abs(l.low - bottom1.low) / bottom1.low < tolerance && l.idx > bottom1.idx + 5);
    if (bottom2 && klines[i].close > klines[i - 1].close && klines[i].close > klines[i - 5].close) {
      result[i] = true;
    }
  }
  return result;
}

/* Head and Shoulder bottom pattern detection */
function detectHeadShoulderBottom(klines: KLineData[], lookback: number = 40): boolean[] {
  const result: boolean[] = new Array(klines.length).fill(false);
  const n = klines.length;
  for (let i = lookback; i < n; i++) {
    const slice = klines.slice(i - lookback, i + 1);
    const len = slice.length;
    // Divide into 5 regions: left-shoulder, left-neck, head, right-neck, right-shoulder
    const seg = Math.floor(len / 5);
    if (seg < 3) continue;
    const leftShoulderLow = Math.min(...slice.slice(0, seg).map(k => k.low));
    const leftNeckHigh = Math.max(...slice.slice(seg, seg * 2).map(k => k.high));
    const headLow = Math.min(...slice.slice(seg * 2, seg * 3).map(k => k.low));
    const rightNeckHigh = Math.max(...slice.slice(seg * 3, seg * 4).map(k => k.high));
    const rightShoulderLow = Math.min(...slice.slice(seg * 4).map(k => k.low));

    // Head lower than both shoulders, neckline roughly level
    if (headLow < leftShoulderLow && headLow < rightShoulderLow &&
        Math.abs(leftNeckHigh - rightNeckHigh) / leftNeckHigh < 0.05 &&
        klines[i].close > leftNeckHigh) {
      result[i] = true;
    }
  }
  return result;
}

/* Cup and Handle pattern detection */
function detectCupHandle(klines: KLineData[], lookback: number = 50): boolean[] {
  const result: boolean[] = new Array(klines.length).fill(false);
  const n = klines.length;
  for (let i = lookback; i < n; i++) {
    const slice = klines.slice(i - lookback, i + 1);
    const len = slice.length;
    // Cup: U-shaped bottom (first half decline, second half rise)
    const mid = Math.floor(len / 2);
    const cupStartHigh = slice[0].close;
    const cupBottomLow = Math.min(...slice.slice(Math.floor(mid * 0.3), Math.floor(mid * 0.8)).map(k => k.low));
    const cupEndHigh = slice[mid].close;
    // Handle: slight pullback after cup
    const handleLow = Math.min(...slice.slice(mid).map(k => k.low));
    const recentClose = slice[len - 1].close;

    if (cupBottomLow < cupStartHigh * 0.95 &&
        Math.abs(cupEndHigh - cupStartHigh) / cupStartHigh < 0.1 &&
        handleLow > cupBottomLow * 1.02 &&
        handleLow < cupEndHigh * 0.98 &&
        recentClose > cupEndHigh * 0.95) {
      result[i] = true;
    }
  }
  return result;
}

/* Bollinger Band Squeeze detection (bandwidth below threshold then expansion) */
function detectBBSqueeze(klines: KLineData[], bbWidthPeriod: number = 20, squeezeThreshold: number = 0.05): boolean[] {
  const result: boolean[] = new Array(klines.length).fill(false);
  const closes = klines.map(k => k.close);
  const n = klines.length;
  for (let i = bbWidthPeriod + 10; i < n; i++) {
    // Calculate BB width over lookback
    const slice = closes.slice(i - bbWidthPeriod, i + 1);
    let sum = 0, sqSum = 0;
    for (const c of slice) { sum += c; sqSum += c * c; }
    const mean = sum / slice.length;
    const std = Math.sqrt(sqSum / slice.length - mean * mean);
    const width = (std * 4) / mean; // 2 std each side

    // Check if recently squeezed and now breaking out
    const prevSlice = closes.slice(i - bbWidthPeriod - 10, i - 9);
    let pSum = 0, pSqSum = 0;
    for (const c of prevSlice) { pSum += c; pSqSum += c * c; }
    const pMean = pSum / prevSlice.length;
    const pStd = Math.sqrt(pSqSum / prevSlice.length - pMean * pMean);
    const prevWidth = (pStd * 4) / pMean;

    if (prevWidth < squeezeThreshold && width > prevWidth * 1.5 && closes[i] > closes[i - 1]) {
      result[i] = true;
    }
  }
  return result;
}

/* Consecutive up days */
function consecutiveUpDays(closes: number[], days: number): boolean[] {
  const result: boolean[] = new Array(closes.length).fill(false);
  for (let i = days; i < closes.length; i++) {
    let upCount = 0;
    for (let j = i - days + 1; j <= i; j++) {
      if (closes[j] > closes[j - 1]) upCount++;
    }
    result[i] = upCount >= days;
  }
  return result;
}

export function calculateIndicators(kline: KLineData[]): TechnicalIndicators {
  const closes = kline.map((k) => k.close);
  const ma5 = ma(closes, 5);
  const ma10 = ma(closes, 10);
  const ma20 = ma(closes, 20);

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdDIF = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i]) ? NaN : v - ema26[i]));
  const macdDEA = ema(macdDIF.filter((v) => !isNaN(v)), 9);
  const macdHist = macdDIF.map((v, i) => {
    if (isNaN(v)) return NaN;
    const deaIdx = i - (macdDIF.length - macdDEA.length);
    if (deaIdx < 0 || deaIdx >= macdDEA.length || isNaN(macdDEA[deaIdx])) return NaN;
    return (v - macdDEA[deaIdx]) * 2;
  });

  const { k, d } = kdj(kline);
  const kdjJ = k.map((v, i) => 3 * v - 2 * d[i]);
  const rsi6 = rsi(closes, 6);
  const rsi12 = rsi(closes, 12);

  const bbUpper: number[] = [];
  const bbLower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 19) {
      bbUpper.push(NaN);
      bbLower.push(NaN);
    } else {
      let sum = 0, sqSum = 0;
      for (let j = 0; j < 20; j++) {
        sum += closes[i - j];
        sqSum += closes[i - j] * closes[i - j];
      }
      const mean = sum / 20;
      const std = Math.sqrt(sqSum / 20 - mean * mean);
      bbUpper.push(mean + 2 * std);
      bbLower.push(mean - 2 * std);
    }
  }

  const recent20 = closes.slice(-20);
  const support = Math.min(...recent20);
  const resistance = Math.max(...recent20);

  return {
    ma5, ma10, ma20,
    macdDIF, macdDEA, macdHist,
    kdjK: k, kdjD: d, kdjJ,
    rsi6, rsi12,
    bbUpper, bbMid: ma20, bbLower,
    support, resistance,
  };
}

/* ──────────────────────── Parameter helpers ──────────────────────── */

export function getParamValue(el: StrategyElement, name: string, fallback: number): number {
  const p = el.params?.find((pp) => pp.name === name);
  if (!p) return fallback;
  const v = typeof p.value === 'string' ? parseFloat(p.value) : p.value;
  return isNaN(v) ? fallback : v;
}

export function getParamString(el: StrategyElement, name: string, fallback: string): string {
  const p = el.params?.find((pp) => pp.name === name);
  if (!p) return fallback;
  return typeof p.value === 'string' ? p.value : String(p.value);
}

export function cloneElement(el: StrategyElement): StrategyElement {
  return {
    ...el,
    params: el.params?.map((p) => ({ ...p })),
  };
}

/* ──────────────────────── Strategy element definitions ──────────────────────── */

/* ── 入场信号 (20+ 个) ── */

export const ENTRY_SIGNALS: StrategyElement[] = [
  /* --- 基础入场信号 (7个保留) --- */
  { id: 'ma_cross', type: 'entry', name: '均线金叉', description: '5日均线上穿10日均线时买入' },
  { id: 'macd_turn_pos', type: 'entry', name: 'MACD转正', description: 'MACD柱状线由负转正时买入' },
  { id: 'kdj_oversold', type: 'entry', name: 'KDJ超卖', description: 'K值低于阈值且上穿D值时买入', params: [{ name: 'threshold', value: 20, min: 10, max: 40, step: 5 }] },
  { id: 'rsi_deep_oversold', type: 'entry', name: 'RSI深度超卖', description: 'RSI6低于阈值时买入', params: [{ name: 'threshold', value: 25, min: 15, max: 35, step: 5 }] },
  { id: 'bb_lower_bounce', type: 'entry', name: '下轨反弹', description: '价格触及布林带下轨后反弹买入' },
  { id: 'breakout_high', type: 'entry', name: '突破新高', description: '价格突破近N日最高价时买入', params: [{ name: 'days', value: 20, min: 5, max: 60, step: 5 }] },
  { id: 'support_bounce', type: 'entry', name: '支撑反弹', description: '价格接近支撑位时反弹买入' },
  /* --- 扩展入场信号 (13个) --- */
  {
    id: 'multi_factor_long', type: 'entry', name: '多因子共振看多',
    description: '趋势、动量、量能、波动率多因子综合得分超过阈值时买入',
    params: [
      { name: 'trendWeight', value: 0.3, min: 0, max: 1, step: 0.05 },
      { name: 'momentumWeight', value: 0.3, min: 0, max: 1, step: 0.05 },
      { name: 'volumeWeight', value: 0.2, min: 0, max: 1, step: 0.05 },
      { name: 'volatilityWeight', value: 0.2, min: 0, max: 1, step: 0.05 },
      { name: 'threshold', value: 60, min: 30, max: 90, step: 5 },
    ],
  },
  { id: 'ma_bull_arrange', type: 'entry', name: '均线多头排列', description: '5>10>20>60均线多头排列时买入' },
  {
    id: 'volume_price_surge', type: 'entry', name: '量价齐升',
    description: '价格上涨+成交量放大指定倍数时买入',
    params: [
      { name: 'volumeMult', value: 1.5, min: 1, max: 5, step: 0.1 },
      { name: 'priceChangeMin', value: 2, min: 0.5, max: 10, step: 0.5 },
    ],
  },
  { id: 'bb_mid_cross_up', type: 'entry', name: '突破布林中轨', description: '价格从下方突破布林带中轨时买入' },
  { id: 'rsi_bull_divergence', type: 'entry', name: 'RSI底背离', description: 'RSI低点抬高但价格创新低时买入' },
  { id: 'macd_bull_divergence', type: 'entry', name: 'MACD底背离', description: 'MACD低点抬高但价格创新低时买入' },
  {
    id: 'pullback_on_low_vol', type: 'entry', name: '缩量回调',
    description: '缩量回调至支撑位附近时买入',
    params: [
      { name: 'volShrink', value: 0.7, min: 0.3, max: 1, step: 0.05 },
      { name: 'supportDist', value: 2, min: 0.5, max: 10, step: 0.5 },
    ],
  },
  {
    id: 'gap_fill_bounce', type: 'entry', name: '跳空回补',
    description: '向下跳空后回补时买入',
    params: [{ name: 'gapPct', value: 1.0, min: 0.3, max: 5, step: 0.1 }],
  },
  {
    id: 'break_prev_high', type: 'entry', name: '突破前期高点',
    description: '突破N日高点时买入',
    params: [{ name: 'days', value: 60, min: 20, max: 250, step: 5 }],
  },
  {
    id: 'kdj_golden_cross', type: 'entry', name: 'KDJ金叉',
    description: 'K线上穿D线时买入',
    params: [{ name: 'threshold', value: 50, min: 10, max: 80, step: 5 }],
  },
  {
    id: 'wr_oversold', type: 'entry', name: 'WR超卖',
    description: '威廉指标低于阈值时买入',
    params: [{ name: 'threshold', value: -80, min: -100, max: -50, step: 5 }],
  },
  {
    id: 'cci_oversold', type: 'entry', name: 'CCI超卖',
    description: 'CCI低于阈值时买入',
    params: [{ name: 'threshold', value: -100, min: -300, max: 0, step: 10 }],
  },
  {
    id: 'volume_breakout', type: 'entry', name: '放量突破',
    description: '成交量放大指定倍数+价格突破时买入',
    params: [{ name: 'volMult', value: 3.0, min: 1.5, max: 10, step: 0.5 }],
  },
  /* --- 新增入场信号 v2 (11个) --- */
  {
    id: 'rsi_macd_vol_entry', type: 'entry', name: 'RSI+MACD+量能共振',
    description: 'RSI超卖+MACD金叉+成交量放大，三因子同时满足时买入',
    params: [
      { name: 'rsiThreshold', value: 35, min: 15, max: 45, step: 5 },
      { name: 'volMult', value: 1.5, min: 1, max: 5, step: 0.1 },
    ],
  },
  {
    id: 'multi_timeframe_resonance', type: 'entry', name: '多周期共振',
    description: '短期均线在长期均线上方，且MACD正值时买入',
    params: [
      { name: 'shortPeriod', value: 5, min: 3, max: 20, step: 1 },
      { name: 'longPeriod', value: 20, min: 10, max: 60, step: 5 },
    ],
  },
  {
    id: 'pattern_double_bottom', type: 'entry', name: '双底形态',
    description: '识别双底形态完成后突破颈线时买入',
    params: [{ name: 'lookback', value: 30, min: 15, max: 60, step: 5 }],
  },
  {
    id: 'pattern_head_shoulder_bottom', type: 'entry', name: '头肩底形态',
    description: '识别头肩底形态完成后突破颈线时买入',
    params: [{ name: 'lookback', value: 40, min: 20, max: 80, step: 5 }],
  },
  {
    id: 'pattern_cup_handle', type: 'entry', name: '杯柄形态',
    description: '识别杯柄形态的杯部形成后突破买入',
    params: [{ name: 'lookback', value: 50, min: 30, max: 100, step: 5 }],
  },
  {
    id: 'bb_squeeze_breakout', type: 'entry', name: '布林带Squeeze突破',
    description: '布林带带宽收缩后向上突破时买入',
    params: [
      { name: 'squeezeThreshold', value: 0.05, min: 0.02, max: 0.1, step: 0.01 },
      { name: 'lookback', value: 20, min: 10, max: 40, step: 5 },
    ],
  },
  {
    id: 'consecutive_up_days', type: 'entry', name: '连续N日收阳',
    description: '连续N日收盘价高于前一日时买入',
    params: [{ name: 'days', value: 3, min: 2, max: 10, step: 1 }],
  },
  {
    id: 'vwap_bounce', type: 'entry', name: 'VWAP支撑反弹',
    description: '价格回调至VWAP附近后反弹买入',
    params: [{ name: 'tolerance', value: 1.0, min: 0.2, max: 5, step: 0.2 }],
  },
  {
    id: 'ichimoku_bullish', type: 'entry', name: 'Ichimoku多头',
    description: '价格在云之上，转换线在基准线上方时买入',
  },
  {
    id: 'supertrend_flip', type: 'entry', name: 'SuperTrend翻转',
    description: 'SuperTrend由空头翻转为多头时买入',
    params: [
      { name: 'period', value: 10, min: 5, max: 20, step: 1 },
      { name: 'mult', value: 3, min: 1, max: 5, step: 0.5 },
    ],
  },
  {
    id: 'parabolic_sar_confirm', type: 'entry', name: 'Parabolic SAR确认',
    description: 'SAR点从价格上方转到下方时买入',
    params: [
      { name: 'afStep', value: 0.02, min: 0.01, max: 0.05, step: 0.01 },
      { name: 'afMax', value: 0.2, min: 0.1, max: 0.5, step: 0.05 },
    ],
  },
];

/* ── 出场信号 (15+ 个) ── */

export const EXIT_SIGNALS: StrategyElement[] = [
  /* --- 基础出场信号 (7个保留) --- */
  { id: 'ma_death', type: 'exit', name: '均线死叉', description: '5日均线下穿10日均线时卖出' },
  { id: 'macd_turn_neg', type: 'exit', name: 'MACD转负', description: 'MACD柱状线由正转负时卖出' },
  { id: 'kdj_overbought', type: 'exit', name: 'KDJ超买', description: 'K值高于阈值且下穿D值时卖出', params: [{ name: 'threshold', value: 80, min: 60, max: 90, step: 5 }] },
  { id: 'rsi_deep_overbought', type: 'exit', name: 'RSI深度超买', description: 'RSI6高于阈值时卖出', params: [{ name: 'threshold', value: 75, min: 65, max: 85, step: 5 }] },
  { id: 'bb_upper_reversal', type: 'exit', name: '上轨反转', description: '价格触及布林带上轨后回落卖出' },
  { id: 'breakdown_low', type: 'exit', name: '跌破新低', description: '价格跌破近N日最低价时卖出', params: [{ name: 'days', value: 20, min: 5, max: 60, step: 5 }] },
  { id: 'resistance_reject', type: 'exit', name: '阻力回落', description: '价格接近阻力位后回落卖出' },
  /* --- 扩展出场信号 (8个) --- */
  {
    id: 'multi_factor_short', type: 'exit', name: '多因子共振看空',
    description: '多因子同时看空时卖出',
    params: [
      { name: 'trendWeight', value: 0.3, min: 0, max: 1, step: 0.05 },
      { name: 'momentumWeight', value: 0.3, min: 0, max: 1, step: 0.05 },
      { name: 'volumeWeight', value: 0.2, min: 0, max: 1, step: 0.05 },
      { name: 'volatilityWeight', value: 0.2, min: 0, max: 1, step: 0.05 },
      { name: 'threshold', value: 60, min: 30, max: 90, step: 5 },
    ],
  },
  { id: 'ma_bear_arrange', type: 'exit', name: '均线空头排列', description: '5<10<20<60均线空头排列时卖出' },
  { id: 'volume_price_divergence', type: 'exit', name: '量价背离', description: '价格新高但成交量萎缩时卖出' },
  { id: 'rsi_bear_divergence', type: 'exit', name: 'RSI顶背离', description: 'RSI高点降低但价格创新高时卖出' },
  { id: 'macd_bear_divergence', type: 'exit', name: 'MACD顶背离', description: 'MACD高点降低但价格创新高时卖出' },
  {
    id: 'dynamic_take_profit', type: 'exit', name: '动态止盈',
    description: '收益率超过目标后回落指定百分比时止盈',
    params: [
      { name: 'profitTarget', value: 10, min: 2, max: 50, step: 1 },
      { name: 'pullBack', value: 3, min: 0.5, max: 10, step: 0.5 },
    ],
  },
  {
    id: 'time_based_exit', type: 'exit', name: '时间止盈',
    description: '持仓超过N天后强制卖出',
    params: [{ name: 'maxDays', value: 20, min: 3, max: 60, step: 1 }],
  },
  {
    id: 'wr_overbought', type: 'exit', name: 'WR超买',
    description: '威廉指标高于阈值时卖出',
    params: [{ name: 'threshold', value: -20, min: -50, max: 0, step: 5 }],
  },
  /* --- 新增出场信号 v2 (8个) --- */
  {
    id: 'rsi_macd_vol_exit', type: 'exit', name: 'RSI+MACD共振看空',
    description: 'RSI超买+MACD死叉，两因子同时满足时卖出',
    params: [
      { name: 'rsiThreshold', value: 70, min: 55, max: 85, step: 5 },
    ],
  },
  {
    id: 'bb_reverse_break', type: 'exit', name: '布林带反向突破',
    description: '价格从上轨外侧跌回轨道内时卖出',
    params: [{ name: 'tolerance', value: 0.5, min: 0.1, max: 2, step: 0.1 }],
  },
  {
    id: 'target_profit_exit', type: 'exit', name: '目标收益出场',
    description: '达到目标收益率时卖出',
    params: [{ name: 'targetPct', value: 10, min: 2, max: 50, step: 1 }],
  },
  {
    id: 'time_decay_exit', type: 'exit', name: '时间衰减出场',
    description: '持仓超过N天后衰减出场（盈利不足时）',
    params: [
      { name: 'maxDays', value: 15, min: 3, max: 60, step: 1 },
      { name: 'minProfitPct', value: 2, min: 0, max: 10, step: 0.5 },
    ],
  },
  {
    id: 'pattern_failure_exit', type: 'exit', name: '形态失败出场',
    description: '入场形态预期失败后止损出场',
    params: [{ name: 'failurePct', value: 3, min: 1, max: 10, step: 0.5 }],
  },
  {
    id: 'vwap_resistance_fall', type: 'exit', name: 'VWAP阻力回落',
    description: '价格触及VWAP后未能突破并回落时卖出',
    params: [{ name: 'tolerance', value: 1.0, min: 0.2, max: 5, step: 0.2 }],
  },
  {
    id: 'volume_shrink_exit', type: 'exit', name: '成交量萎缩',
    description: '价格横盘但成交量持续萎缩时卖出',
    params: [
      { name: 'shrinkRatio', value: 0.6, min: 0.3, max: 1, step: 0.05 },
      { name: 'lookback', value: 5, min: 3, max: 15, step: 1 },
    ],
  },
  {
    id: 'trend_reversal_exit', type: 'exit', name: '趋势反转确认',
    description: 'ADX趋势减弱+价格跌破关键均线时卖出',
    params: [
      { name: 'adxThreshold', value: 20, min: 10, max: 40, step: 5 },
      { name: 'maPeriod', value: 20, min: 5, max: 60, step: 5 },
    ],
  },
];

/* ── 过滤器 (10+ 个) ── */

export const FILTERS: StrategyElement[] = [
  /* --- 基础过滤器 (2个保留) --- */
  { id: 'trend_filter', type: 'filter', name: '趋势过滤', description: '仅允许收盘价在20日均线上方时交易（上升趋势）' },
  { id: 'vol_filter', type: 'filter', name: '量能过滤', description: '仅允许成交量大于5日均量倍数时交易', params: [{ name: 'multiplier', value: 1.2, min: 1.0, max: 3.0, step: 0.1 }] },
  /* --- 扩展过滤器 (8个) --- */
  {
    id: 'volatility_filter', type: 'filter', name: '波动率过滤',
    description: '仅当ATR/价格低于阈值时交易（过滤高波动期）',
    params: [{ name: 'maxAtrPct', value: 3.0, min: 0.5, max: 10, step: 0.5 }],
  },
  {
    id: 'min_volume_filter', type: 'filter', name: '最小成交量过滤',
    description: '仅当成交量大于阈值时交易',
    params: [{ name: 'minVolume', value: 1000000, min: 100000, max: 10000000, step: 100000 }],
  },
  {
    id: 'time_filter', type: 'filter', name: '时间过滤',
    description: '仅在特定月份交易（默认允许全部月份）',
    params: [{ name: 'allowedMonths', value: '1,2,3,4,5,6,7,8,9,10,11,12' }],
  },
  {
    id: 'trend_strength_filter', type: 'filter', name: '趋势强度过滤',
    description: '仅当ADX大于阈值时交易',
    params: [{ name: 'minAdx', value: 20, min: 5, max: 50, step: 5 }],
  },
  {
    id: 'rsi_zone_filter', type: 'filter', name: 'RSI区间过滤',
    description: '仅当RSI在指定区间时交易',
    params: [
      { name: 'minRsi', value: 30, min: 10, max: 50, step: 5 },
      { name: 'maxRsi', value: 70, min: 50, max: 90, step: 5 },
    ],
  },
  {
    id: 'price_range_filter', type: 'filter', name: '价格区间过滤',
    description: '仅当价格在指定区间时交易',
    params: [
      { name: 'minPrice', value: 5, min: 1, max: 100, step: 1 },
      { name: 'maxPrice', value: 500, min: 100, max: 1000, step: 10 },
    ],
  },
  {
    id: 'bb_position_filter', type: 'filter', name: '布林带位置过滤',
    description: '仅当价格在布林带特定百分比位置时交易',
    params: [
      { name: 'minPercentB', value: 0.1, min: 0, max: 0.5, step: 0.05 },
      { name: 'maxPercentB', value: 0.9, min: 0.5, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'market_regime_filter', type: 'filter', name: '市场环境过滤',
    description: '仅在市场处于特定状态时交易',
    params: [{ name: 'regime', value: 'trending' }],
  },
  /* --- 新增过滤器 v2 (2个) --- */
  {
    id: 'session_time_filter', type: 'filter', name: '交易时段过滤',
    description: '仅在指定交易时段内允许交易',
    params: [
      { name: 'startHour', value: 9, min: 0, max: 23, step: 1 },
      { name: 'endHour', value: 15, min: 0, max: 23, step: 1 },
    ],
  },
  {
    id: 'correlation_filter', type: 'filter', name: '相关性过滤',
    description: '排除与大盘相关性过高的标的',
    params: [{ name: 'maxCorrelation', value: 0.9, min: 0.5, max: 1, step: 0.05 }],
  },
];

/* ── 风控规则 (8+ 个) ── */

export const RISK_MANAGEMENT: StrategyElement[] = [
  /* --- 基础风控 (3个保留) --- */
  { id: 'fixed_stop', type: 'risk', name: '固定止损', description: '亏损固定百分比时止损', params: [{ name: 'stopPct', value: 3, min: 1, max: 10, step: 0.5 }] },
  { id: 'trailing_stop', type: 'risk', name: '移动止损', description: '从最高点回撤固定百分比时止损', params: [{ name: 'trailPct', value: 2, min: 1, max: 5, step: 0.5 }] },
  { id: 'atr_stop', type: 'risk', name: 'ATR止损', description: '基于波动率的动态止损（简化实现）', params: [{ name: 'atrMultiplier', value: 2, min: 1, max: 4, step: 0.5 }] },
  /* --- 扩展风控 (5个) --- */
  {
    id: 'kelly_position', type: 'risk', name: '凯利仓位',
    description: '根据胜率和赔率动态调整仓位',
    params: [
      { name: 'kellyFraction', value: 0.5, min: 0.1, max: 1, step: 0.1 },
      { name: 'maxPosition', value: 1.0, min: 0.1, max: 1, step: 0.1 },
    ],
  },
  {
    id: 'vol_position', type: 'risk', name: '波动率仓位',
    description: '根据波动率调整仓位（波动大时仓位小）',
    params: [
      { name: 'targetVol', value: 10, min: 5, max: 30, step: 1 },
      { name: 'maxPosition', value: 1.0, min: 0.1, max: 1, step: 0.1 },
    ],
  },
  {
    id: 'max_drawdown_stop', type: 'risk', name: '最大回撤止损',
    description: '组合回撤超过阈值时清仓',
    params: [{ name: 'maxDrawdown', value: 10, min: 3, max: 30, step: 1 }],
  },
  {
    id: 'scale_out', type: 'risk', name: '分批止盈',
    description: '盈利达目标时分批减仓',
    params: [
      { name: 'target1', value: 5, min: 1, max: 20, step: 1 },
      { name: 'pct1', value: 0.3, min: 0.1, max: 1, step: 0.1 },
      { name: 'target2', value: 10, min: 1, max: 30, step: 1 },
      { name: 'pct2', value: 0.3, min: 0.1, max: 1, step: 0.1 },
      { name: 'target3', value: 20, min: 1, max: 50, step: 1 },
      { name: 'pct3', value: 0.4, min: 0.1, max: 1, step: 0.1 },
    ],
  },
  {
    id: 'time_stop', type: 'risk', name: '时间止损',
    description: '持仓超过N天未盈利则止损',
    params: [
      { name: 'maxDays', value: 10, min: 3, max: 30, step: 1 },
      { name: 'minProfit', value: 0, min: -5, max: 5, step: 0.5 },
    ],
  },
  /* --- 新增风控 v2 (3个) --- */
  {
    id: 'consecutive_loss_stop', type: 'risk', name: '连续亏损止损',
    description: '连续N次亏损后暂停交易',
    params: [{ name: 'maxConsecutiveLoss', value: 3, min: 2, max: 10, step: 1 }],
  },
  {
    id: 'daily_loss_limit', type: 'risk', name: '单日亏损限制',
    description: '单日最大亏损达到阈值时停止交易',
    params: [{ name: 'dailyLossPct', value: 5, min: 1, max: 15, step: 0.5 }],
  },
  {
    id: 'stepped_take_profit', type: 'risk', name: '阶梯止盈',
    description: '分阶段移动止盈线，利润越高止盈线越紧',
    params: [
      { name: 'step1Pct', value: 5, min: 2, max: 20, step: 1 },
      { name: 'trail1', value: 3, min: 1, max: 10, step: 0.5 },
      { name: 'step2Pct', value: 15, min: 5, max: 30, step: 1 },
      { name: 'trail2', value: 1.5, min: 0.5, max: 5, step: 0.5 },
    ],
  },
];

/* ── 仓位管理 (3个) ── */

export const POSITION_MANAGEMENT: StrategyElement[] = [
  {
    id: 'fixed_position', type: 'position', name: '固定仓位',
    description: '每次交易使用固定金额',
    params: [{ name: 'positionSize', value: 10000, min: 1000, max: 1000000, step: 1000 }],
  },
  {
    id: 'pct_position', type: 'position', name: '百分比仓位',
    description: '按资金百分比分配仓位',
    params: [{ name: 'pct', value: 0.2, min: 0.05, max: 1, step: 0.05 }],
  },
  {
    id: 'pyramid_add', type: 'position', name: '金字塔加仓',
    description: '盈利后金字塔式加仓',
    params: [
      { name: 'initialPct', value: 0.1, min: 0.05, max: 0.5, step: 0.05 },
      { name: 'addPct', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
      { name: 'addTrigger', value: 3, min: 1, max: 10, step: 0.5 },
      { name: 'maxAdds', value: 3, min: 1, max: 10, step: 1 },
    ],
  },
];

export function getElementById(id: string): StrategyElement | undefined {
  return [...ENTRY_SIGNALS, ...EXIT_SIGNALS, ...FILTERS, ...RISK_MANAGEMENT, ...POSITION_MANAGEMENT].find((e) => e.id === id);
}

export function getElementsByType(type: StrategyElement['type']): StrategyElement[] {
  switch (type) {
    case 'entry': return ENTRY_SIGNALS;
    case 'exit': return EXIT_SIGNALS;
    case 'filter': return FILTERS;
    case 'risk': return RISK_MANAGEMENT;
    case 'position': return POSITION_MANAGEMENT;
    default: return [];
  }
}

/* ──────────────────────── Strategy Templates ──────────────────────── */

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  elements: StrategyElement[];
  recommendedHoldingDays: number;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'trend_following',
    name: '趋势跟踪策略',
    description: '基于均线系统和趋势强度，跟随市场主要趋势进行交易。适合趋势明显的市场环境。',
    category: '趋势类',
    recommendedHoldingDays: 20,
    elements: [
      { ...ENTRY_SIGNALS[0], params: undefined }, // ma_cross
      { ...ENTRY_SIGNALS[9], params: [{ name: 'volumeMult', value: 1.5, min: 1, max: 5, step: 0.1 }, { name: 'priceChangeMin', value: 2, min: 0.5, max: 10, step: 0.5 }] }, // volume_price_surge
      { ...EXIT_SIGNALS[0], params: undefined }, // ma_death
      { ...RISK_MANAGEMENT[2], params: [{ name: 'atrMultiplier', value: 2.5, min: 1, max: 4, step: 0.5 }] }, // atr_stop
      { ...FILTERS[0], params: undefined }, // trend_filter
    ],
  },
  {
    id: 'mean_reversion',
    name: '均值回归策略',
    description: '利用价格偏离均值后的回归特性，在超卖区域买入、超买区域卖出。适合震荡市场。',
    category: '回归类',
    recommendedHoldingDays: 10,
    elements: [
      { ...ENTRY_SIGNALS[3], params: [{ name: 'threshold', value: 30, min: 15, max: 35, step: 5 }] }, // rsi_deep_oversold
      { ...ENTRY_SIGNALS[4], params: undefined }, // bb_lower_bounce
      { ...EXIT_SIGNALS[3], params: [{ name: 'threshold', value: 70, min: 65, max: 85, step: 5 }] }, // rsi_deep_overbought
      { ...EXIT_SIGNALS[4], params: undefined }, // bb_upper_reversal
      { ...RISK_MANAGEMENT[0], params: [{ name: 'stopPct', value: 2.5, min: 1, max: 10, step: 0.5 }] }, // fixed_stop
      { ...FILTERS[7], params: [{ name: 'regime', value: 'ranging' }] }, // market_regime_filter
    ],
  },
  {
    id: 'breakout_trading',
    name: '突破交易策略',
    description: '在价格突破关键阻力位时入场，捕捉趋势启动的早期阶段。适合波动率从低到高的转折点。',
    category: '突破类',
    recommendedHoldingDays: 15,
    elements: [
      { ...ENTRY_SIGNALS[5], params: [{ name: 'days', value: 20, min: 5, max: 60, step: 5 }] }, // breakout_high
      { ...ENTRY_SIGNALS[19], params: [{ name: 'squeezeThreshold', value: 0.05, min: 0.02, max: 0.1, step: 0.01 }, { name: 'lookback', value: 20, min: 10, max: 40, step: 5 }] }, // bb_squeeze_breakout
      { ...EXIT_SIGNALS[14], params: [{ name: 'targetPct', value: 15, min: 2, max: 50, step: 1 }] }, // target_profit_exit
      { ...EXIT_SIGNALS[5], params: [{ name: 'days', value: 10, min: 5, max: 60, step: 5 }] }, // breakdown_low
      { ...RISK_MANAGEMENT[0], params: [{ name: 'stopPct', value: 4, min: 1, max: 10, step: 0.5 }] }, // fixed_stop
      { ...FILTERS[3], params: [{ name: 'minAdx', value: 15, min: 5, max: 50, step: 5 }] }, // trend_strength_filter
    ],
  },
  {
    id: 'multi_factor_momentum',
    name: '多因子动量策略',
    description: '综合RSI、MACD和成交量等多因子信号，在多重确认后入场。适合中高波动市场。',
    category: '因子类',
    recommendedHoldingDays: 15,
    elements: [
      { ...ENTRY_SIGNALS[7], params: [{ name: 'rsiThreshold', value: 35, min: 15, max: 45, step: 5 }, { name: 'volMult', value: 1.5, min: 1, max: 5, step: 0.1 }] }, // rsi_macd_vol_entry
      { ...EXIT_SIGNALS[15], params: [{ name: 'rsiThreshold', value: 70, min: 55, max: 85, step: 5 }] }, // rsi_macd_vol_exit
      { ...RISK_MANAGEMENT[1], params: [{ name: 'trailPct', value: 2.5, min: 1, max: 5, step: 0.5 }] }, // trailing_stop
      { ...FILTERS[2], params: [{ name: 'maxAtrPct', value: 4, min: 0.5, max: 10, step: 0.5 }] }, // volatility_filter
    ],
  },
  {
    id: 'pattern_recognition',
    name: '形态识别策略',
    description: '基于经典价格形态（双底、头肩底、杯柄）的自动识别和交易。适合中长期投资。',
    category: '形态类',
    recommendedHoldingDays: 30,
    elements: [
      { ...ENTRY_SIGNALS[16], params: [{ name: 'lookback', value: 30, min: 15, max: 60, step: 5 }] }, // pattern_double_bottom
      { ...ENTRY_SIGNALS[17], params: [{ name: 'lookback', value: 40, min: 20, max: 80, step: 5 }] }, // pattern_head_shoulder_bottom
      { ...EXIT_SIGNALS[18], params: [{ name: 'failurePct', value: 4, min: 1, max: 10, step: 0.5 }] }, // pattern_failure_exit
      { ...EXIT_SIGNALS[14], params: [{ name: 'targetPct', value: 20, min: 2, max: 50, step: 1 }] }, // target_profit_exit
      { ...RISK_MANAGEMENT[0], params: [{ name: 'stopPct', value: 5, min: 1, max: 10, step: 0.5 }] }, // fixed_stop
    ],
  },
  {
    id: 'volatility_expansion',
    name: '波动率扩张策略',
    description: '在布林带 squeeze 后捕捉波动率扩张带来的趋势行情。适合低波动后的突破行情。',
    category: '波动类',
    recommendedHoldingDays: 12,
    elements: [
      { ...ENTRY_SIGNALS[19], params: [{ name: 'squeezeThreshold', value: 0.04, min: 0.02, max: 0.1, step: 0.01 }, { name: 'lookback', value: 20, min: 10, max: 40, step: 5 }] }, // bb_squeeze_breakout
      { ...ENTRY_SIGNALS[24], params: [{ name: 'afStep', value: 0.02, min: 0.01, max: 0.05, step: 0.01 }, { name: 'afMax', value: 0.2, min: 0.1, max: 0.5, step: 0.05 }] }, // parabolic_sar_confirm
      { ...EXIT_SIGNALS[16], params: [{ name: 'bbTolerance', value: 0.5, min: 0.1, max: 2, step: 0.1 }] }, // bb_reverse_break
      { ...RISK_MANAGEMENT[2], params: [{ name: 'atrMultiplier', value: 3, min: 1, max: 4, step: 0.5 }] }, // atr_stop
      { ...FILTERS[2], params: [{ name: 'maxAtrPct', value: 2, min: 0.5, max: 10, step: 0.5 }] }, // volatility_filter
    ],
  },
];

/* ──────────────────────── Backtest configuration ──────────────────────── */

export interface BacktestConfig {
  holdingPeriodMax: number;
  entryLogic: 'and' | 'or';
  exitLogic: 'and' | 'or';
  initialCapital: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  holdingPeriodMax: 30,
  entryLogic: 'or',
  exitLogic: 'or',
  initialCapital: 100000,
};

/* ──────────────────────── Extended Indicators Cache ──────────────────────── */

interface ExtendedIndicators {
  wr: number[];
  cci: number[];
  atr: number[];
  adx: number[];
  ma60: number[];
  ma120: number[];
  volMa5: number[];
  volMa20: number[];
  rsiBullDiv: boolean[];
  rsiBearDiv: boolean[];
  macdBullDiv: boolean[];
  macdBearDiv: boolean[];
  vwap: number[];
  supertrendDir: number[];
  psar: number[];
  ichimoku: {
    tenkan: number[];
    kijun: number[];
    senkouA: number[];
    senkouB: number[];
  };
  doubleBottom: boolean[];
  headShoulderBottom: boolean[];
  cupHandle: boolean[];
  bbSqueeze: boolean[];
  consecutiveUp: boolean[];
}

function calculateExtendedIndicators(kline: KLineData[], indicators: TechnicalIndicators): ExtendedIndicators {
  const closes = kline.map((k) => k.close);
  const volumes = kline.map((k) => k.volume);

  const st = supertrend(kline, 10, 3);
  const ichi = ichimoku(kline);

  return {
    wr: wr(kline, 14),
    cci: cci(kline, 14),
    atr: atr(kline, 14),
    adx: adx(kline, 14),
    ma60: ma(closes, 60),
    ma120: ma(closes, 120),
    volMa5: ma(volumes, 5),
    volMa20: ma(volumes, 20),
    rsiBullDiv: findBullDivergence(closes, indicators.rsi6, 20),
    rsiBearDiv: findBearDivergence(closes, indicators.rsi6, 20),
    macdBullDiv: findBullDivergence(closes, indicators.macdHist, 20),
    macdBearDiv: findBearDivergence(closes, indicators.macdHist, 20),
    vwap: vwap(kline),
    supertrendDir: st.direction,
    psar: parabolicSAR(kline, 0.02, 0.2),
    ichimoku: {
      tenkan: ichi.tenkan,
      kijun: ichi.kijun,
      senkouA: ichi.senkouA,
      senkouB: ichi.senkouB,
    },
    doubleBottom: detectDoubleBottom(kline, 30, 0.03),
    headShoulderBottom: detectHeadShoulderBottom(kline, 40),
    cupHandle: detectCupHandle(kline, 50),
    bbSqueeze: detectBBSqueeze(kline, 20, 0.05),
    consecutiveUp: consecutiveUpDays(closes, 3),
  };
}

/* ──────────────────────── Entry Signal Evaluation ──────────────────────── */

function evaluateEntrySignal(
  sig: StrategyElement,
  i: number,
  kline: KLineData[],
  indicators: TechnicalIndicators,
  ext: ExtendedIndicators,
  closes: number[],
  volumes: number[],
): boolean {
  // Need sufficient data for multi-factor signals
  if (i < 5) return false;
  const prev = i - 1;

  switch (sig.id) {
    /* --- 基础入场 --- */
    case 'ma_cross': {
      const ma5 = indicators.ma5;
      const ma10 = indicators.ma10;
      return !isNaN(ma5[prev]) && !isNaN(ma10[prev]) && !isNaN(ma5[i]) && !isNaN(ma10[i]) &&
        ma5[prev] <= ma10[prev] && ma5[i] > ma10[i];
    }
    case 'macd_turn_pos':
      return indicators.macdHist[i] > 0 && indicators.macdHist[prev] <= 0;
    case 'kdj_oversold': {
      const threshold = getParamValue(sig, 'threshold', 20);
      return indicators.kdjK[i] < threshold && indicators.kdjK[i] > indicators.kdjD[i];
    }
    case 'rsi_deep_oversold': {
      const threshold = getParamValue(sig, 'threshold', 25);
      return indicators.rsi6[i] < threshold;
    }
    case 'bb_lower_bounce':
      return closes[i] <= indicators.bbLower[i] * 1.01;
    case 'breakout_high': {
      const days = getParamValue(sig, 'days', 20);
      const slice = closes.slice(Math.max(0, i - days), i);
      return slice.length > 0 && closes[i] > Math.max(...slice);
    }
    case 'support_bounce':
      return Math.abs(closes[i] - indicators.support) / closes[i] < 0.02;

    /* --- 扩展入场 --- */
    case 'multi_factor_long': {
      const tw = getParamValue(sig, 'trendWeight', 0.3);
      const mw = getParamValue(sig, 'momentumWeight', 0.3);
      const vw = getParamValue(sig, 'volumeWeight', 0.2);
      const vlw = getParamValue(sig, 'volatilityWeight', 0.2);
      const threshold = getParamValue(sig, 'threshold', 60);
      if (isNaN(indicators.ma5[i]) || isNaN(indicators.ma10[i]) || isNaN(indicators.ma20[i])) return false;
      let trendScore = 0;
      if (closes[i] > indicators.ma20[i]) trendScore += 1;
      if (indicators.ma5[i] > indicators.ma10[i]) trendScore += 1;
      if (indicators.macdHist[i] > 0) trendScore += 1;
      trendScore = (trendScore / 3) * 100;
      let momScore = 0;
      if (indicators.rsi6[i] > 50) momScore += 1;
      if (indicators.kdjK[i] > indicators.kdjD[i]) momScore += 1;
      if (indicators.kdjK[i] < 50) momScore += 1;
      momScore = (momScore / 3) * 100;
      let volScore = 0;
      if (volumes[i] > ext.volMa5[i] * 1.2) volScore += 1;
      if (volumes[i] > volumes[prev]) volScore += 1;
      volScore = (volScore / 2) * 100;
      let volatScore = 0;
      const bbWidth = (indicators.bbUpper[i] - indicators.bbLower[i]) / indicators.bbMid[i];
      if (!isNaN(bbWidth) && bbWidth < 0.1) volatScore += 1;
      if (closes[i] > closes[prev]) volatScore += 1;
      volatScore = (volatScore / 2) * 100;
      const composite = trendScore * tw + momScore * mw + volScore * vw + volatScore * vlw;
      return composite >= threshold;
    }
    case 'ma_bull_arrange': {
      const ma5 = indicators.ma5[i], ma10 = indicators.ma10[i], ma20 = indicators.ma20[i], ma60 = ext.ma60[i];
      return !isNaN(ma5) && !isNaN(ma10) && !isNaN(ma20) && !isNaN(ma60) &&
        ma5 > ma10 && ma10 > ma20 && ma20 > ma60;
    }
    case 'volume_price_surge': {
      const vm = getParamValue(sig, 'volumeMult', 1.5);
      const pcMin = getParamValue(sig, 'priceChangeMin', 2);
      const priceChange = ((closes[i] - closes[prev]) / closes[prev]) * 100;
      return priceChange >= pcMin && volumes[i] >= ext.volMa5[i] * vm;
    }
    case 'bb_mid_cross_up':
      return closes[prev] < indicators.bbMid[prev] && closes[i] > indicators.bbMid[i];
    case 'rsi_bull_divergence':
      return ext.rsiBullDiv[i];
    case 'macd_bull_divergence':
      return ext.macdBullDiv[i];
    case 'pullback_on_low_vol': {
      const vs = getParamValue(sig, 'volShrink', 0.7);
      const sd = getParamValue(sig, 'supportDist', 2);
      return volumes[i] < ext.volMa20[i] * vs &&
        Math.abs(closes[i] - indicators.support) / closes[i] < sd / 100;
    }
    case 'gap_fill_bounce': {
      const gp = getParamValue(sig, 'gapPct', 1.0);
      const gap = ((kline[i].open - kline[prev].close) / kline[prev].close) * 100;
      return gap < -gp && kline[i].close > kline[i].open;
    }
    case 'break_prev_high': {
      const days = getParamValue(sig, 'days', 60);
      const slice = closes.slice(Math.max(0, i - days), i);
      return slice.length > 0 && closes[i] > Math.max(...slice);
    }
    case 'kdj_golden_cross': {
      const threshold = getParamValue(sig, 'threshold', 50);
      return indicators.kdjK[prev] <= indicators.kdjD[prev] &&
        indicators.kdjK[i] > indicators.kdjD[i] &&
        indicators.kdjK[i] < threshold;
    }
    case 'wr_oversold': {
      const threshold = getParamValue(sig, 'threshold', -80);
      return ext.wr[i] < threshold;
    }
    case 'cci_oversold': {
      const threshold = getParamValue(sig, 'threshold', -100);
      return ext.cci[i] < threshold;
    }
    case 'volume_breakout': {
      const vm = getParamValue(sig, 'volMult', 3.0);
      return volumes[i] >= ext.volMa20[i] * vm && closes[i] > closes[prev];
    }

    /* --- 新增入场 v2 --- */
    case 'rsi_macd_vol_entry': {
      const rsiThreshold = getParamValue(sig, 'rsiThreshold', 35);
      const volMult = getParamValue(sig, 'volMult', 1.5);
      const rsiOversold = indicators.rsi6[i] < rsiThreshold;
      const macdGolden = indicators.macdHist[i] > 0 && indicators.macdHist[prev] <= 0;
      const volumeSurge = volumes[i] >= ext.volMa5[i] * volMult;
      return rsiOversold && macdGolden && volumeSurge;
    }
    case 'multi_timeframe_resonance': {
      const shortPeriod = getParamValue(sig, 'shortPeriod', 5);
      const longPeriod = getParamValue(sig, 'longPeriod', 20);
      const shortMA = ma(closes, shortPeriod);
      const longMA = ma(closes, longPeriod);
      return !isNaN(shortMA[i]) && !isNaN(longMA[i]) &&
        shortMA[i] > longMA[i] && closes[i] > shortMA[i] &&
        indicators.macdHist[i] > 0;
    }
    case 'pattern_double_bottom': {
      const lookback = getParamValue(sig, 'lookback', 30);
      return ext.doubleBottom[i];
    }
    case 'pattern_head_shoulder_bottom': {
      return ext.headShoulderBottom[i];
    }
    case 'pattern_cup_handle': {
      return ext.cupHandle[i];
    }
    case 'bb_squeeze_breakout': {
      return ext.bbSqueeze[i];
    }
    case 'consecutive_up_days': {
      const days = getParamValue(sig, 'days', 3);
      if (i < days) return false;
      for (let d = 0; d < days; d++) {
        if (closes[i - d] <= closes[i - d - 1]) return false;
      }
      return true;
    }
    case 'vwap_bounce': {
      const tolerance = getParamValue(sig, 'tolerance', 1.0);
      const dist = Math.abs(closes[i] - ext.vwap[i]) / closes[i] * 100;
      return dist < tolerance && closes[i] > closes[prev] && closes[i] > ext.vwap[i];
    }
    case 'ichimoku_bullish': {
      const ichi = ext.ichimoku;
      const aboveCloud = !isNaN(ichi.senkouA[i]) && !isNaN(ichi.senkouB[i]) &&
        closes[i] > Math.max(ichi.senkouA[i], ichi.senkouB[i]);
      const tkCross = !isNaN(ichi.tenkan[i]) && !isNaN(ichi.kijun[i]) &&
        ichi.tenkan[i] > ichi.kijun[i];
      return aboveCloud && tkCross;
    }
    case 'supertrend_flip': {
      return ext.supertrendDir[prev] === -1 && ext.supertrendDir[i] === 1;
    }
    case 'parabolic_sar_confirm': {
      return ext.psar[prev] >= kline[prev].high && ext.psar[i] < kline[i].low;
    }
    default:
      return false;
  }
}

/* ──────────────────────── Exit Signal Evaluation ──────────────────────── */

function evaluateExitSignal(
  sig: StrategyElement,
  j: number,
  entryIdx: number,
  _kline: KLineData[],
  indicators: TechnicalIndicators,
  ext: ExtendedIndicators,
  closes: number[],
  volumes: number[],
  entryPrice: number,
): boolean {
  if (j < 5) return false;
  const prev = j - 1;

  switch (sig.id) {
    /* --- 基础出场 --- */
    case 'ma_death': {
      const ma5 = indicators.ma5;
      const ma10 = indicators.ma10;
      return !isNaN(ma5[prev]) && !isNaN(ma10[prev]) && !isNaN(ma5[j]) && !isNaN(ma10[j]) &&
        ma5[prev] >= ma10[prev] && ma5[j] < ma10[j];
    }
    case 'macd_turn_neg':
      return indicators.macdHist[j] < 0 && indicators.macdHist[prev] >= 0;
    case 'kdj_overbought': {
      const threshold = getParamValue(sig, 'threshold', 80);
      return indicators.kdjK[j] > threshold && indicators.kdjK[j] < indicators.kdjD[j];
    }
    case 'rsi_deep_overbought': {
      const threshold = getParamValue(sig, 'threshold', 75);
      return indicators.rsi6[j] > threshold;
    }
    case 'bb_upper_reversal':
      return closes[j] >= indicators.bbUpper[j] * 0.99;
    case 'breakdown_low': {
      const days = getParamValue(sig, 'days', 20);
      const slice = closes.slice(Math.max(0, j - days), j);
      return slice.length > 0 && closes[j] < Math.min(...slice);
    }
    case 'resistance_reject':
      return Math.abs(closes[j] - indicators.resistance) / closes[j] < 0.02;

    /* --- 扩展出场 --- */
    case 'multi_factor_short': {
      const tw = getParamValue(sig, 'trendWeight', 0.3);
      const mw = getParamValue(sig, 'momentumWeight', 0.3);
      const vw = getParamValue(sig, 'volumeWeight', 0.2);
      const vlw = getParamValue(sig, 'volatilityWeight', 0.2);
      const threshold = getParamValue(sig, 'threshold', 60);
      if (isNaN(indicators.ma5[j]) || isNaN(indicators.ma10[j]) || isNaN(indicators.ma20[j])) return false;
      let trendScore = 0;
      if (closes[j] < indicators.ma20[j]) trendScore += 1;
      if (indicators.ma5[j] < indicators.ma10[j]) trendScore += 1;
      if (indicators.macdHist[j] < 0) trendScore += 1;
      trendScore = (trendScore / 3) * 100;
      let momScore = 0;
      if (indicators.rsi6[j] < 50) momScore += 1;
      if (indicators.kdjK[j] < indicators.kdjD[j]) momScore += 1;
      if (indicators.kdjK[j] > 50) momScore += 1;
      momScore = (momScore / 3) * 100;
      let volScore = 0;
      if (volumes[j] > ext.volMa5[j] * 1.2) volScore += 1;
      if (volumes[j] > volumes[prev]) volScore += 1;
      volScore = (volScore / 2) * 100;
      let volatScore = 0;
      const bbWidth = (indicators.bbUpper[j] - indicators.bbLower[j]) / indicators.bbMid[j];
      if (!isNaN(bbWidth) && bbWidth > 0.15) volatScore += 1;
      if (closes[j] < closes[prev]) volatScore += 1;
      volatScore = (volatScore / 2) * 100;
      const composite = trendScore * tw + momScore * mw + volScore * vw + volatScore * vlw;
      return composite >= threshold;
    }
    case 'ma_bear_arrange': {
      const ma5 = indicators.ma5[j], ma10 = indicators.ma10[j], ma20 = indicators.ma20[j], ma60 = ext.ma60[j];
      return !isNaN(ma5) && !isNaN(ma10) && !isNaN(ma20) && !isNaN(ma60) &&
        ma5 < ma10 && ma10 < ma20 && ma20 < ma60;
    }
    case 'volume_price_divergence': {
      const recentSlice = closes.slice(Math.max(0, j - 10), j);
      const isNewHigh = recentSlice.length > 0 && closes[j] > Math.max(...recentSlice);
      const isLowVol = volumes[j] < volumes[j - 5];
      return isNewHigh && isLowVol;
    }
    case 'rsi_bear_divergence':
      return ext.rsiBearDiv[j];
    case 'macd_bear_divergence':
      return ext.macdBearDiv[j];
    case 'dynamic_take_profit': {
      const pt = getParamValue(sig, 'profitTarget', 10);
      const pb = getParamValue(sig, 'pullBack', 3);
      const maxSinceEntry = Math.max(0, ...closes.slice(entryIdx, j + 1).map((c) => ((c - entryPrice) / entryPrice) * 100));
      const pnl = ((closes[j] - entryPrice) / entryPrice) * 100;
      return maxSinceEntry >= pt && maxSinceEntry - pnl >= pb;
    }
    case 'time_based_exit': {
      const maxDays = getParamValue(sig, 'maxDays', 20);
      return j - entryIdx >= maxDays;
    }
    case 'wr_overbought': {
      const threshold = getParamValue(sig, 'threshold', -20);
      return ext.wr[j] > threshold;
    }

    /* --- 新增出场 v2 --- */
    case 'rsi_macd_vol_exit': {
      const rsiThreshold = getParamValue(sig, 'rsiThreshold', 70);
      const rsiOverbought = indicators.rsi6[j] > rsiThreshold;
      const macdDeath = indicators.macdHist[j] < 0 && indicators.macdHist[prev] >= 0;
      return rsiOverbought && macdDeath;
    }
    case 'bb_reverse_break': {
      const tolerance = getParamValue(sig, 'tolerance', 0.5);
      return closes[prev] >= indicators.bbUpper[prev] * (1 - tolerance / 100) &&
        closes[j] < indicators.bbUpper[j] * (1 - tolerance / 100);
    }
    case 'target_profit_exit': {
      const targetPct = getParamValue(sig, 'targetPct', 10);
      const pnl = ((closes[j] - entryPrice) / entryPrice) * 100;
      return pnl >= targetPct;
    }
    case 'time_decay_exit': {
      const maxDays = getParamValue(sig, 'maxDays', 15);
      const minProfit = getParamValue(sig, 'minProfitPct', 2);
      const pnl = ((closes[j] - entryPrice) / entryPrice) * 100;
      return j - entryIdx >= maxDays && pnl < minProfit;
    }
    case 'pattern_failure_exit': {
      const failurePct = getParamValue(sig, 'failurePct', 3);
      const pnl = ((closes[j] - entryPrice) / entryPrice) * 100;
      return pnl <= -failurePct;
    }
    case 'vwap_resistance_fall': {
      const tolerance = getParamValue(sig, 'tolerance', 1.0);
      const dist = Math.abs(closes[j] - ext.vwap[j]) / closes[j] * 100;
      return dist < tolerance && closes[j] < closes[prev] && closes[j] < ext.vwap[j];
    }
    case 'volume_shrink_exit': {
      const shrinkRatio = getParamValue(sig, 'shrinkRatio', 0.6);
      const lookback = getParamValue(sig, 'lookback', 5);
      const volAvg = volumes.slice(Math.max(0, j - lookback), j).reduce((a, b) => a + b, 0) / lookback;
      return volumes[j] < volAvg * shrinkRatio && Math.abs(closes[j] - closes[prev]) / closes[prev] < 0.005;
    }
    case 'trend_reversal_exit': {
      const adxThreshold = getParamValue(sig, 'adxThreshold', 20);
      const maPeriod = getParamValue(sig, 'maPeriod', 20);
      const maArr = ma(closes, maPeriod);
      const adxWeakening = !isNaN(ext.adx[j]) && ext.adx[j] < adxThreshold;
      const priceBelowMA = !isNaN(maArr[j]) && closes[j] < maArr[j];
      return adxWeakening && priceBelowMA;
    }
    default:
      return false;
  }
}

/* ──────────────────────── Filter Evaluation ──────────────────────── */

function evaluateFilters(
  elements: StrategyElement[],
  i: number,
  kline: KLineData[],
  indicators: TechnicalIndicators,
  ext: ExtendedIndicators,
  closes: number[],
  volumes: number[],
): boolean {
  const filters = elements.filter((e) => e.type === 'filter');
  if (filters.length === 0) return true;

  const results: boolean[] = [];

  for (const f of filters) {
    let passed = false;
    switch (f.id) {
      case 'trend_filter':
        passed = closes[i] > indicators.ma20[i];
        break;
      case 'vol_filter': {
        const mult = getParamValue(f, 'multiplier', 1.2);
        passed = volumes[i] >= ext.volMa5[i] * mult;
        break;
      }
      case 'volatility_filter': {
        const maxAtr = getParamValue(f, 'maxAtrPct', 3.0);
        const atrPct = (ext.atr[i] / closes[i]) * 100;
        passed = !isNaN(atrPct) && atrPct <= maxAtr;
        break;
      }
      case 'min_volume_filter': {
        const minVol = getParamValue(f, 'minVolume', 1000000);
        passed = volumes[i] >= minVol;
        break;
      }
      case 'time_filter': {
        const monthsStr = getParamString(f, 'allowedMonths', '1,2,3,4,5,6,7,8,9,10,11,12');
        const allowed = monthsStr.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
        const month = new Date(kline[i].date).getMonth() + 1;
        passed = allowed.includes(month);
        break;
      }
      case 'trend_strength_filter': {
        const minAdx = getParamValue(f, 'minAdx', 20);
        passed = !isNaN(ext.adx[i]) && ext.adx[i] >= minAdx;
        break;
      }
      case 'rsi_zone_filter': {
        const minRsi = getParamValue(f, 'minRsi', 30);
        const maxRsi = getParamValue(f, 'maxRsi', 70);
        passed = !isNaN(indicators.rsi6[i]) && indicators.rsi6[i] >= minRsi && indicators.rsi6[i] <= maxRsi;
        break;
      }
      case 'price_range_filter': {
        const minPrice = getParamValue(f, 'minPrice', 5);
        const maxPrice = getParamValue(f, 'maxPrice', 500);
        passed = closes[i] >= minPrice && closes[i] <= maxPrice;
        break;
      }
      case 'bb_position_filter': {
        const minB = getParamValue(f, 'minPercentB', 0.1);
        const maxB = getParamValue(f, 'maxPercentB', 0.9);
        const pctB = percentB(closes[i], indicators.bbUpper[i], indicators.bbLower[i]);
        passed = !isNaN(pctB) && pctB >= minB && pctB <= maxB;
        break;
      }
      case 'market_regime_filter': {
        const regime = getParamString(f, 'regime', 'trending');
        const adxVal = ext.adx[i];
        if (regime === 'trending') {
          passed = !isNaN(adxVal) && adxVal >= 25;
        } else if (regime === 'ranging') {
          passed = !isNaN(adxVal) && adxVal < 20;
        } else if (regime === 'volatile') {
          const atrPct = (ext.atr[i] / closes[i]) * 100;
          passed = !isNaN(atrPct) && atrPct > 3;
        } else {
          passed = true;
        }
        break;
      }
      case 'session_time_filter': {
        const startHour = getParamValue(f, 'startHour', 9);
        const endHour = getParamValue(f, 'endHour', 15);
        const hour = new Date(kline[i].date).getHours();
        passed = hour >= startHour && hour <= endHour;
        break;
      }
      case 'correlation_filter':
        passed = true; // Correlation requires market index data; default pass
        break;
      default:
        passed = true;
    }
    results.push(passed);
  }

  // All filters must pass (AND logic)
  return results.every((r) => r);
}

/* ──────────────────────── Risk & Position helpers ──────────────────────── */

function getPositionSize(
  posEl: StrategyElement | undefined,
  riskEl: StrategyElement | undefined,
  capital: number,
  price: number,
  volatility?: number,
): number {
  if (!posEl || price <= 0) return Math.floor(capital / price);
  let baseSize: number;
  switch (posEl.id) {
    case 'fixed_position': {
      const size = getParamValue(posEl, 'positionSize', 10000);
      baseSize = Math.floor(size / price);
      break;
    }
    case 'pct_position': {
      const pct = getParamValue(posEl, 'pct', 0.2);
      baseSize = Math.floor((capital * pct) / price);
      break;
    }
    case 'pyramid_add': {
      const initPct = getParamValue(posEl, 'initialPct', 0.1);
      baseSize = Math.floor((capital * initPct) / price);
      break;
    }
    default:
      baseSize = Math.floor(capital / price);
  }

  // Apply volatility-based sizing if vol_position risk rule is active
  if (riskEl?.id === 'vol_position' && volatility && volatility > 0) {
    const targetVol = getParamValue(riskEl, 'targetVol', 10);
    const maxPosition = getParamValue(riskEl, 'maxPosition', 1.0);
    const volScale = Math.min(targetVol / volatility, maxPosition);
    return Math.max(0, Math.floor(baseSize * volScale));
  }

  return baseSize;
}

interface RiskState {
  scaleOut1Done: boolean;
  scaleOut2Done: boolean;
  scaleOut3Done: boolean;
  peakPnl: number;
  shares: number;
  initialShares: number;
  consecutiveLosses: number;
  dailyLossAccumulated: number;
  steppedTrailLevel: number;
}

function createRiskState(initialShares: number): RiskState {
  return {
    scaleOut1Done: false,
    scaleOut2Done: false,
    scaleOut3Done: false,
    peakPnl: 0,
    shares: initialShares,
    initialShares,
    consecutiveLosses: 0,
    dailyLossAccumulated: 0,
    steppedTrailLevel: 0,
  };
}

function evaluateRiskOnBar(
  riskEl: StrategyElement | undefined,
  j: number,
  entryIdx: number,
  closes: number[],
  entryPrice: number,
  ext: ExtendedIndicators,
  state: RiskState,
): { stopped: boolean; exitPnl?: number } {
  if (!riskEl) return { stopped: false };

  const price = closes[j];
  const pnl = ((price - entryPrice) / entryPrice) * 100;

  // Update peak
  if (pnl > state.peakPnl) state.peakPnl = pnl;

  // Update stepped trail level
  if (riskEl.id === 'stepped_take_profit') {
    const step1 = getParamValue(riskEl, 'step1Pct', 5);
    const step2 = getParamValue(riskEl, 'step2Pct', 15);
    if (pnl >= step2) state.steppedTrailLevel = 2;
    else if (pnl >= step1) state.steppedTrailLevel = 1;
  }

  switch (riskEl.id) {
    case 'fixed_stop': {
      const stopPct = getParamValue(riskEl, 'stopPct', 3);
      if (pnl <= -stopPct) return { stopped: true, exitPnl: -stopPct };
      break;
    }
    case 'trailing_stop': {
      const trailPct = getParamValue(riskEl, 'trailPct', 2);
      if (state.peakPnl > 0 && state.peakPnl - pnl >= trailPct) return { stopped: true, exitPnl: pnl };
      break;
    }
    case 'atr_stop': {
      const atrMult = getParamValue(riskEl, 'atrMultiplier', 2);
      const stopDist = (ext.atr[j] / entryPrice) * atrMult * 100;
      if (pnl <= -stopDist) return { stopped: true, exitPnl: -stopDist };
      break;
    }
    case 'max_drawdown_stop': {
      const maxDD = getParamValue(riskEl, 'maxDrawdown', 10);
      if (state.peakPnl - pnl >= maxDD) return { stopped: true, exitPnl: pnl };
      break;
    }
    case 'time_stop': {
      const maxDays = getParamValue(riskEl, 'maxDays', 10);
      const minProfit = getParamValue(riskEl, 'minProfit', 0);
      if (j - entryIdx >= maxDays && pnl <= minProfit) return { stopped: true, exitPnl: pnl };
      break;
    }
    case 'scale_out': {
      const t1 = getParamValue(riskEl, 'target1', 5);
      const p1 = getParamValue(riskEl, 'pct1', 0.3);
      const t2 = getParamValue(riskEl, 'target2', 10);
      const p2 = getParamValue(riskEl, 'pct2', 0.3);
      const t3 = getParamValue(riskEl, 'target3', 20);
      const p3 = getParamValue(riskEl, 'pct3', 0.4);
      if (!state.scaleOut1Done && pnl >= t1) {
        state.scaleOut1Done = true;
        state.shares = Math.floor(state.shares * (1 - p1));
      }
      if (!state.scaleOut2Done && pnl >= t2) {
        state.scaleOut2Done = true;
        state.shares = Math.floor(state.shares * (1 - p2));
      }
      if (!state.scaleOut3Done && pnl >= t3) {
        state.scaleOut3Done = true;
        state.shares = Math.floor(state.shares * (1 - p3));
      }
      if (state.shares <= 0) return { stopped: true, exitPnl: pnl };
      break;
    }
    case 'consecutive_loss_stop': {
      const maxLoss = getParamValue(riskEl, 'maxConsecutiveLoss', 3);
      if (state.consecutiveLosses >= maxLoss) return { stopped: true, exitPnl: pnl };
      break;
    }
    case 'daily_loss_limit': {
      const dailyLoss = getParamValue(riskEl, 'dailyLossPct', 5);
      state.dailyLossAccumulated += pnl < 0 ? Math.abs(pnl) : 0;
      if (state.dailyLossAccumulated >= dailyLoss) return { stopped: true, exitPnl: pnl };
      break;
    }
    case 'stepped_take_profit': {
      const trail1 = getParamValue(riskEl, 'trail1', 3);
      const trail2 = getParamValue(riskEl, 'trail2', 1.5);
      const currentTrail = state.steppedTrailLevel >= 2 ? trail2 : trail1;
      if (state.steppedTrailLevel > 0 && state.peakPnl - pnl >= currentTrail) {
        return { stopped: true, exitPnl: pnl };
      }
      break;
    }
    default:
      break;
  }

  return { stopped: false };
}

/* ──────────────────────── Multi-signal logic helper ──────────────────────── */

/**
 * Evaluate a group of signals using AND/OR logic.
 * If logic is 'and', all signals must trigger.
 * If logic is 'or', any signal triggers (default).
 */
function evaluateSignalGroup(
  signals: StrategyElement[],
  evaluator: (sig: StrategyElement) => boolean,
  defaultLogic: 'and' | 'or' = 'or',
): boolean {
  if (signals.length === 0) return false;

  const logic = signals[0].logic || defaultLogic;

  if (logic === 'and') {
    return signals.every((sig) => evaluator(sig));
  }
  return signals.some((sig) => evaluator(sig));
}

/* ──────────────────────── Core backtest engine ──────────────────────── */

export interface BacktestTrade {
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  holdBars: number;
  exitReason: 'signal' | 'stop' | 'time' | 'scale_out';
}

export interface BacktestResult {
  score: number;
  totalReturn: number;
  tradeCount: number;
  winCount: number;
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
  /** 总交易成本（手续费+印花税，元） */
  totalFeeCost: number;
  /** 平均每笔交易成本（%） */
  avgFeePerTrade: number;
}

/** A股交易费用率 */
const BUY_FEE_RATE = 0.00026;   // 买入：佣金0.025% + 过户费0.001% = 0.026%
const SELL_FEE_RATE = 0.00126;  // 卖出：佣金0.025% + 过户费0.001% + 印花税0.1% = 0.126%
const SLIPPAGE_RATE = 0.0005;   // 滑点0.05%（买入加价，卖出减价）

/** 根据股票代码判断涨跌停限制（默认10%） */
function getLimitPct(code?: string): number {
  if (!code) return 0.10; // 默认主板 ±10%
  const c = code.replace(/\D/g, '');
  if (c.startsWith('300') || c.startsWith('301') || c.startsWith('688') || c.startsWith('689')) return 0.20; // 创业板/科创板 ±20%
  if (c.startsWith('8') || c.startsWith('4')) return 0.30; // 北交所 ±30%
  if (c.startsWith('43')) return 0.30; // 北交所
  return 0.10; // 主板/ST默认 ±10%
}

export function runBacktest(
  kline: KLineData[],
  combo: { elements: StrategyElement[] },
  initialCapital: number = 100000,
  config?: Partial<BacktestConfig>,
  stockCode?: string,
): BacktestResult {
  const cfg: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, ...config };

  if (kline.length < 60) {
    return { score: 0, totalReturn: 0, tradeCount: 0, winCount: 0, winRate: 0, avgReturn: 0, maxDrawdown: 0, trades: [], totalFeeCost: 0, avgFeePerTrade: 0 };
  }

  const closes = kline.map((k) => k.close);
  const volumes = kline.map((k) => k.volume);
  const indicators = calculateIndicators(kline);
  const ext = calculateExtendedIndicators(kline, indicators);

  let capital = initialCapital;
  let totalReturn = 0;
  let tradeCount = 0;
  let winCount = 0;
  let maxDD = 0;
  let peak = 0;
  let runningPnl = 0;
  let totalFeeCost = 0; // 累计费用（元）
  const trades: BacktestTrade[] = [];

  const posEl = combo.elements.find((e) => e.type === 'position');
  const riskEl = combo.elements.find((e) => e.type === 'risk');
  const entryEls = combo.elements.filter((e) => e.type === 'entry');
  const exitElsArr = combo.elements.filter((e) => e.type === 'exit');

  const WINDOW_START = 60;
  const HOLD_MAX = cfg.holdingPeriodMax;
  const STEP = 1;
  const limitPct = getLimitPct(stockCode); // 涨跌停限制

  // Consecutive loss tracking
  let consecutiveLosses = 0;

  for (let i = WINDOW_START; i < kline.length - HOLD_MAX; i += STEP) {
    // --- Filter check ---
    if (!evaluateFilters(combo.elements, i, kline, indicators, ext, closes, volumes)) continue;

    // Check consecutive loss stop (global)
    if (riskEl?.id === 'consecutive_loss_stop') {
      const maxConsecutiveLoss = getParamValue(riskEl, 'maxConsecutiveLoss', 3);
      if (consecutiveLosses >= maxConsecutiveLoss) {
        // Reset after skipping a bar
        continue;
      }
    }

    // --- Entry signal check ---
    const entryTriggered = evaluateSignalGroup(entryEls, (sig) =>
      evaluateEntrySignal(sig, i, kline, indicators, ext, closes, volumes),
      cfg.entryLogic,
    );
    if (!entryTriggered) continue;

    // --- Simulate trade with realistic costs ---
    const rawEntryPrice = closes[i];

    // ═══ P1: Slippage — buy at higher price ═══
    const entryPrice = rawEntryPrice * (1 + SLIPPAGE_RATE);

    // ═══ P2: Limit-up check — cannot buy if price hits upper limit ═══
    const prevClose = i > 0 ? closes[i - 1] : entryPrice;
    const upperLimit = prevClose * (1 + limitPct);
    if (entryPrice >= upperLimit * 0.999) {
      // Price at or near limit-up, skip this trade (cannot buy)
      continue;
    }

    const atrPct = !isNaN(ext.atr[i]) ? (ext.atr[i] / entryPrice) * 100 : 0;
    const shares = getPositionSize(posEl, riskEl, capital, entryPrice, atrPct);
    if (shares <= 0) continue;

    const riskState = createRiskState(shares);
    riskState.consecutiveLosses = consecutiveLosses;
    let exitIdx = Math.min(i + HOLD_MAX, kline.length - 1);
    let exited = false;
    let exitReason: BacktestTrade['exitReason'] = 'time';

    for (let j = i + 1; j <= Math.min(i + HOLD_MAX, kline.length - 1); j++) {
      // Check risk management
      const riskResult = evaluateRiskOnBar(riskEl, j, i, closes, entryPrice, ext, riskState);
      if (riskResult.stopped) {
        exitIdx = j;
        // Apply slippage + limit check to exit
        let rawExitPrice = closes[j];
        let exitPriceSlipped = rawExitPrice * (1 - SLIPPAGE_RATE);
        const lowerLimit = closes[j - 1] * (1 - limitPct);
        if (exitPriceSlipped <= lowerLimit * 1.001) exitPriceSlipped = lowerLimit;
        const effectivePnl = riskResult.exitPnl ?? ((exitPriceSlipped - entryPrice) / entryPrice) * 100;
        runningPnl += effectivePnl;
        exited = true;
        exitReason = riskEl?.id === 'scale_out' ? 'scale_out' : 'stop';
        break;
      }

      // Check exit signal
      const exitTriggered = evaluateSignalGroup(exitElsArr, (sig) =>
        evaluateExitSignal(sig, j, i, kline, indicators, ext, closes, volumes, entryPrice),
        cfg.exitLogic,
      );
      if (exitTriggered) {
        exitIdx = j;
        // ═══ P1: Slippage — sell at lower price ═══
        let rawExitPrice = closes[j];
        let exitPriceSlipped = rawExitPrice * (1 - SLIPPAGE_RATE);
        // ═══ P2: Limit-down check ═══
        const lowerLimit = closes[j - 1] * (1 - limitPct);
        if (exitPriceSlipped <= lowerLimit * 1.001) exitPriceSlipped = lowerLimit;
        const finalPnl = ((exitPriceSlipped - entryPrice) / entryPrice) * 100;
        runningPnl += finalPnl;
        exited = true;
        exitReason = 'signal';
        break;
      }
    }

    if (!exited) {
      // Time-based exit — also apply slippage + limit
      let rawExitPrice = closes[exitIdx];
      let exitPriceSlipped = rawExitPrice * (1 - SLIPPAGE_RATE);
      const lowerLimit = closes[exitIdx - 1] * (1 - limitPct);
      if (exitPriceSlipped <= lowerLimit * 1.001) exitPriceSlipped = lowerLimit;
      const finalPnl = ((exitPriceSlipped - entryPrice) / entryPrice) * 100;
      runningPnl += finalPnl;
    }

    // ═══ P0: Calculate fees — buy fee + sell fee ═══
    const buyFee = shares * entryPrice * BUY_FEE_RATE;
    // Use slipped exit price for fee calculation
    const rawExitForFee = exited
      ? (closes[exitIdx] * (1 - SLIPPAGE_RATE))
      : (closes[exitIdx] * (1 - SLIPPAGE_RATE));
    const sellFee = shares * rawExitForFee * SELL_FEE_RATE;
    const tradeFee = buyFee + sellFee;
    totalFeeCost += tradeFee;

    // PNL after fees (convert fee to percentage of capital allocated)
    const feePct = (tradeFee / (shares * entryPrice)) * 100;
    const tradePnl = ((closes[exitIdx] * (1 - SLIPPAGE_RATE) - entryPrice) / entryPrice) * 100 - feePct;
    totalReturn += tradePnl;
    tradeCount++;
    if (tradePnl > 0) {
      winCount++;
      consecutiveLosses = 0;
    } else {
      consecutiveLosses++;
    }
    capital *= (1 + tradePnl / 100);

    trades.push({
      entryIdx: i,
      exitIdx,
      entryPrice,
      exitPrice: closes[exitIdx] * (1 - SLIPPAGE_RATE),
      pnlPct: Math.round(tradePnl * 100) / 100,
      holdBars: exitIdx - i,
      exitReason,
    });

    // Track drawdown
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak - runningPnl;
    if (dd > maxDD) maxDD = dd;
  }

  if (tradeCount === 0) {
    return { score: 0, totalReturn: 0, tradeCount: 0, winCount: 0, winRate: 0, avgReturn: 0, maxDrawdown: maxDD, trades: [], totalFeeCost: 0, avgFeePerTrade: 0 };
  }

  const winRate = (winCount / tradeCount) * 100;
  const avgReturn = totalReturn / tradeCount;
  const avgFeePerTrade = (totalFeeCost / tradeCount / (initialCapital / 100)); // 转换为百分比
  const ddPenalty = maxDD > 10 ? -(maxDD - 10) : 0;
  const score = Math.min(100, Math.max(0, winRate * 0.35 + Math.max(0, avgReturn) * 3 + Math.max(0, totalReturn) * 0.5 + ddPenalty * 0.5 + 10));

  return {
    score: Math.round(score * 10) / 10,
    totalReturn: Math.round(totalReturn * 100) / 100,
    tradeCount,
    winCount,
    winRate: Math.round(winRate * 10) / 10,
    avgReturn: Math.round(avgReturn * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    trades,
    totalFeeCost: Math.round(totalFeeCost * 100) / 100,
    avgFeePerTrade: Math.round(avgFeePerTrade * 10000) / 10000,
  };
}

export function scoreCombination(
  kline: KLineData[],
  combo: { elements: StrategyElement[] },
  config?: Partial<BacktestConfig>,
  stockCode?: string,
): number {
  const result = runBacktest(kline, combo, config?.initialCapital ?? 100000, config, stockCode);
  return result.score;
}

/* ──────────────────────── Exploration ──────────────────────── */

export interface ExploreResult {
  combo: { id: string; name: string; description: string; elements: StrategyElement[] };
  score: number;
  backtest: BacktestResult;
}

export function exploreCombinations(
  kline: KLineData[],
  maxResults = 10,
  config?: Partial<BacktestConfig>,
  stockCode?: string,
): ExploreResult[] {
  /**
   * 分阶段贪心探索：
   * 阶段1：遍历所有单入场+单出场组合 (31×23=713次回测)
   * 阶段2：对得分最高的top 20，尝试双入场+双出场组合
   * 阶段3：对最优组合逐个添加filter/risk/position
   * 总回测数约 713 + 380 + 720 ≈ 1800次，浏览器1-3秒完成
   */

  // ═══ 阶段1：单信号组合扫描 ═══
  const stage1Results: Array<{ score: number; elements: StrategyElement[]; entry: StrategyElement; exit: StrategyElement }> = [];
  for (const entry of ENTRY_SIGNALS) {
    for (const exit of EXIT_SIGNALS) {
      const elements = [entry, exit];
      const backtest = runBacktest(kline, { elements }, 100000, config, stockCode);
      // 保留有交易的组合（score>=0或tradeCount>0）
      if (backtest.tradeCount > 0) {
        stage1Results.push({ score: backtest.score, elements, entry, exit });
      }
    }
  }
  // 按得分排序取top 20
  stage1Results.sort((a, b) => b.score - a.score);
  const topSingles = stage1Results.slice(0, 20);

  // 降级：如果没有任何组合触发交易，返回默认结果
  if (topSingles.length === 0) {
    return [{
      combo: {
        id: `combo_${Date.now()}_default`,
        name: '趋势跟踪 → 移动止盈',
        description: '默认策略：均线趋势跟踪配合ATR移动止盈',
        elements: [ENTRY_SIGNALS[0], EXIT_SIGNALS[0]],
      },
      score: 0,
      backtest: runBacktest(kline, { elements: [ENTRY_SIGNALS[0], EXIT_SIGNALS[0]] }, 100000, config, stockCode),
    }];
  }

  // ═══ 阶段2：双信号组合扩展 ═══
  const candidates: Array<{ elements: StrategyElement[]; baseScore: number }> = [];
  // 加入单信号最优组合
  for (const t of topSingles.slice(0, 10)) {
    candidates.push({ elements: t.elements, baseScore: t.score });
  }
  // 尝试双入场+单出场
  const topEntries = topSingles.map(t => t.entry);
  const uniqueTopEntries = topEntries.filter((e, i, a) => a.findIndex(x => x.id === e.id) === i).slice(0, 10);
  for (let i = 0; i < uniqueTopEntries.length; i++) {
    for (let j = i + 1; j < uniqueTopEntries.length; j++) {
      for (const t of topSingles.slice(0, 5)) {
        const elements = [uniqueTopEntries[i], uniqueTopEntries[j], t.exit];
        const backtest = runBacktest(kline, { elements }, 100000, config, stockCode);
        if (backtest.score > 0) {
          candidates.push({ elements, baseScore: backtest.score });
        }
      }
    }
  }
  // 尝试单入场+双出场
  const topExits = topSingles.map(t => t.exit);
  const uniqueTopExits = topExits.filter((e, i, a) => a.findIndex(x => x.id === e.id) === i).slice(0, 10);
  for (const e of uniqueTopEntries.slice(0, 5)) {
    for (let i = 0; i < uniqueTopExits.length; i++) {
      for (let j = i + 1; j < uniqueTopExits.length; j++) {
        const elements = [e, uniqueTopExits[i], uniqueTopExits[j]];
        const backtest = runBacktest(kline, { elements }, 100000, config, stockCode);
        if (backtest.score > 0) {
          candidates.push({ elements, baseScore: backtest.score });
        }
      }
    }
  }

  // ═══ 阶段3：添加filter/risk/position ═══
  const results: ExploreResult[] = [];
  // 去重
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter(c => {
    const key = c.elements.map(e => e.id).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 只取top 15候选做扩展
  uniqueCandidates.sort((a, b) => b.baseScore - a.baseScore);
  const topCandidates = uniqueCandidates.slice(0, 15);

  const topFilters = FILTERS.slice(0, 4);
  const topRisks = RISK_MANAGEMENT.slice(0, 3);
  const topPositions = POSITION_MANAGEMENT.slice(0, 3);

  for (const cand of topCandidates) {
    for (const filter of [undefined, ...topFilters]) {
      for (const risk of [undefined, ...topRisks]) {
        for (const pos of [undefined, ...topPositions]) {
          const finalEls = [...cand.elements];
          if (filter) finalEls.push(filter);
          if (risk) finalEls.push(risk);
          if (pos) finalEls.push(pos);

          const backtest = runBacktest(kline, { elements: finalEls }, 100000, config, stockCode);
          const entries = finalEls.filter(e => e.type === 'entry');
          const exits = finalEls.filter(e => e.type === 'exit');
          const f = finalEls.find(e => e.type === 'filter');
          const r = finalEls.find(e => e.type === 'risk');
          const p = finalEls.find(e => e.type === 'position');

          const entryNames = entries.map((e) => e.name).join('+');
          const exitNames = exits.map((e) => e.name).join('+');
          const filterName = f ? ` | ${f.name}` : '';
          const riskName = r ? ` | ${r.name}` : '';
          const posName = p ? ` | ${p.name}` : '';

          results.push({
            combo: {
              id: `combo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: `${entryNames} -> ${exitNames}${filterName}${riskName}${posName}`,
              description: `入场: ${entries.map((e) => e.name).join(', ')}; 出场: ${exits.map((e) => e.name).join(', ')}${f ? '; 过滤: ' + f.name : ''}${r ? '; 风控: ' + r.name : ''}${p ? '; 仓位: ' + p.name : ''}`,
              elements: finalEls,
            },
            score: backtest.score,
            backtest,
          });
        }
      }
    }
  }

  // Sort by score descending and return top results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

function generateCombinations<T>(arr: T[], minLen: number, maxLen: number): T[][] {
  const result: T[][] = [];
  for (let len = minLen; len <= maxLen; len++) {
    combine(arr, len, 0, [], result);
  }
  return result;
}

function combine<T>(arr: T[], len: number, start: number, current: T[], result: T[][]) {
  if (current.length === len) {
    result.push([...current]);
    return;
  }
  for (let i = start; i < arr.length; i++) {
    current.push(arr[i]);
    combine(arr, len, i + 1, current, result);
    current.pop();
  }
}

/* ──────────────────────── Strategy Builder helpers ──────────────────────── */

/**
 * Build a complete strategy from element IDs with optional parameter overrides.
 */
export function buildStrategy(
  name: string,
  description: string,
  elementIds: { id: string; paramOverrides?: Record<string, number | string> }[],
): { id: string; name: string; description: string; elements: StrategyElement[] } {
  const elements: StrategyElement[] = [];
  for (const { id, paramOverrides } of elementIds) {
    const el = getElementById(id);
    if (!el) continue;
    const cloned = cloneElement(el);
    if (paramOverrides) {
      for (const [pName, pValue] of Object.entries(paramOverrides)) {
        const param = cloned.params?.find((p) => p.name === pName);
        if (param) param.value = pValue;
        else cloned.params = [...(cloned.params || []), { name: pName, value: pValue }];
      }
    }
    elements.push(cloned);
  }
  return {
    id: `strategy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    description,
    elements,
  };
}

/**
 * Toggle the logic mode (AND/OR) for a set of strategy elements.
 */
export function setElementLogic(
  elements: StrategyElement[],
  type: StrategyElement['type'],
  logic: 'and' | 'or',
): StrategyElement[] {
  return elements.map((e) => {
    if (e.type === type) return { ...e, logic };
    return e;
  });
}

/**
 * Apply a strategy template to create a pre-configured strategy.
 */
export function applyTemplate(template: StrategyTemplate): { id: string; name: string; description: string; elements: StrategyElement[] } {
  return {
    id: `template_${template.id}_${Date.now()}`,
    name: template.name,
    description: template.description,
    elements: template.elements.map((e) => cloneElement(e)),
  };
}

/**
 * Get statistics about available strategy elements.
 */
export function getStrategyLibraryStats(): Record<string, number> {
  return {
    entrySignals: ENTRY_SIGNALS.length,
    exitSignals: EXIT_SIGNALS.length,
    filters: FILTERS.length,
    riskRules: RISK_MANAGEMENT.length,
    positionRules: POSITION_MANAGEMENT.length,
    templates: STRATEGY_TEMPLATES.length,
    total: ENTRY_SIGNALS.length + EXIT_SIGNALS.length + FILTERS.length + RISK_MANAGEMENT.length + POSITION_MANAGEMENT.length,
  };
}
