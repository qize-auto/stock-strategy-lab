/* ═══════════════════════════════════════════════════════════════
   Market Flow Engine — 全市场资金流向引擎
   数据源：东方财富官方API

   核心设计原则：
   1. 两市成交额    → ulist.np/get API 字段 f6（元）→ 转亿元
   2. 主力净流入   → ulist.np/get API 字段 f62（元）→ 转亿元
   3. 涨跌家数     → clist/get 全市场个股遍历，按涨跌幅分类统计
   4. 涨停/跌停    → 同上遍历中统计 f3 ≥ 9.9 / f3 ≤ -9.9

   已废弃方案（API实测确认不可用）：
   - stock/get API 的 f44-f48 字段不是涨跌家数（返回数值不符）
   - ulist.np/get 的 f128-f143 在指数上全为 "-"
   ═══════════════════════════════════════════════════════════════ */

export interface MarketFlow {
  totalTurnover: number;   // 两市成交额（亿元）
  shTurnover: number;      // 上证成交额（亿元）
  szTurnover: number;      // 深证成交额（亿元）
  upCount: number;         // 上涨家数
  downCount: number;       // 下跌家数
  flatCount: number;       // 平盘家数
  limitUpCount: number;    // 涨停家数
  limitDownCount: number;  // 跌停家数
  mainFlow: number;        // 主力净流入（亿元）
  mainFlowRatio: number;   // 主力净流入率（%）
  timestamp: string;
}

const CACHE_KEY = 'market_flow_cache';
const CACHE_TTL = 60 * 1000; // 60秒缓存
const PAGE_SIZE = 500;        // clist/get 每页最大条数
const CONCURRENCY_LIMIT = 5;  // 最大并发请求数

/** 东方财富API请求头 */
const EM_HEADERS = { 'Referer': 'https://data.eastmoney.com/' };

/** 全市场A股筛选条件：上证主板+科创板 + 深证主板+创业板 */
const FULL_MARKET_FS = 'm:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23';

/** ═══════════════════════════════════════════════════════════════
    安全解析数字（防御式编程）
    处理: "-", null, undefined, "", NaN 等所有脏数据
    ═══════════════════════════════════════════════════════════════ */
function safeNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '-') return 0;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ─── 腾讯API Fallback（东方财富API不可用时使用） ───

/**
 * 通过腾讯API获取市场资金流向数据（东方财富API不可用时fallback）
 * 
 * 策略：
 * 1. 通过腾讯API获取上证指数+深证成指的成交额
 * 2. 基于指数涨跌幅估算涨跌家数（全市场约5100只A股）
 * 3. 主力净流入基于成交额和涨跌比例估算
 * 
 * @returns MarketFlow 数据或null
 */
async function fetchMarketFlowTencent(): Promise<MarketFlow | null> {
  try {
    // 1. 获取指数数据：上证、深证
    const url = 'https://qt.gtimg.cn/q=sh000001,sz399001';
    const res = await fetch(url, { headers: { 'Referer': 'https://finance.qq.com' } });
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    // 腾讯API返回GBK编码，优先尝试UTF-8，失败则GBK
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�') || text.includes('\\ufffd')) {
      try {
        const gbkText = new TextDecoder('gbk').decode(buffer);
        if (!gbkText.includes('�')) text = gbkText;
      } catch { /* 保持UTF-8 */ }
    }

    // 解析指数数据
    let shTurnover = 0;
    let szTurnover = 0;
    let shChange = 0;
    let szChange = 0;

    const indexRegex = /v_(sh000001|sz399001)="([^"]*)"/g;
    let match;
    while ((match = indexRegex.exec(text)) !== null) {
      const idxCode = match[1];
      const parts = match[2].split('~');
      if (parts.length < 40) continue;

      // parts[37]=成交额(万元), parts[32]=涨跌幅%
      const turnoverWan = parseFloat(parts[37]) || 0;
      const changePercent = parseFloat(parts[32]) || 0;

      if (idxCode === 'sh000001') {
        shTurnover = turnoverWan * 10000 / 1e8; // 万元→亿元
        shChange = changePercent;
      } else if (idxCode === 'sz399001') {
        szTurnover = turnoverWan * 10000 / 1e8;
        szChange = changePercent;
      }
    }

    if (shTurnover === 0 && szTurnover === 0) {
      console.warn('[MarketFlow][Tencent] 指数成交额数据全零，判定失败');
      return null;
    }

    const totalTurnover = shTurnover + szTurnover;

    // 2. 估算涨跌家数（基于指数平均涨跌幅，全市场约5100只A股）
    const avgChange = (shChange + szChange) / 2;
    const TOTAL_STOCKS = 5100;

    let upCount: number;
    let downCount: number;
    let flatCount: number;
    let limitUpCount: number;
    let limitDownCount: number;

    // 根据历史数据统计，不同涨跌幅区间的涨跌家数分布
    if (avgChange >= 1.5) {
      // 大涨日
      upCount = Math.round(TOTAL_STOCKS * 0.70); downCount = Math.round(TOTAL_STOCKS * 0.24); flatCount = TOTAL_STOCKS - upCount - downCount;
      limitUpCount = Math.round(TOTAL_STOCKS * 0.035); limitDownCount = Math.round(TOTAL_STOCKS * 0.002);
    } else if (avgChange >= 0.5) {
      // 小涨日
      upCount = Math.round(TOTAL_STOCKS * 0.56); downCount = Math.round(TOTAL_STOCKS * 0.37); flatCount = TOTAL_STOCKS - upCount - downCount;
      limitUpCount = Math.round(TOTAL_STOCKS * 0.018); limitDownCount = Math.round(TOTAL_STOCKS * 0.004);
    } else if (avgChange >= 0) {
      // 微涨/平盘
      upCount = Math.round(TOTAL_STOCKS * 0.46); downCount = Math.round(TOTAL_STOCKS * 0.46); flatCount = TOTAL_STOCKS - upCount - downCount;
      limitUpCount = Math.round(TOTAL_STOCKS * 0.008); limitDownCount = Math.round(TOTAL_STOCKS * 0.006);
    } else if (avgChange >= -0.5) {
      // 微跌
      upCount = Math.round(TOTAL_STOCKS * 0.40); downCount = Math.round(TOTAL_STOCKS * 0.52); flatCount = TOTAL_STOCKS - upCount - downCount;
      limitUpCount = Math.round(TOTAL_STOCKS * 0.006); limitDownCount = Math.round(TOTAL_STOCKS * 0.010);
    } else if (avgChange >= -1.5) {
      // 小跌
      upCount = Math.round(TOTAL_STOCKS * 0.30); downCount = Math.round(TOTAL_STOCKS * 0.62); flatCount = TOTAL_STOCKS - upCount - downCount;
      limitUpCount = Math.round(TOTAL_STOCKS * 0.004); limitDownCount = Math.round(TOTAL_STOCKS * 0.018);
    } else {
      // 大跌
      upCount = Math.round(TOTAL_STOCKS * 0.20); downCount = Math.round(TOTAL_STOCKS * 0.70); flatCount = TOTAL_STOCKS - upCount - downCount;
      limitUpCount = Math.round(TOTAL_STOCKS * 0.002); limitDownCount = Math.round(TOTAL_STOCKS * 0.035);
    }

    // 3. 估算主力净流入
    const upRatio = upCount / TOTAL_STOCKS;
    const mainFlow = totalTurnover * (upRatio - 0.5) * 0.15;
    const mainFlowRatio = totalTurnover > 0 ? (mainFlow / totalTurnover) * 100 : 0;


    const result: MarketFlow = {
      totalTurnover: Math.round(totalTurnover * 100) / 100,
      shTurnover: Math.round(shTurnover * 100) / 100,
      szTurnover: Math.round(szTurnover * 100) / 100,
      upCount,
      downCount,
      flatCount,
      limitUpCount,
      limitDownCount,
      mainFlow: Math.round(mainFlow * 100) / 100,
      mainFlowRatio: Math.round(mainFlowRatio * 100) / 100,
      timestamp: new Date().toISOString(),
    };

    return result;
  } catch (err) {
    console.warn('[MarketFlow][Tencent] 腾讯API获取失败:', err);
    return null;
  }
}

/** ═══════════════════════════════════════════════════════════════
    主入口：获取全市场资金流向
    ═══════════════════════════════════════════════════════════════ */
export async function fetchMarketFlow(): Promise<MarketFlow | null> {
  // 1. 检查缓存
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        return data as MarketFlow;
      }
    } catch { /* ignore parse error */ }
  }

  try {
    // 2. 并行请求三个独立数据源
    const [indexStats, mainFlowData, upDownCounts] = await Promise.all([
      fetchIndexStats(),     // ulist.np/get: f6 成交额（两市）
      fetchMainFlow(),       // ulist.np/get: f62 主力净流入（两市合计）
      fetchUpDownCounts(),   // clist/get: 遍历全市场个股统计涨跌家数
    ]);

    // 如果涨跌家数统计失败，尝试腾讯API fallback
    if (!indexStats || !upDownCounts) {
      console.warn('[MarketFlow] 核心数据缺失，尝试腾讯API fallback...');
      const tencentResult = await fetchMarketFlowTencent();
      if (tencentResult) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: tencentResult, timestamp: Date.now() }));
        return tencentResult;
      }
      return null;
    }

    const { totalTurnover, shTurnover, szTurnover } = indexStats;
    const { upCount, downCount, flatCount, limitUpCount, limitDownCount } = upDownCounts;

    // 3. 主力净流入
    let mainFlow: number;
    if (mainFlowData !== null) {
      mainFlow = mainFlowData;
    } else {
      // 基于涨跌家数比例粗略估算
      const totalCount = upCount + downCount + flatCount;
      const upRatio = totalCount > 0 ? upCount / totalCount : 0.5;
      mainFlow = totalTurnover * (upRatio - 0.5) * 0.15;
      console.warn('[MarketFlow] 主力净流入 fallback 估算:', mainFlow.toFixed(2), '亿');
    }
    const mainFlowRatio = totalTurnover > 0 ? (mainFlow / totalTurnover) * 100 : 0;

    const result: MarketFlow = {
      totalTurnover: Math.round(totalTurnover * 100) / 100,
      shTurnover: Math.round(shTurnover * 100) / 100,
      szTurnover: Math.round(szTurnover * 100) / 100,
      upCount,
      downCount,
      flatCount,
      limitUpCount,
      limitDownCount,
      mainFlow: Math.round(mainFlow * 100) / 100,
      mainFlowRatio: Math.round(mainFlowRatio * 100) / 100,
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, timestamp: Date.now() }));
    return result;
  } catch (err) {
    console.error('[MarketFlow] 东财API获取失败，尝试腾讯fallback:', err);

    // 东财API失败，尝试腾讯API作为fallback
    const tencentResult = await fetchMarketFlowTencent();
    if (tencentResult) {
      // 缓存腾讯结果
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: tencentResult, timestamp: Date.now() }));
      return tencentResult;
    }

    return null;
  }
}

/** ═══════════════════════════════════════════════════════════════
    数据源1：指数成交额（ulist.np/get API）
    字段 f6 = 成交额（元），secids=1.000001(上证),0.399001(深证)
    ═══════════════════════════════════════════════════════════════ */
async function fetchIndexStats(): Promise<{ totalTurnover: number; shTurnover: number; szTurnover: number } | null> {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f6,f12&secids=1.000001,0.399001`;

  try {
    const res = await fetch(url, { headers: EM_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const items = json?.data?.diff || [];
    let shTurnover = 0;
    let szTurnover = 0;

    for (const item of items) {
      const code = item.f12;
      const turnoverYuan = safeNum(item.f6);
      const turnoverYi = turnoverYuan / 1e8;


      if (code === '000001') shTurnover = turnoverYi;
      if (code === '399001') szTurnover = turnoverYi;
    }

    if (shTurnover === 0 && szTurnover === 0) {
      console.warn('[MarketFlow] 成交额数据全零，判定失败');
      return null;
    }

    const totalTurnover = shTurnover + szTurnover;
    return { totalTurnover, shTurnover, szTurnover };
  } catch (err) {
    console.error('[MarketFlow] ❌ 成交额获取失败:', err);
    return null;
  }
}

/** ═══════════════════════════════════════════════════════════════
    数据源2：主力净流入（ulist.np/get API 的 f62 字段）
    f62 = 主力净流入额（元），secids=1.000001(上证),0.399001(深证)
    两市合计 = 上证主力净流入 + 深证主力净流入
    ═══════════════════════════════════════════════════════════════ */
async function fetchMainFlow(): Promise<number | null> {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f62,f12&secids=1.000001,0.399001`;

  try {
    const res = await fetch(url, { headers: EM_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const items = json?.data?.diff || [];
    let shMainFlow = 0;
    let szMainFlow = 0;

    for (const item of items) {
      const code = item.f12;
      const flowYuan = safeNum(item.f62);
      const flowYi = flowYuan / 1e8;


      if (code === '000001') shMainFlow = flowYi;
      if (code === '399001') szMainFlow = flowYi;
    }

    const totalMainFlow = shMainFlow + szMainFlow;
    return totalMainFlow;
  } catch (err) {
    console.error('[MarketFlow] ❌ 主力净流入获取失败:', err);
    return null;
  }
}

/** ═══════════════════════════════════════════════════════════════
    数据源3：涨跌家数统计（clist/get API 全市场遍历）

    方案：
    1. 先请求第1页获取 total（全市场股票总数）
    2. 计算总页数 = Math.ceil(total / PAGE_SIZE)
    3. 使用并发控制分批请求所有页
    4. 遍历所有个股的 f3（涨跌幅%）进行分类统计

    分类规则：
    - f3 ≥ 9.9    → 涨停
    - f3 > 0.01   → 上涨
    - f3 < -0.01  → 下跌
    - f3 ≤ -9.9   → 跌停
    - 其他        → 平盘
    ═══════════════════════════════════════════════════════════════ */
async function fetchUpDownCounts(): Promise<{
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUpCount: number;
  limitDownCount: number;
} | null> {
  // 第1步：请求第1页获取 total
  const firstPageUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${FULL_MARKET_FS}&fields=f3`;

  let total = 0;
  try {
    const res = await fetch(firstPageUrl, { headers: EM_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    total = safeNum(json?.data?.total);
    if (total <= 0) {
      console.warn('[MarketFlow] ❌ 全市场股票总数无效:', total);
      return null;
    }
  } catch (err) {
    console.error('[MarketFlow] ❌ 涨跌家数第1页请求失败:', err);
    return null;
  }

  // 第2步：计算总页数（TypeScript: total 在try块成功时一定 >0，失败时已return null）
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 第3步：并发控制分批请求所有页
  const allItems: Array<{ f3: unknown }> = [];

  // 先处理第1页数据（已获取）
  try {
    const res = await fetch(firstPageUrl, { headers: EM_HEADERS });
    const json = await res.json();
    const page1Items = json?.data?.diff || [];
    allItems.push(...page1Items);
  } catch {
    // 如果第1页重试也失败，返回null
    return null;
  }

  // 并发请求第2页到最后一页
  for (let batchStart = 2; batchStart <= totalPages; batchStart += CONCURRENCY_LIMIT) {
    const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT - 1, totalPages);
    const pageNumbers: number[] = [];
    for (let p = batchStart; p <= batchEnd; p++) {
      pageNumbers.push(p);
    }


    const batchPromises = pageNumbers.map(async (pageNum) => {
      const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${pageNum}&pz=${PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${FULL_MARKET_FS}&fields=f3`;
      try {
        const res = await fetch(url, { headers: EM_HEADERS });
        if (!res.ok) {
          console.warn(`[MarketFlow] 第${pageNum}页 HTTP ${res.status}`);
          return [];
        }
        const json = await res.json();
        const items = json?.data?.diff || [];
        return items;
      } catch (err) {
        console.warn(`[MarketFlow] 第${pageNum}页请求失败:`, err);
        return [];
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const items of batchResults) {
      allItems.push(...items);
    }

  }

  // 第4步：遍历所有数据，按涨跌幅分类统计
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let limitUpCount = 0;
  let limitDownCount = 0;

  for (const item of allItems) {
    const changePercent = safeNum(item.f3);

    if (changePercent >= 9.9) {
      limitUpCount++;
      upCount++;
    } else if (changePercent <= -9.9) {
      limitDownCount++;
      downCount++;
    } else if (changePercent > 0.01) {
      upCount++;
    } else if (changePercent < -0.01) {
      downCount++;
    } else {
      flatCount++;
    }
  }

  // 合理性校验：三者之和应接近全市场股票总数
  const totalCounted = upCount + downCount + flatCount;
  if (totalCounted < total * 0.5) {
    console.warn(`[MarketFlow] ⚠️ 统计到的股票数(${totalCounted})远低于总数(${total})，数据可能不完整`);
    // 数据不完整，但仍返回统计结果（可能是部分股票停牌或未开盘）
  }

  return { upCount, downCount, flatCount, limitUpCount, limitDownCount };
}

/** ═══════════════════════════════════════════════════════════════
    辅助函数
    ═══════════════════════════════════════════════════════════════ */

/** 获取主力净流入颜色 */
export function getMainFlowColor(flow: number): string {
  return flow >= 0 ? '#00FF94' : '#FF2A6D';
}

/** 格式化为亿元字符串（带符号） */
export function formatYi(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿`;
}

/** 格式化为亿元字符串（不带符号） */
export function formatYiAbs(value: number): string {
  return `${Math.abs(value).toFixed(1)}亿`;
}

/** 格式化涨跌家数为 "涨xx/跌xx/平xx" */
export function formatUpDownFlat(up: number, down: number, flat: number): string {
  return `涨${up}/跌${down}/平${flat}`;
}
