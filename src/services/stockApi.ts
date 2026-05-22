/**
 * 股票数据服务
 * 数据来源：腾讯财经API（支持CORS，浏览器可直接调用）
 * 缓存：localStorage
 */

export interface StockInfo {
  code: string;
  name: string;
  industry: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  turnover: number;
  marketCap: number;
  pe: number;
  pb: number;
  high52w: number;
  low52w: number;
  updateTime: string;
}

// ─── 内置股票库（名称+行业，价格从API获取）───
export const BUILT_IN_STOCKS: Record<string, { name: string; industry: string }> = {
  // 白酒
  '600519': { name: '贵州茅台', industry: '白酒' },
  '000858': { name: '五粮液', industry: '白酒' },
  '000568': { name: '泸州老窖', industry: '白酒' },
  '600809': { name: '山西汾酒', industry: '白酒' },
  '002304': { name: '洋河股份', industry: '白酒' },
  // 新能源
  '300750': { name: '宁德时代', industry: '新能源' },
  '002594': { name: '比亚迪', industry: '汽车' },
  '002466': { name: '天齐锂业', industry: '新能源' },
  '002460': { name: '赣锋锂业', industry: '新能源' },
  '601012': { name: '隆基绿能', industry: '新能源' },
  '600438': { name: '通威股份', industry: '新能源' },
  '002129': { name: 'TCL中环', industry: '新能源' },
  '300274': { name: '阳光电源', industry: '新能源' },
  '002506': { name: '协鑫集成', industry: '新能源' },
  '600089': { name: '特变电工', industry: '新能源' },
  '000591': { name: '太阳能', industry: '新能源' },
  '600732': { name: '爱旭股份', industry: '新能源' },
  // 半导体/电子
  '688981': { name: '中芯国际', industry: '半导体' },
  '002475': { name: '立讯精密', industry: '电子' },
  '603501': { name: '韦尔股份', industry: '半导体' },
  '000725': { name: '京东方A', industry: '电子' },
  '002371': { name: '北方华创', industry: '半导体' },
  '600584': { name: '长电科技', industry: '半导体' },
  '688012': { name: '中微公司', industry: '半导体' },
  '603986': { name: '兆易创新', industry: '半导体' },
  '002049': { name: '紫光国微', industry: '半导体' },
  '002241': { name: '歌尔股份', industry: '电子' },
  '688008': { name: '澜起科技', industry: '半导体' },
  '600183': { name: '生益科技', industry: '半导体' },
  '600460': { name: '士兰微', industry: '半导体' },
  // 金融
  '601318': { name: '中国平安', industry: '保险' },
  '600036': { name: '招商银行', industry: '银行' },
  '300059': { name: '东方财富', industry: '金融科技' },
  '600030': { name: '中信证券', industry: '券商' },
  '601688': { name: '华泰证券', industry: '券商' },
  '601398': { name: '工商银行', industry: '银行' },
  '601166': { name: '兴业银行', industry: '银行' },
  // 消费/医药
  '000333': { name: '美的集团', industry: '家电' },
  '000651': { name: '格力电器', industry: '家电' },
  '603288': { name: '海天味业', industry: '食品' },
  '600276': { name: '恒瑞医药', industry: '医药' },
  '300760': { name: '迈瑞医疗', industry: '医药' },
  '600887': { name: '伊利股份', industry: '食品' },
  '603259': { name: '药明康德', industry: '医药' },
  // 科技/通信
  '000063': { name: '中兴通讯', industry: '通信' },
  '600050': { name: '中国联通', industry: '通信' },
  '002230': { name: '科大讯飞', industry: 'AI' },
  '300124': { name: '汇川技术', industry: '自动化' },
  '002415': { name: '海康威视', industry: '安防' },
  '600941': { name: '中国移动', industry: '通信' },
  // 制造/有色
  '601899': { name: '紫金矿业', industry: '有色' },
  '600031': { name: '三一重工', industry: '机械' },
  '600893': { name: '航发动力', industry: '军工' },
  '601919': { name: '中远海控', industry: '航运' },
  '600150': { name: '中国船舶', industry: '船舶' },
  '600309': { name: '万华化学', industry: '化工' },
  '601088': { name: '中国神华', industry: '煤炭' },
  '600900': { name: '长江电力', industry: '电力' },
  // 汽车
  '601127': { name: '赛力斯', industry: '汽车' },
  '000625': { name: '长安汽车', industry: '汽车' },
  '601633': { name: '长城汽车', industry: '汽车' },
  '600104': { name: '上汽集团', industry: '汽车' },
  // 传媒/物流
  '002027': { name: '分众传媒', industry: '传媒' },
  '002352': { name: '顺丰控股', industry: '物流' },
  // 更多热门
  '600570': { name: '恒生电子', industry: '软件' },
  '000977': { name: '浪潮信息', industry: '计算机' },
  '300308': { name: '中际旭创', industry: '通信' },
  '601138': { name: '工业富联', industry: '电子' },
  '300122': { name: '智飞生物', industry: '医药' },
  '002714': { name: '牧原股份', industry: '农牧' },
  '002271': { name: '东方雨虹', industry: '建材' },
  '000002': { name: '万科A', industry: '地产' },
  '600048': { name: '保利发展', industry: '地产' },
  '601669': { name: '中国电建', industry: '基建' },
  '000768': { name: '中航西飞', industry: '军工' },
  '600760': { name: '中航沈飞', industry: '军工' },
  '300015': { name: '爱尔眼科', industry: '医疗' },
  '300896': { name: '爱美客', industry: '医美' },
  '601985': { name: '中国核电', industry: '电力' },
  '000338': { name: '潍柴动力', industry: '机械' },
  '600585': { name: '海螺水泥', industry: '建材' },
  '002032': { name: '苏泊尔', industry: '家电' },
  '603486': { name: '科沃斯', industry: '家电' },
  '600019': { name: '宝钢股份', industry: '钢铁' },
  '601006': { name: '大秦铁路', industry: '交运' },
  '600009': { name: '上海机场', industry: '交运' },
  '000617': { name: '中油资本', industry: '金融' },
  '300033': { name: '同花顺', industry: '软件' },
  '603019': { name: '中科曙光', industry: '计算机' },
  '002236': { name: '大华股份', industry: '安防' },
  '601728': { name: '中国电信', industry: '通信' },
  '002602': { name: '世纪华通', industry: '游戏' },
  '300418': { name: '昆仑万维', industry: 'AI' },
  '000895': { name: '双汇发展', industry: '食品' },
  '002007': { name: '华兰生物', industry: '医药' },
  '600600': { name: '青岛啤酒', industry: '食品' },
  '000538': { name: '云南白药', industry: '医药' },
  '600362': { name: '江西铜业', industry: '有色' },
  '600111': { name: '北方稀土', industry: '有色' },
  '002142': { name: '宁波银行', industry: '银行' },
  '000001': { name: '平安银行', industry: '银行' },
  '601939': { name: '建设银行', industry: '银行' },
  '601288': { name: '农业银行', industry: '银行' },
  '601658': { name: '邮储银行', industry: '银行' },
  '688256': { name: '寒武纪', industry: 'AI芯片' },
  '002156': { name: '通富微电', industry: '半导体' },
  '300782': { name: '卓胜微', industry: '半导体' },
  '603160': { name: '汇顶科技', industry: '半导体' },
  '603893': { name: '瑞芯微', industry: '半导体' },
  '002463': { name: '沪电股份', industry: '电子' },
  '002384': { name: '东山精密', industry: '电子' },
  '300223': { name: '北京君正', industry: '半导体' },
  '688126': { name: '沪硅产业', industry: '半导体' },
  '300661': { name: '圣邦股份', industry: '半导体' },
  '300502': { name: '新易盛', industry: '通信' },
  '002281': { name: '光迅科技', industry: '通信' },
  '600487': { name: '亨通光电', industry: '通信' },
  '688169': { name: '石头科技', industry: '家电' },
  '000786': { name: '北新建材', industry: '建材' },
  '002372': { name: '伟星新材', industry: '建材' },
  '601390': { name: '中国中铁', industry: '基建' },
  '601800': { name: '中国交建', industry: '基建' },
  '601186': { name: '中国铁建', industry: '基建' },
  '600028': { name: '中国石化', industry: '石油' },
  '601857': { name: '中国石油', industry: '石油' },
  '600188': { name: '兖矿能源', industry: '煤炭' },
  '000932': { name: '华菱钢铁', industry: '钢铁' },
  '600010': { name: '包钢股份', industry: '钢铁' },
  '600233': { name: '圆通速递', industry: '物流' },
  '002120': { name: '韵达股份', industry: '物流' },
  '603195': { name: '公牛集团', industry: '家电' },
  '300413': { name: '芒果超媒', industry: '传媒' },
  '300251': { name: '光线传媒', industry: '传媒' },
  '300498': { name: '温氏股份', industry: '农牧' },
  '000876': { name: '新希望', industry: '农牧' },
  '002385': { name: '大北农', industry: '农牧' },
  '600663': { name: '陆家嘴', industry: '地产' },
  '000402': { name: '金融街', industry: '地产' },
  '000988': { name: '华工科技', industry: '电子' },
  '002050': { name: '三花智控', industry: '汽配' },
  '002920': { name: '德赛西威', industry: '汽配' },
  '600741': { name: '华域汽车', industry: '汽配' },
  '688363': { name: '华熙生物', industry: '医美' },
  '300759': { name: '康龙化成', industry: '医药' },
  '603882': { name: '金域医学', industry: '医疗' },
  '300003': { name: '乐普医疗', industry: '医疗' },
  '601816': { name: '京沪高铁', industry: '交运' },
  '601077': { name: '渝农商行', industry: '银行' },
  '600999': { name: '招商证券', industry: '券商' },
  '000166': { name: '申万宏源', industry: '券商' },
  '300142': { name: '沃森生物', industry: '医药' },
  '000963': { name: '华东医药', industry: '医药' },
  '002001': { name: '新和成', industry: '化工' },
  '600426': { name: '华鲁恒升', industry: '化工' },
  '002648': { name: '卫星化学', industry: '化工' },
  '601615': { name: '明阳智能', industry: '新能源' },
  '002202': { name: '金风科技', industry: '新能源' },
  '688599': { name: '天合光能', industry: '新能源' },
  '601869': { name: '长飞光纤', industry: '通信' },
  '600745': { name: '闻泰科技', industry: '电子' },
  '603290': { name: '斯达半导', industry: '半导体' },
  '605117': { name: '德业股份', industry: '新能源' },
  '688032': { name: '禾迈股份', industry: '新能源' },
  '300316': { name: '晶盛机电', industry: '新能源' },
  '002709': { name: '天赐材料', industry: '新能源' },
  '300014': { name: '亿纬锂能', industry: '新能源' },
  '002812': { name: '恩捷股份', industry: '新能源' },
  // 龙虎榜常见
  '603392': { name: '万泰生物', industry: '医药' },
  '300979': { name: '华利集团', industry: '纺织' },
};

/** 获取内置股票名称 */
export function getBuiltInStockName(code: string): string | undefined {
  return BUILT_IN_STOCKS[code]?.name;
}

/** 获取内置股票行业 */
export function getBuiltInStockIndustry(code: string): string | undefined {
  return BUILT_IN_STOCKS[code]?.industry;
}

// ─── localStorage 缓存 ───

const CACHE_KEY = 'stock_local_db_v2';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: StockInfo;
  timestamp: number;
}

function getLocalDB(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalDB(db: Record<string, CacheEntry>) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(db));
}

/** 从本地库获取 */
export function getStockFromLocal(code: string): StockInfo | null {
  const db = getLocalDB();
  const entry = db[code];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
    delete db[code];
    setLocalDB(db);
    return null;
  }
  return entry.data;
}

/** 保存到本地库 */
export function saveStockToLocal(info: StockInfo) {
  const db = getLocalDB();
  db[info.code] = { data: info, timestamp: Date.now() };
  setLocalDB(db);
}

/** 清除所有缓存 */
export function clearAllStockCache() {
  localStorage.removeItem(CACHE_KEY);
}

// ═══════════════════════════════════════════════════
// 全市场数据 API
// ═══════════════════════════════════════════════════

/** 市场热度榜单项 */
export interface HeatItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  turnover: number; // 成交额（亿元）
}

// ─── 新浪市场热度榜 API（东方财富API不可用时fallback） ───

/**
 * 通过新浪API获取市场成交额热度榜TOP10（东方财富API不可用时fallback）
 * @returns 热度榜数据或null
 */
async function fetchMarketHeatTop10Sina(): Promise<HeatItem[] | null> {
  try {
    // node=hs_a: 沪深A股, sort=amount: 按成交额降序
    const url = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=10&sort=amount&asc=0&node=hs_a';
    const res = await fetch(url, { headers: { 'Referer': 'https://finance.sina.com.cn' } });
    if (!res.ok) return null;

    // 新浪返回GBK编码 — 浏览器端TextDecoder('gbk')不可靠
    // 策略：先用gbk解码，name字段几乎一定会乱码，然后统一用腾讯API获取正确名称
    const buffer = await res.arrayBuffer();
    let text: string;
    try { text = new TextDecoder('gbk').decode(buffer); }
    catch { text = new TextDecoder('utf-8').decode(buffer); }

    let data: any[];
    try { data = JSON.parse(text); }
    catch {
      const m = text.match(/\[.*\]/s);
      data = m ? JSON.parse(m[0]) : [];
    }
    if (!Array.isArray(data) || data.length === 0) return null;

    // 第1步：从新浪API提取code/price/change/turnover（数字字段不受编码影响）
    const rawItems = data.map((item: any) => {
      const code = item.code || '';
      const symbol = item.symbol || '';
      const prefix = symbol.startsWith('sh') ? 'sh' : symbol.startsWith('sz') ? 'sz' : '';
      return {
        code: prefix ? `${prefix}${code}` : code,
        price: parseFloat(item.trade || 0) || 0,
        changePercent: parseFloat(item.changepercent || 0) || 0,
        turnover: (parseFloat(item.amount || 0) || 0) / 1e8,
      };
    }).filter((s: { code: string }) => s.code.length >= 8); // sh600519 = 8 chars

    if (rawItems.length === 0) return null;

    // 第2步：通过腾讯API批量获取正确名称（GBK编码可靠）
    const queryCodes = rawItems.map((s: { code: string }) => s.code).join(',');
    const tencentRes = await fetch(`https://qt.gtimg.cn/q=${queryCodes}`);
    const tencentBuffer = await tencentRes.arrayBuffer();
    let tencentText: string;
    try { tencentText = new TextDecoder('gbk').decode(tencentBuffer); }
    catch { tencentText = new TextDecoder('utf-8').decode(tencentBuffer); }

    const nameMap: Record<string, string> = {};
    const regex = /v_(sh\d+|sz\d+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(tencentText)) !== null) {
      const parts = m[2].split('~');
      if (parts[1] && parts[1].length > 0 && parts[1] !== m[1]) {
        nameMap[m[1]] = parts[1];
      }
    }

    // 第3步：合并数据
    const items: HeatItem[] = rawItems.map((s: { code: string; price: number; changePercent: number; turnover: number }) => ({
      code: s.code,
      name: nameMap[s.code] || s.code, // fallback to code if name not found
      price: s.price,
      changePercent: s.changePercent,
      turnover: s.turnover,
    })).filter((s: HeatItem) => s.name !== s.code); // filter out items where name lookup failed

    return items.length > 0 ? items : null;
  } catch (err) {
    console.warn('[HeatTop10][Sina] 新浪热度榜API失败:', err);
    return null;
  }
}

/** 获取全市场成交额热度榜TOP10（东方财富API）
 *  按成交额(f6)降序排序，取前10名
 */
export async function fetchMarketHeatTop10(): Promise<HeatItem[] | null> {
  try {
    const res = await fetch(
      'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f6',
      { headers: { 'Referer': 'https://data.eastmoney.com/' } }
    );

    const json = await res.json();
    const items = (json.data?.diff || []).map((item: any) => ({
      code: item.f12,
      name: item.f14,
      price: (safeNum(item.f2)) / 100,
      changePercent: safeNum(item.f3),
      turnover: safeNum(item.f6) / 100000000, // 元 → 亿元
    }));

    return items;
  } catch (err) {
    console.warn('[HeatTop10] 东财API获取失败，尝试新浪fallback:', err);

    // 东财API失败，尝试新浪API作为fallback
    const sinaResult = await fetchMarketHeatTop10Sina();
    if (sinaResult) {
      return sinaResult;
    }

    return null;
  }
}

/** 行业板块项 */
export interface SectorItem_real {
  name: string;
  changePercent: number;
}

/** 安全解析数字（处理 "-", null, undefined 等） */
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

// ─── 申万一级行业过滤配置 ───

/** 申万一级行业31个标准名称 */
const STANDARD_SECTORS = [
  '农林牧渔', '基础化工', '钢铁', '有色金属', '建筑材料', '建筑装饰',
  '电力设备', '机械设备', '国防军工', '汽车', '电子', '计算机',
  '通信', '传媒', '食品饮料', '家用电器', '纺织服饰', '轻工制造',
  '医药生物', '商业贸易', '社会服务', '银行', '非银金融', '房地产',
  '交通运输', '公用事业', '煤炭', '石油石化', '环保', '美容护理', '综合',
];

/** 东方财富原始名称 → 申万一级行业标准名称映射（237条） */
const SECTOR_NAME_MAP: Record<string, string> = {
  '专业服务': '建筑装饰',
  '专业连锁': '商业贸易',
  '专业工程': '建筑装饰',
  '专用设备': '机械设备',
  '个护小家电': '家用电器',
  '中药': '医药生物',
  '乳品': '食品饮料',
  '人工景区': '社会服务',
  '仪器仪表': '机械设备',
  '传媒': '传媒',
  '保险': '非银金融',
  '信托': '非银金融',
  '元件': '电子',
  '光伏加工设备': '电力设备',
  '光伏设备': '电力设备',
  '光学元件': '电子',
  '光学光电子': '电子',
  '公交': '交通运输',
  '公路铁路运输': '交通运输',
  '其他专用设备': '机械设备',
  '其他养殖': '农林牧渔',
  '其他化学制品': '基础化工',
  '其他化学纤维': '基础化工',
  '其他塑料制品': '基础化工',
  '其他小金属': '有色金属',
  '其他橡胶制品': '基础化工',
  '其他生物制品': '医药生物',
  '其他电子': '电子',
  '其他电源设备': '电力设备',
  '其他自动化设备': '机械设备',
  '其他酒类': '食品饮料',
  '其他金属新材料': '有色金属',
  '养殖业': '农林牧渔',
  '军工电子': '国防军工',
  '农业服务': '农林牧渔',
  '农业综合': '农林牧渔',
  '农产品加工': '农林牧渔',
  '农化制品': '基础化工',
  '冶钢原料': '钢铁',
  '冶钢辅料': '钢铁',
  '分立器件': '电子',
  '制冷空调设备': '机械设备',
  '动力煤': '煤炭',
  '动物保健': '农林牧渔',
  '包装印刷': '轻工制造',
  '化学制剂': '医药生物',
  '化学制品': '基础化工',
  '化学制药': '医药生物',
  '化学原料': '基础化工',
  '化学纤维': '基础化工',
  '医疗器械': '医药生物',
  '医疗服务': '医药生物',
  '医疗研发外包': '医药生物',
  '医疗美容': '美容护理',
  '医美服务': '美容护理',
  '医美耗材': '美容护理',
  '医药商业': '医药生物',
  '半导体': '电子',
  '半导体材料': '电子',
  '卫浴制品': '轻工制造',
  '卫浴电器': '家用电器',
  '印制电路板': '电子',
  '印刷': '轻工制造',
  '厨卫电器': '家用电器',
  '厨房小家电': '家用电器',
  '厨房电器': '家用电器',
  '合成树脂': '基础化工',
  '品牌消费电子': '电子',
  '商用载客车': '汽车',
  '国际工程': '建筑装饰',
  '地面兵装': '国防军工',
  '城商行': '银行',
  '基础建设': '建筑装饰',
  '塑料': '基础化工',
  '多元金融': '非银金融',
  '大宗用纸': '轻工制造',
  '家用轻工': '轻工制造',
  '小家电': '家用电器',
  '小金属': '有色金属',
  '工业金属': '有色金属',
  '工程咨询服务': '建筑装饰',
  '广告营销': '传媒',
  '建筑材料': '建筑材料',
  '建筑装饰': '建筑装饰',
  '快递': '交通运输',
  '房地产开发': '房地产',
  '房地产服务': '房地产',
  '房地产综合服务': '房地产',
  '房屋建设': '建筑装饰',
  '改性塑料': '基础化工',
  '教育': '社会服务',
  '数字芯片设计': '电子',
  '整车': '汽车',
  '文字媒体': '传媒',
  '旅游及景区': '社会服务',
  '旅游综合': '社会服务',
  '旅游零售': '商业贸易',
  '无机盐': '基础化工',
  '有机硅': '基础化工',
  '服装家纺': '纺织服饰',
  '期货': '非银金融',
  '机场': '交通运输',
  '机场航运': '交通运输',
  '林业': '农林牧渔',
  '果蔬加工': '食品饮料',
  '模拟芯片设计': '电子',
  '橡胶': '基础化工',
  '橡胶助剂': '基础化工',
  '氟化工': '基础化工',
  '氯碱': '基础化工',
  '水泥': '建筑材料',
  '水泥制造': '建筑材料',
  '汽车零部件': '汽车',
  '油服工程': '石油石化',
  '油气及炼化工程': '石油石化',
  '油气开采': '石油石化',
  '油气开采及服务': '石油石化',
  '油田服务': '石油石化',
  '洗护用品': '美容护理',
  '涂料油墨': '基础化工',
  '消费电子': '电子',
  '消费电子零部件及组装': '电子',
  '清洁小家电': '家用电器',
  '渔业': '农林牧渔',
  '港口': '交通运输',
  '港口航运': '交通运输',
  '激光设备': '机械设备',
  '炭黑': '基础化工',
  '炼油化工': '石油石化',
  '热力服务': '公用事业',
  '焦煤': '煤炭',
  '煤炭开采': '煤炭',
  '煤炭开采加工': '煤炭',
  '照明设备': '家用电器',
  '燃料电池': '电力设备',
  '燃气': '公用事业',
  '物流': '交通运输',
  '特钢': '钢铁',
  '环保': '环保',
  '环保设备': '环保',
  '玻璃制造': '建筑材料',
  '玻璃玻纤': '建筑材料',
  '玻纤制造': '建筑材料',
  '瓷砖地板': '建筑材料',
  '生物制品': '医药生物',
  '生猪养殖': '农林牧渔',
  '电力': '公用事业',
  '电动乘用车': '汽车',
  '电子化学品': '电子',
  '电工仪器仪表': '机械设备',
  '电机': '电力设备',
  '电池': '电力设备',
  '电网设备': '电力设备',
  '电视广播': '传媒',
  '白色家电': '家用电器',
  '白酒': '食品饮料',
  '白银': '有色金属',
  '石油加工贸易': '石油石化',
  '磁性材料': '电子',
  '磨具磨料': '机械设备',
  '种植业与林业': '农林牧渔',
  '租赁': '非银金融',
  '空调': '家用电器',
  '粘胶': '纺织服饰',
  '粮食种植': '农林牧渔',
  '纺织制造': '纺织服饰',
  '纺织鞋类制造': '纺织服饰',
  '线缆部件及其他': '电力设备',
  '综合电商': '商业贸易',
  '美容护理': '美容护理',
  '肉制品': '食品饮料',
  '肉鸡养殖': '农林牧渔',
  '胶黏剂及胶带': '基础化工',
  '能源金属': '有色金属',
  '膜材料': '基础化工',
  '自动化设备': '机械设备',
  '自然景区': '社会服务',
  '航天装备': '国防军工',
  '航海装备': '国防军工',
  '航空机场': '交通运输',
  '航空装备': '国防军工',
  '航空运输': '交通运输',
  '航运': '交通运输',
  '航运港口': '交通运输',
  '营销代理': '传媒',
  '蓄电池及其他电池': '电力设备',
  '血液制品': '医药生物',
  '被动元件': '电子',
  '装修建材': '建筑材料',
  '装修装饰': '建筑装饰',
  '视频媒体': '传媒',
  '计算机应用': '计算机',
  '计算机设备': '计算机',
  '证券': '非银金融',
  '贵金属': '有色金属',
  '贸易': '商业贸易',
  '轨交设备': '机械设备',
  '软饮料': '食品饮料',
  '辅料': '纺织服饰',
  '通信服务': '通信',
  '通信线缆及配套': '通信',
  '通信终端及配件': '通信',
  '通信网络设备及器件': '电子',
  '通信设备': '通信',
  '通用设备': '机械设备',
  '造纸': '轻工制造',
  '酒店': '社会服务',
  '酒店餐饮': '社会服务',
  '金属包装': '轻工制造',
  '金属新材料': '有色金属',
  '金融控股': '非银金融',
  '钛白粉': '基础化工',
  '钢铁': '钢铁',
  '钨': '有色金属',
  '钼': '有色金属',
  '铅锌': '有色金属',
  '铜': '有色金属',
  '铝': '有色金属',
  '锂电专用设备': '电力设备',
  '锂电池': '电力设备',
  '镍': '有色金属',
  '防水材料': '建筑材料',
  '集成电路制造': '电子',
  '集成电路封测': '电子',
  '零售': '商业贸易',
  '非白酒': '食品饮料',
  '非金属材料': '建筑材料',
  '面板': '电子',
  '鞋帽及其他': '纺织服饰',
  '风电设备': '电力设备',
  '食品加工制造': '食品饮料',
  '餐饮': '社会服务',
  '饮料乳品': '食品饮料',
  '饮料制造': '食品饮料',
  '黑色家电': '家用电器',
};

/** 黑名单模式：排除概念板块、分级、ETF等非行业板块 */
const BLACKLIST_PATTERNS = ['II', 'III', 'IV', 'Ⅱ', 'Ⅲ', 'Ⅳ', '概念', 'ETF', 'LOF', '指数', '主题', '精选'];

/** 将原始板块名称映射到申万一级行业标准名称 */
function resolveStandardSectorName(rawName: string): string | null {
  // 1. 直接匹配标准名称
  if (STANDARD_SECTORS.includes(rawName)) return rawName;
  // 2. 通过映射表转换
  if (SECTOR_NAME_MAP[rawName]) return SECTOR_NAME_MAP[rawName];
  // 3. 去掉 Unicode 和 ASCII 罗马数字后缀 (如 "白酒Ⅱ" → "白酒")
  const cleanedNum = rawName
    .replace(/[ⅡⅢⅣ]+$/, '')
    .replace(/[IIIIV]+$/, '')
    .trim();
  if (STANDARD_SECTORS.includes(cleanedNum)) return cleanedNum;
  if (SECTOR_NAME_MAP[cleanedNum]) return SECTOR_NAME_MAP[cleanedNum];
  // 4. 尝试模糊匹配：去掉常见后缀
  const cleaned = cleanedNum
    .replace(/板块$/, '')
    .replace(/行业$/, '')
    .replace(/^(.+?)\s*[-—].*$/, '$1')
    .trim();
  if (STANDARD_SECTORS.includes(cleaned)) return cleaned;
  if (SECTOR_NAME_MAP[cleaned]) return SECTOR_NAME_MAP[cleaned];
  // 无法匹配
  return null;
}

/** 检查原始名称是否在黑名单中 */
function isBlacklistedSector(rawName: string): boolean {
  return BLACKLIST_PATTERNS.some((p) => rawName.includes(p));
}

// ─── 新浪行业板块 API（东方财富API不可用时fallback） ───

/**
 * 通过新浪API获取行业板块数据（东方财富API不可用时fallback）
 * @returns 板块热点数据或null
 */
async function fetchSectorHeatmapSina(): Promise<{ upSectors: SectorItem_real[]; downSectors: SectorItem_real[] } | null> {
  try {
    // 并行获取：涨跌幅降序(领涨) + 升序(领跌)
    const [upRes, downRes] = await Promise.all([
      fetch('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=40&sort=changepercent&asc=0&node=hs_s', { headers: { 'Referer': 'https://finance.sina.com.cn' } }),
      fetch('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=40&sort=changepercent&asc=1&node=hs_s', { headers: { 'Referer': 'https://finance.sina.com.cn' } }),
    ]);

    const parseJson = async (res: Response): Promise<any[]> => {
      if (!res.ok) return [];
      // GBK解码
      const buffer = await res.arrayBuffer();
      let text: string;
      try { text = new TextDecoder('gbk').decode(buffer); } catch { text = new TextDecoder('utf-8').decode(buffer); }
      try {
        return JSON.parse(text);
      } catch {
        const m = text.match(/\[.*\]/s);
        return m ? JSON.parse(m[0]) : [];
      }
    };

    const [upData, downData] = await Promise.all([parseJson(upRes), parseJson(downRes)]);

    const allSectors = new Map<string, number>();
    for (const item of [...upData, ...downData]) {
      const name = item.name || '未知';
      const pct = parseFloat(item.changepercent) || 0;
      if (name && name !== '未知' && name.length > 0) {
        // 去重：保留绝对值更大的涨跌幅
        const existing = allSectors.get(name);
        if (!existing || Math.abs(pct) > Math.abs(existing)) {
          allSectors.set(name, pct);
        }
      }
    }

    const sectors = Array.from(allSectors.entries()).map(([name, changePercent]) => ({ name, changePercent }));

    const upSectors = sectors
      .filter((s) => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);
    const downSectors = sectors
      .filter((s) => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);

    return { upSectors, downSectors };
  } catch (err) {
    console.warn('[SectorHeatmap][Sina] 新浪行业板块API失败:', err);
    return null;
  }
}

/** 获取行业板块涨跌幅（东方财富API，申万一级行业过滤）
 *  并行获取：po=1 领涨 + po=0 领跌，过滤后只保留31个申万一级行业
 */
export async function fetchSectorHeatmap(): Promise<{ upSectors: SectorItem_real[]; downSectors: SectorItem_real[] } | null> {
  try {

    // 并行获取：涨幅降序(po=1) + 跌幅升序(po=0)，各取100条充分过滤
    const [upRes, downRes] = await Promise.all([
      fetch(
        'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f14,f3',
        { headers: { 'Referer': 'https://data.eastmoney.com/' } }
      ),
      fetch(
        'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=0&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f14,f3',
        { headers: { 'Referer': 'https://data.eastmoney.com/' } }
      ),
    ]);

    const upJson = await upRes.json();
    const downJson = await downRes.json();

    const upRaw = (upJson.data?.diff || []) as any[];
    const downRaw = (downJson.data?.diff || []) as any[];


    // ─── 过滤 + 映射 + 去重处理 ───

    function processSectorItems(rawItems: any[], label: string): SectorItem_real[] {
      const sectorMap = new Map<string, SectorItem_real>();
      let filteredCount = 0;
      let mappedCount = 0;
      let droppedCount = 0;
      const droppedSamples: string[] = []; // 记录前5个被丢弃的名称

      for (const item of rawItems) {
        const rawName: string = item.f14 || '';
        const changePercent = safeNum(item.f3);

        // Step 1: 黑名单过滤
        if (isBlacklistedSector(rawName)) {
          filteredCount++;
          continue;
        }

        // Step 2: 名称映射到标准行业
        const standardName = resolveStandardSectorName(rawName);
        if (!standardName) {
          droppedCount++;
          if (droppedSamples.length < 5) {
            droppedSamples.push(`${rawName}(${changePercent}%)`);
          }
          continue; // 无法识别的非一级行业，丢弃
        }

        mappedCount++;

        // Step 3: 去重 —— 同一标准行业保留绝对值最大的涨跌幅
        const existing = sectorMap.get(standardName);
        if (!existing || Math.abs(changePercent) > Math.abs(existing.changePercent)) {
          sectorMap.set(standardName, { name: standardName, changePercent });
        }
      }

      if (droppedSamples.length > 0) {
      }

      // 转换为数组并按涨跌幅排序
      return Array.from(sectorMap.values()).sort((a, b) => b.changePercent - a.changePercent);
    }

    // 调试：显示前5条原始数据样本（用于验证f14/f3格式）

    const allUp = processSectorItems(upRaw, '领涨');
    const allDown = processSectorItems(downRaw, '领跌');

    // 分离上涨和下跌（以0为界）
    const upSectors = allUp.filter((s) => s.changePercent > 0).slice(0, 5);
    const downSectors = allDown.filter((s) => s.changePercent < 0).slice(0, 5);

    // 调试输出：显示所有保留的行业

    // 如果数据不足，给出警告
    if (upSectors.length === 0 && downSectors.length === 0) {
      console.warn('[SectorHeatmap] 过滤后无有效行业数据，可能API返回格式变更');
      return null;
    }

    return { upSectors, downSectors };
  } catch (err) {
    console.warn('[SectorHeatmap] 东财API获取失败，尝试新浪fallback:', err);

    // 东财API失败，尝试新浪API作为fallback
    const sinaResult = await fetchSectorHeatmapSina();
    if (sinaResult) {
      return sinaResult;
    }

    return null;
  }
}

// ─── 东方财富搜索API：补充股票名称（解决腾讯API name乱码）───

const nameCache: Record<string, string> = {};

/** 通过东方财富搜索API获取股票正确名称 */
export async function resolveStockName(code: string): Promise<string> {
  // 1. 检查内置库
  if (BUILT_IN_STOCKS[code]?.name) return BUILT_IN_STOCKS[code].name;
  // 2. 检查缓存
  if (nameCache[code]) return nameCache[code];
  // 3. 调用东方财富搜索API
  try {
    const res = await fetch(
      `https://searchapi.eastmoney.com/api/suggest/get?input=${code}&type=14&count=1`,
      { headers: { 'Referer': 'https://quote.eastmoney.com/' } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const data = json?.QuotationCodeTable?.Data?.[0];
    if (data?.Name) {
      nameCache[code] = data.Name;
      return data.Name;
    }
  } catch {
    // 静默失败
  }
  // 4. 兜底：返回代码
  return code;
}

/** 批量解析股票名称 */
export async function resolveStockNames(codes: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  // 并行请求（最多10个并发）
  const batchSize = 10;
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const names = await Promise.all(batch.map(resolveStockName));
    batch.forEach((code, idx) => { result[code] = names[idx]; });
  }
  return result;
}

// ─── 腾讯财经API（支持CORS）───

/**
 * 腾讯财经API - 支持跨域
 * 格式: https://qt.gtimg.cn/q=sh600519,sz000988
 * 返回: v_sh600519="1~贵州茅台~600519~1680.50~..."
 */
export async function fetchStockFromAPI(code: string): Promise<StockInfo | null> {
  try {
    const prefix = getTencentPrefix(code);
    const url = `https://qt.gtimg.cn/q=${prefix}${code}`;

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;

    // 腾讯API返回GBK编码，需要正确解码
    const buffer = await res.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buffer);
    let result = parseTencentData(code, text);

    // 如果名称乱码（不在内置库且解析失败），尝试GBK解码
    if (result && (result.name === code || result.name.includes('�'))) {
      try {
        text = new TextDecoder('gbk').decode(buffer);
        const gbkResult = parseTencentData(code, text);
        if (gbkResult && gbkResult.name !== code && !gbkResult.name.includes('�')) {
          result = gbkResult;
        }
      } catch {
        // GBK解码失败，保持UTF-8结果
      }
    }
    // 如果名称仍为"未知"（不在BUILT_IN_STOCKS中），通过东方财富API获取正确名称
    if (result && result.name === '未知') {
      const resolvedName = await resolveStockName(code);
      if (resolvedName && resolvedName !== code) {
        result.name = resolvedName;
      }
    }
    return result;
  } catch (err) {
    console.warn(`获取股票 ${code} 失败:`, err);
    return null;
  }
}

/** 批量获取（腾讯支持一次查多只） */
export async function fetchStocksFromAPI(codes: string[]): Promise<Record<string, StockInfo>> {
  const result: Record<string, StockInfo> = {};
  if (codes.length === 0) return result;

  try {
    // 腾讯API一次最多支持60只
    const batchSize = 60;
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      const queryStr = batch.map((c) => getTencentPrefix(c) + c).join(',');
      const url = `https://qt.gtimg.cn/q=${queryStr}`;

      const res = await fetch(url);
      if (!res.ok) continue;

      const text = await res.text();
      // 解析每只股票的返回
      for (const code of batch) {
        const parsed = parseTencentData(code, text);
        if (parsed) {
          result[code] = parsed;
          saveStockToLocal(parsed);
        }
      }
    }
  } catch (err) {
    console.warn('批量获取股票失败:', err);
  }

  return result;
}

/**
 * 解析腾讯API返回数据
 * 实测验证字段索引（2026-05-21 对 600519 实际返回数据校准）：
 * [0]=市场 [1]=名称 [2]=代码 [3]=当前价 [4]=昨收 [5]=今开
 * [6]=成交量(手) [7]=外盘 [8]=内盘 [9-28]=买卖五档+逐笔
 * [30]=更新时间 [31]=涨跌额(元) [32]=涨跌幅% [33]=最高 [34]=最低
 * [35]=当前价/成交量/成交额复合字段 [36]=成交量(手) [37]=成交额(万元)
 * [38]=换手率% [39]=市盈率 [41]=最高 [42]=最低 [43]=振幅%
 * [44]=流通市值(亿) [45]=总市值(亿) [46]=市净率 [47]=涨停价 [48]=跌停价
 * [67]=52周最高 [68]=52周最低
 */
function parseTencentData(code: string, text: string): StockInfo | null {
  const prefix = getTencentPrefix(code);
  const match = text.match(new RegExp(`v_${prefix}${code}="([^"]*)"`));
  if (!match) return null;

  const parts = match[1].split('~');
  if (parts.length < 40) return null;

  // 处理乱码: 如果API返回的名称是乱码，使用内置库
  let name = parts[1];
  if (!name || name.includes('�') || /[^\u4e00-\u9fa5a-zA-Z0-9\-]/.test(name.charAt(0))) {
    name = BUILT_IN_STOCKS[code]?.name || '';
  }
  // 兜底：name为空时显示"未知"
  if (!name || name === code) {
    name = BUILT_IN_STOCKS[code]?.name || '未知';
  }
  const industry = BUILT_IN_STOCKS[code]?.industry || inferIndustry(code);

  // 核心字段（从实际API返回数据校准）
  const price = parseFloat(parts[3]) || 0;
  const prevClose = parseFloat(parts[4]) || 0;
  const open = parseFloat(parts[5]) || 0;
  const high = parseFloat(parts[33]) || 0;
  const low = parseFloat(parts[34]) || 0;
  const volume = (parseFloat(parts[36]) || 0) * 100; // 手→股
  const turnover = (parseFloat(parts[37]) || 0) * 10000; // 万元→元

  // [31]=涨跌额(元) [32]=涨跌幅%
  const change = parseFloat(parts[31]) || 0;
  const changePercent = parseFloat(parts[32]) || 0;

  const pe = parseFloat(parts[39]) || 0;
  const pb = parseFloat(parts[46]) || 0;
  const marketCap = parseFloat(parts[45]) || 0; // 总市值(亿元)
  const high52w = parseFloat(parts[67]) || 0;
  const low52w = parseFloat(parts[68]) || 0;

  if (price <= 0) return null;

  const info: StockInfo = {
    code,
    name,
    industry,
    price,
    change,
    changePercent,
    open,
    high,
    low,
    prevClose,
    volume,
    turnover,
    marketCap,
    pe,
    pb,
    high52w,
    low52w,
    updateTime: new Date().toISOString(),
  };

  saveStockToLocal(info);
  return info;
}

// ─── 统一查询入口 ───

/**
 * 查询股票（API优先，失败回退本地缓存）
 */
export async function queryStock(code: string): Promise<StockInfo | null> {
  // 1. 检查本地缓存
  const local = getStockFromLocal(code);
  if (local) return local;

  // 2. 从API获取
  const apiData = await fetchStockFromAPI(code);
  if (apiData) {
    // 3. 名称乱码或显示"未知"时，通过东方财富API获取正确名称
    if (apiData.name === code || apiData.name === '未知' || apiData.name.includes('�') || /[^\u4e00-\u9fa5a-zA-Z0-9\-]/.test(apiData.name.charAt(0))) {
      apiData.name = await resolveStockName(code);
    }
    return apiData;
  }

  return null;
}

/**
 * 批量查询
 */
export async function queryStocks(codes: string[]): Promise<Record<string, StockInfo>> {
  const result: Record<string, StockInfo> = {};

  // 先检查本地缓存
  const needFetch: string[] = [];
  for (const code of codes) {
    const local = getStockFromLocal(code);
    if (local) {
      result[code] = local;
    } else {
      needFetch.push(code);
    }
  }

  // 批量API获取
  if (needFetch.length > 0) {
    const fetched = await fetchStocksFromAPI(needFetch);
    // 自动修复乱码名称
    const badNameCodes: string[] = [];
    Object.values(fetched).forEach((s) => {
      if (s.name === s.code || s.name === '未知' || s.name.includes('�') || /[^\u4e00-\u9fa5a-zA-Z0-9\-]/.test(s.name.charAt(0))) {
        badNameCodes.push(s.code);
      }
    });
    if (badNameCodes.length > 0) {
      const nameMap = await resolveStockNames(badNameCodes);
      badNameCodes.forEach((c) => {
        if (fetched[c] && nameMap[c] && nameMap[c] !== c) {
          fetched[c].name = nameMap[c];
        }
      });
    }
    Object.assign(result, fetched);
  }

  return result;
}

// ─── 股票代码前缀/市场判断辅助函数 ───

/**
 * 判断股票所属交易所并返回腾讯API前缀
 * - 6开头(600/601/603/605/688/689) → 'sh' 上海(主板+科创板)
 * - 0/3开头(000/001/002/003/300/301) → 'sz' 深圳(主板+创业板+中小板)
 * - 4/8开头(430/83x/87x/88x) → 'bj' 北交所
 */
function getTencentPrefix(code: string): string {
  // 沪市: 6xx(主板+科创板) / 5xx(ETF+LOF+可转债等)
  if (code.startsWith('6') || code.startsWith('5') || code.startsWith('11')) return 'sh';
  // 深市: 0xx(主板+中小板) / 3xx(创业板) / 15/16/18(ETF+LOF)
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('15') || code.startsWith('16') || code.startsWith('18')) return 'sz';
  // 北交所: 43x, 83x, 87x, 88x 等
  if (code.startsWith('4') || code.startsWith('8')) return 'bj';
  // 默认回退，避免空值导致URL错误
  console.warn(`[getTencentPrefix] 未知代码前缀: ${code}，默认使用sz`);
  return 'sz';
}

/**
 * 判断股票所属交易所并返回东方财富secid前缀
 * - 6开头 → '1' 上海
 * - 0/3/4/8开头 → '0' 深圳+北交所（东财统一用0标识）
 */
function getEastMoneySecId(code: string): string {
  // 沪市: 6xx(主板+科创板) / 5xx(ETF+LOF+可转债等) / 11xx(沪B+可转债) → 东财前缀 '1'
  if (code.startsWith('6') || code.startsWith('5') || code.startsWith('11')) return '1';
  // 深市: 0xx(主板+中小板) / 3xx(创业板) / 15/16/18(ETF+LOF) 和北交所 → 东财前缀 '0'
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('4') || code.startsWith('8') || code.startsWith('15') || code.startsWith('16') || code.startsWith('18')) return '0';
  console.warn(`[getEastMoneySecId] 未知代码前缀: ${code}，默认使用0`);
  return '0';
}

/** 推断未知股票行业 */
export function inferIndustry(code: string): string {
  const prefix3 = code.substring(0, 3);
  const prefix2 = code.substring(0, 2);
  const map: Record<string, string> = {
    // 沪市主板
    '600': '沪市主板', '601': '金融', '603': '制造业', '605': '制造业',
    // 深市
    '000': '深市主板', '001': '基建', '002': '中小板', '003': '中小板',
    '300': '创业板', '301': '创业板',
    // 科创板
    '688': '科创板', '689': '科创板',
    // ETF
    '510': 'ETF', '511': 'ETF', '512': 'ETF', '513': 'ETF', '515': 'ETF',
    '516': 'ETF', '517': 'ETF', '518': 'ETF', '560': 'ETF', '561': 'ETF',
    '563': 'ETF', '564': 'ETF', '588': 'ETF',
    '159': 'ETF', '160': 'ETF', '161': 'ETF', '162': 'ETF', '163': 'ETF',
    '164': 'ETF', '165': 'ETF', '167': 'ETF', '169': 'ETF',
    // 北交所 (43x, 83x, 87x, 88x 等)
    '430': '北交所', '431': '北交所', '432': '北交所', '433': '北交所',
    '830': '北交所', '831': '北交所', '832': '北交所', '833': '北交所',
    '834': '北交所', '835': '北交所', '836': '北交所', '837': '北交所',
    '838': '北交所', '839': '北交所',
    '870': '北交所', '871': '北交所', '872': '北交所', '873': '北交所',
    '874': '北交所', '875': '北交所', '876': '北交所', '877': '北交所',
    '878': '北交所', '879': '北交所',
    '880': '北交所', '881': '北交所', '882': '北交所', '883': '北交所',
    '884': '北交所', '885': '北交所', '886': '北交所', '887': '北交所',
    '888': '北交所', '889': '北交所',
  };
  return map[prefix3] || map[prefix2 + '0'] || '综合';
}

// ═══════════════════════════════════════════════════
// Monitor / Real-time Tracking Types & Functions
// ═══════════════════════════════════════════════════

export interface KLineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface TechnicalIndicators {
  ma5: number[];
  ma10: number[];
  ma20: number[];
  macdDIF: number[];
  macdDEA: number[];
  macdHist: number[];
  kdjK: number[];
  kdjD: number[];
  kdjJ: number[];
  rsi6: number[];
  rsi12: number[];
  bbUpper: number[];
  bbMid: number[];
  bbLower: number[];
  support: number;
  resistance: number;
}

export interface TradeSignal {
  type: '买入' | '卖出' | '观望';
  strength: number; // 1-5
  triggers: string[];
  suggestedPrice: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: string;
  priceAtSignal: number;
}

export interface StrengthScore {
  total: number; // 0-100
  rating: '极强' | '强势' | '均衡' | '弱势' | '极弱';
  trendScore: number;      // 0-30
  volumeScore: number;     // 0-25
  techScore: number;       // 0-20
  strategyScore: number;   // 0-15
  momentumScore: number;   // 0-10
  analysis: string;
}

export interface SignalRecord {
  id: string;
  type: '买入' | '卖出' | '观望';
  strength: number;
  triggers: string[];
  priceAtSignal: number;
  timestamp: string;
  strategy: string;
  verified: boolean;
  verificationResult: '有效' | '无效' | '待验证' | null;
  verifyPrice: number | null;
  returnPercent: number | null;
  accuracyStats: { total: number; correct: number } | null;
}

export interface MonitorData {
  stock: StockInfo;
  kline: KLineData[];
  indicators: TechnicalIndicators;
  signals: TradeSignal[];
  strength: StrengthScore;
  matchedStrategy: { name: string; score: number } | null;
  signalHistory: SignalRecord[];
}

// ─── seeded random helpers ───

function sRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function codeSeed(code: string): number {
  return code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}


/**
 * 获取真实历史K线数据
 * 优先从API获取，失败时返回空数组
 * @param basePrice 基准价格（备用参数，保持向后兼容）
 * @param code 股票代码
 * @param days 请求天数（默认60）
 * @returns K线数据数组
 */
export async function generateKLines(basePrice: number, code: string, days = 60): Promise<KLineData[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000 * 1.5); // *1.5 补偿周末节假日
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

  try {
    const realData = await fetchHistoricalKLines(code, startStr, endStr);
    if (realData && realData.length > 0) {
      return realData.slice(-days);
    }
  } catch (err) {
    console.warn(`[generateKLines] ${code} 获取真实K线失败:`, err);
  }

  console.warn(`[generateKLines] ${code} 无法获取真实数据，返回空数组`);
  return [];
}

// ─── Technical indicators generator ───

function generateIndicators(klines: KLineData[]): TechnicalIndicators {
  const closes = klines.map((k) => k.close);

  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);

  // MACD (12, 26, 9)
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

  // KDJ
  const { k, d, j } = kdj(klines);

  // RSI
  const rsi6 = rsi(closes, 6);
  const rsi12 = rsi(closes, 12);

  // Bollinger Bands
  const bbUpper: number[] = [];
  const bbMid = ma20;
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

  // 真实支撑/压力：最近20日高低点
  const recent20 = closes.slice(-20);
  const support = Math.round(Math.min(...recent20) * 100) / 100;
  const resistance = Math.round(Math.max(...recent20) * 100) / 100;

  return {
    ma5, ma10, ma20,
    macdDIF, macdDEA, macdHist,
    kdjK: k, kdjD: d, kdjJ: j,
    rsi6, rsi12,
    bbUpper, bbMid, bbLower,
    support, resistance,
  };
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

function kdj(klines: KLineData[]) {
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
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
    const curJ = 3 * curK - 2 * curD;

    k.push(curK);
    d.push(curD);
    j.push(curJ);
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
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

// ─── Signal generator ───

/** 基于真实技术指标生成交易信号 */
function generateSignals(klines: KLineData[], indicators: TechnicalIndicators): TradeSignal[] {
  const lastPrice = klines[klines.length - 1].close;
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 取最新有效指标值
  const lastValid = (arr: number[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (!isNaN(arr[i])) return arr[i];
    return NaN;
  };
  const macdHist = lastValid(indicators.macdHist);
  const macdDIF = lastValid(indicators.macdDIF);
  const macdDEA = lastValid(indicators.macdDEA);
  const kdjK = lastValid(indicators.kdjK);
  const kdjD = lastValid(indicators.kdjD);
  const rsi6 = lastValid(indicators.rsi6);
  const ma5 = lastValid(indicators.ma5);
  const ma10 = lastValid(indicators.ma10);
  const ma20 = lastValid(indicators.ma20);
  const bbUpper = lastValid(indicators.bbUpper);
  const bbLower = lastValid(indicators.bbLower);

  // 趋势方向
  const priceAboveMA5 = !isNaN(ma5) && lastPrice > ma5;
  const priceAboveMA20 = !isNaN(ma20) && lastPrice > ma20;
  const ma5AboveMA10 = !isNaN(ma5) && !isNaN(ma10) && ma5 > ma10;
  const macdGoldenCross = !isNaN(macdDIF) && !isNaN(macdDEA) && macdDIF > macdDEA && macdHist > 0;
  const macdDeathCross = !isNaN(macdDIF) && !isNaN(macdDEA) && macdDIF < macdDEA && macdHist < 0;
  const kdjGoldenCross = !isNaN(kdjK) && !isNaN(kdjD) && kdjK > kdjD && kdjK < 80;
  const kdjDeathCross = !isNaN(kdjK) && !isNaN(kdjD) && kdjK < kdjD && kdjK > 20;
  const rsiOversold = !isNaN(rsi6) && rsi6 < 30;
  const rsiOverbought = !isNaN(rsi6) && rsi6 > 70;
  const priceBreakUpperBB = !isNaN(bbUpper) && lastPrice > bbUpper;
  const priceBreakLowerBB = !isNaN(bbLower) && lastPrice < bbLower;

  // 计分系统
  let buyScore = 0;
  let sellScore = 0;
  const buyTriggers: string[] = [];
  const sellTriggers: string[] = [];

  if (priceAboveMA5) { buyScore += 2; buyTriggers.push('价格站上MA5，短期趋势向上'); }
  if (priceAboveMA20) { buyScore += 3; buyTriggers.push('价格站上MA20，中期趋势向上'); }
  if (ma5AboveMA10) { buyScore += 2; buyTriggers.push('MA5上穿MA10，均线多头排列'); }
  if (macdGoldenCross) { buyScore += 3; buyTriggers.push('MACD金叉，动能转正'); }
  if (kdjGoldenCross) { buyScore += 2; buyTriggers.push('KDJ金叉， momentum 向上'); }
  if (rsiOversold) { buyScore += 3; buyTriggers.push('RSI超卖(<30)，反弹概率高'); }
  if (priceBreakUpperBB) { buyScore += 2; buyTriggers.push('突破布林带上轨，强势突破'); }

  if (!priceAboveMA5) { sellScore += 2; sellTriggers.push('价格跌破MA5，短期趋势向下'); }
  if (!priceAboveMA20) { sellScore += 3; sellTriggers.push('价格跌破MA20，中期趋势向下'); }
  if (!ma5AboveMA10) { sellScore += 2; sellTriggers.push('MA5下穿MA10，均线空头排列'); }
  if (macdDeathCross) { sellScore += 3; sellTriggers.push('MACD死叉，动能转负'); }
  if (kdjDeathCross) { sellScore += 2; sellTriggers.push('KDJ死叉， momentum 向下'); }
  if (rsiOverbought) { sellScore += 3; sellTriggers.push('RSI超买(>70)，回调风险高'); }
  if (priceBreakLowerBB) { sellScore += 2; sellTriggers.push('跌破布林带下轨，弱势破位'); }

  // 判定信号
  let type: TradeSignal['type'] = '观望';
  let strength = 1;
  let triggers: string[] = [];

  if (buyScore >= 6 && buyScore > sellScore + 2) {
    type = '买入';
    strength = Math.min(5, 2 + Math.floor(buyScore / 3));
    triggers = buyTriggers.slice(0, 3);
  } else if (sellScore >= 6 && sellScore > buyScore + 2) {
    type = '卖出';
    strength = Math.min(5, 2 + Math.floor(sellScore / 3));
    triggers = sellTriggers.slice(0, 3);
  } else {
    type = '观望';
    strength = 1;
    if (priceAboveMA5 && !priceAboveMA20) triggers.push('短期偏强但中期承压，方向不明');
    else if (!priceAboveMA5 && priceAboveMA20) triggers.push('短期偏弱但中期支撑，等待方向');
    else triggers.push('多空力量均衡，指标无明显方向');
  }

  return [{
    type,
    strength,
    triggers: triggers.length > 0 ? triggers : ['综合指标中性，暂无明确信号'],
    suggestedPrice: Math.round(lastPrice * 100) / 100,
    stopLoss: type === '买入' ? Math.round(lastPrice * 0.97 * 100) / 100 : type === '卖出' ? Math.round(lastPrice * 1.03 * 100) / 100 : Math.round(lastPrice * 0.95 * 100) / 100,
    takeProfit: type === '买入' ? Math.round(lastPrice * 1.06 * 100) / 100 : type === '卖出' ? Math.round(lastPrice * 0.94 * 100) / 100 : Math.round(lastPrice * 1.05 * 100) / 100,
    timestamp,
    priceAtSignal: lastPrice,
  }];
}

// ─── Strength score generator ───

/** 基于真实技术指标计算强弱评分 */
function calculateStrengthScore(klines: KLineData[], indicators: TechnicalIndicators): StrengthScore {
  const lastPrice = klines[klines.length - 1].close;
  const lastValid = (arr: number[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (!isNaN(arr[i])) return arr[i];
    return NaN;
  };
  const ma5 = lastValid(indicators.ma5);
  const ma20 = lastValid(indicators.ma20);
  const macdHist = lastValid(indicators.macdHist);
  const kdjK = lastValid(indicators.kdjK);
  const kdjJ = lastValid(indicators.kdjJ);
  const rsi6 = lastValid(indicators.rsi6);
  const bbUpper = lastValid(indicators.bbUpper);
  const bbLower = lastValid(indicators.bbLower);
  const closes = klines.map((k) => k.close);
  const avgVol = klines.slice(-20).reduce((s, k) => s + k.volume, 0) / 20;
  const todayVol = klines[klines.length - 1].volume;

  // ── 趋势评分(0-30)：基于均线排列+价格位置 ──
  let trendScore = 15;
  if (!isNaN(ma5) && !isNaN(ma20)) {
    if (lastPrice > ma5 && ma5 > ma20) trendScore = 28;
    else if (lastPrice > ma5 && ma5 <= ma20) trendScore = 22;
    else if (lastPrice < ma5 && ma5 < ma20) trendScore = 5;
    else if (lastPrice < ma5 && ma5 >= ma20) trendScore = 10;
    else trendScore = 15;
  }

  // ── 量能评分(0-25)：基于量比 ──
  let volumeScore = 12;
  if (avgVol > 0) {
    const volRatio = todayVol / avgVol;
    if (volRatio > 3) volumeScore = 25;
    else if (volRatio > 2) volumeScore = 22;
    else if (volRatio > 1.5) volumeScore = 18;
    else if (volRatio > 1) volumeScore = 14;
    else if (volRatio > 0.5) volumeScore = 8;
    else volumeScore = 4;
  }

  // ── 技术评分(0-20)：基于MACD+KDJ+布林带 ──
  let techScore = 10;
  let techPoints = 0;
  if (!isNaN(macdHist) && macdHist > 0) techPoints += 3;
  else if (!isNaN(macdHist)) techPoints -= 3;
  if (!isNaN(kdjK) && kdjK > 50) techPoints += 2;
  else if (!isNaN(kdjK)) techPoints -= 2;
  if (!isNaN(kdjJ) && kdjJ > 80) techPoints -= 2;
  else if (!isNaN(kdjJ) && kdjJ < 20) techPoints += 2;
  if (!isNaN(bbUpper) && !isNaN(bbLower) && bbUpper > bbLower) {
    const bbPos = (lastPrice - bbLower) / (bbUpper - bbLower);
    if (bbPos > 0.8) techPoints += 1;
    else if (bbPos < 0.2) techPoints -= 1;
  }
  techScore = Math.max(0, Math.min(20, 10 + techPoints * 2));

  // ── 策略评分(0-15)：基于RSI信号质量 ──
  let strategyScore = 7;
  if (!isNaN(rsi6)) {
    if (rsi6 < 20) strategyScore = 15;
    else if (rsi6 < 30) strategyScore = 12;
    else if (rsi6 > 80) strategyScore = 2;
    else if (rsi6 > 70) strategyScore = 5;
    else strategyScore = 8;
  }

  // ── 动量评分(0-10)：基于近期涨跌幅 ──
  let momentumScore = 5;
  if (closes.length >= 10) {
    const change5d = ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5]) * 100;
    if (change5d > 10) momentumScore = 10;
    else if (change5d > 5) momentumScore = 8;
    else if (change5d > 2) momentumScore = 6;
    else if (change5d > -2) momentumScore = 5;
    else if (change5d > -5) momentumScore = 3;
    else momentumScore = 1;
  }

  const total = trendScore + volumeScore + techScore + strategyScore + momentumScore;

  let rating: StrengthScore['rating'];
  let analysis: string;
  if (total >= 80) { rating = '极强'; analysis = '多头趋势明确，各维度共振向上，建议积极布局'; }
  else if (total >= 60) { rating = '强势'; analysis = '技术面偏强，量能配合良好，关注关键位置突破'; }
  else if (total >= 40) { rating = '均衡'; analysis = '多空力量均衡，等待方向选择，建议控制仓位观望'; }
  else if (total >= 20) { rating = '弱势'; analysis = '空头力量占优，技术指标走弱，建议谨慎操作'; }
  else { rating = '极弱'; analysis = '极度弱势，全面下跌，建议空仓或减仓避险'; }

  return { total, rating, trendScore, volumeScore, techScore, strategyScore, momentumScore, analysis };
}

// ─── Signal history — 基于真实历史数据回溯 ───

function generateSignalHistory(klines: KLineData[], indicators: TechnicalIndicators): SignalRecord[] {
  const history: SignalRecord[] = [];
  const strategies = ['趋势跟踪', '均值回归', '突破交易', '因子选股', '波段操作'];
  let totalChecked = 0;
  let correctCount = 0;

  // 从后往前遍历，每隔5日检查一次信号
  for (let i = klines.length - 5; i >= 20 && history.length < 8; i -= 5) {
    const k = klines[i];
    const macdHistVal = indicators.macdHist[i];
    const macdDIFVal = indicators.macdDIF[i];
    const macdDEAVal = indicators.macdDEA[i];
    const kdjKVal = indicators.kdjK[i];
    const kdjDVal = indicators.kdjD[i];
    const rsi6Val = indicators.rsi6[i];
    const ma5Val = indicators.ma5[i];
    const ma20Val = indicators.ma20[i];

    let type: SignalRecord['type'] = '观望';
    const triggers: string[] = [];

    if (!isNaN(macdDIFVal) && !isNaN(macdDEAVal) && macdDIFVal > macdDEAVal && macdHistVal > 0) {
      triggers.push('MACD金叉，动能转正');
    }
    if (!isNaN(kdjKVal) && !isNaN(kdjDVal) && kdjKVal > kdjDVal) {
      triggers.push('KDJ金叉， momentum 向上');
    }
    if (!isNaN(rsi6Val) && rsi6Val < 30) {
      triggers.push(`RSI超卖(${rsi6Val.toFixed(1)})，反弹概率高`);
    }
    if (!isNaN(ma5Val) && !isNaN(ma20Val) && k.close > ma5Val && ma5Val > ma20Val) {
      triggers.push('均线多头排列');
    }

    if (triggers.length >= 2) {
      type = '买入';
    } else {
      const sellTriggers: string[] = [];
      if (!isNaN(macdDIFVal) && !isNaN(macdDEAVal) && macdDIFVal < macdDEAVal && macdHistVal < 0) {
        sellTriggers.push('MACD死叉，动能转负');
      }
      if (!isNaN(kdjKVal) && !isNaN(kdjDVal) && kdjKVal < kdjDVal) {
        sellTriggers.push('KDJ死叉， momentum 向下');
      }
      if (!isNaN(rsi6Val) && rsi6Val > 70) {
        sellTriggers.push(`RSI超买(${rsi6Val.toFixed(1)})，回调风险高`);
      }
      if (sellTriggers.length >= 2) {
        type = '卖出';
        triggers.length = 0;
        triggers.push(...sellTriggers);
      } else if (triggers.length === 1) {
        type = '观望';
      } else {
        continue;
      }
    }

    // 验证：看5天后价格变化
    const verifyIdx = Math.min(i + 5, klines.length - 1);
    const verifyPrice = klines[verifyIdx].close;
    const priceChange = ((verifyPrice - k.close) / k.close) * 100;
    let returnPercent: number | null = null;
    let verificationResult: SignalRecord['verificationResult'] = '待验证';

    if (type === '买入') {
      returnPercent = Math.round(priceChange * 100) / 100;
      verificationResult = priceChange > 1 ? '有效' : priceChange < -1 ? '无效' : '待验证';
    } else if (type === '卖出') {
      returnPercent = Math.round(-priceChange * 100) / 100;
      verificationResult = priceChange < -1 ? '有效' : priceChange > 1 ? '无效' : '待验证';
    }

    totalChecked++;
    if (verificationResult === '有效') correctCount++;

    const date = k.date.length === 5 ? `2025-${k.date}` : k.date;
    history.push({
      id: `sig_${k.date}_${i}`,
      type,
      strength: Math.min(5, Math.max(1, triggers.length)),
      triggers: triggers.slice(0, 3),
      priceAtSignal: Math.round(k.close * 100) / 100,
      timestamp: date,
      strategy: strategies[i % strategies.length],
      verified: verificationResult !== '待验证',
      verificationResult,
      verifyPrice: verificationResult !== '待验证' ? Math.round(verifyPrice * 100) / 100 : null,
      returnPercent,
      accuracyStats: totalChecked > 0 ? { total: totalChecked, correct: correctCount } : null,
    });
  }

  return history.reverse();
}

// ─── Strategy matching — 基于真实指标评分 ───

function calculateMatchedStrategy(
  klines: KLineData[],
  indicators: TechnicalIndicators,
  pe: number,
  changePercent: number
): { name: string; score: number } | null {
  if (klines.length < 20) return null;

  // 计算波动率（20日）
  const returns: number[] = [];
  for (let i = klines.length - 19; i < klines.length; i++) {
    returns.push((klines[i].close - klines[i - 1].close) / klines[i - 1].close * 100);
  }
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const volatility = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length);

  // 计算动量（基于RSI）
  const lastRsi = indicators.rsi6[indicators.rsi6.length - 1];
  const momentum = isNaN(lastRsi) ? 50 : lastRsi;

  // quickEstimateMatch 逻辑内联
  const scores: Record<string, number> = { trend: 50, revert: 50, breakout: 50, factor: 50 };
  if (volatility > 25) { scores.breakout += 15; scores.trend += 10; scores.revert -= 5; }
  else if (volatility < 15) { scores.factor += 15; scores.revert += 10; }
  if (momentum > 60) { scores.trend += 20; scores.breakout += 10; }
  else if (momentum < 40) { scores.revert += 15; scores.factor += 10; }
  if (pe > 0 && pe < 15) { scores.factor += 15; }
  else if (pe > 40) { scores.trend += 10; scores.breakout += 10; }
  if (Math.abs(changePercent) > 3) { scores.revert += 15; }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const maxScore = sorted[0][1];
  const minScore = sorted[sorted.length - 1][1];
  const range = Math.max(maxScore - minScore, 10);
  const confidence = Math.min(100, Math.round(((maxScore - minScore) / range) * 100));

  if (confidence < 15) return null;

  const nameMap: Record<string, string> = {
    trend: '趋势跟踪', revert: '均值回归', breakout: '突破交易', factor: '因子选股',
  };
  return { name: nameMap[sorted[0][0]] || '波段操作', score: confidence };
}

// ─── Trading time check ───

export function isTradingTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;

  // Morning session: 9:30-11:30, Afternoon session: 13:00-15:00 (Beijing time)
  return (time >= 570 && time <= 690) || (time >= 780 && time <= 900);
}

export function getNextRefreshText(): string {
  if (isTradingTime()) {
    return '5分钟后自动刷新';
  }
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;

  if (time < 570) {
    const wait = 570 - time;
    return `等待开盘(${Math.floor(wait / 60)}小时${wait % 60}分)`;
  }
  return '非交易时间';
}

// ─── Main fetch function ───

export async function fetchMonitorData(
  code: string,
  _strategyName?: string,
  _strategyScore?: number
): Promise<MonitorData | null> {
  // 1. Get stock info (real-time from Tencent API)
  const stock = await queryStock(code);
  if (!stock) return null;

  // 2. Fetch REAL historical K-lines from Tencent API
  let kline: KLineData[];
  const today = new Date();
  const endStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const start = new Date(today.getTime() - 365 * 86400000); // ~1 year for indicator warmup
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const realKlines = await fetchHistoricalKLines(code, startStr, endStr);
  if (realKlines && realKlines.length >= 30) {
    kline = realKlines;
  } else {
    // 真实API返回空，无法获取数据
    console.warn(`[${code}] 无法获取历史K线数据`);
    return null;
  }

  // 3. Calculate indicators from REAL K-line data
  const indicators = generateIndicators(kline);

  // 4. Generate signals from REAL indicators
  const signals = generateSignals(kline, indicators);

  // 5. Calculate strength score from REAL indicators
  const strength = calculateStrengthScore(kline, indicators);

  // 6. Match strategy from REAL data (inline, no circular dependency)
  const matchedStrategy = calculateMatchedStrategy(kline, indicators, stock.pe, stock.change);

  // 7. Signal history backtested from REAL data
  const signalHistory = generateSignalHistory(kline, indicators);

  return {
    stock,
    kline,
    indicators,
    signals,
    strength,
    matchedStrategy,
    signalHistory,
  };
}

/**
 * 通过东方财富搜索API获取股票名称
 * 用于腾讯API返回名称乱码时的备用方案
 */
export async function fetchStockNameFromEastMoney(code: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://searchapi.eastmoney.com/api/suggest/get?input=${code}&type=14&count=1`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.QuotationCodeTable?.Data;
    if (Array.isArray(data) && data.length > 0 && data[0].Code === code) {
      return data[0].Name || null;
    }
  } catch {
    // 静默失败
  }
  return null;
}

// ═══════════════════════════════════════════════════
// Real Backtest Types
// ═══════════════════════════════════════════════════

export interface EquityPoint {
  date: string;
  value: number;
}

export interface BacktestTrade {
  date: string;
  type: '买入' | '卖出';
  price: number;
  plPct?: number;
}

export interface RealBacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  volatility: number;
  totalTrades: number;
  winningTrades: number;
  bestReturn: number;
  worstReturn: number;
  equityCurve: EquityPoint[];
  monthlyReturns: Record<string, number>;
  tradeDistribution: Record<string, number>;
  trades: BacktestTrade[];
  actualStart: string;
  actualEnd: string;
}

// ═══════════════════════════════════════════════════
// Historical K-line fetch (East Money API)
// ═══════════════════════════════════════════════════

export async function fetchHistoricalKLines(code: string, startDate: string, endDate: string): Promise<KLineData[]> {
  // 使用腾讯K线API（东方财富API在某些网络环境下不可用）
  const market = getTencentPrefix(code);
  const limit = 500; // 最多返回500条

  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${market}${code},day,${startDate},${endDate},${limit},qfq`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const dataKey = `${market}${code}`;
    // 科创板(688)/北交所股票可能只有day(不复权)没有qfqday(前复权)
    let dayArr = json?.data?.[dataKey]?.qfqday;
    if (!Array.isArray(dayArr) || dayArr.length === 0) {
      dayArr = json?.data?.[dataKey]?.day;
    }
    if (!Array.isArray(dayArr) || dayArr.length === 0) {
      throw new Error('No data');
    }

    return dayArr.map((item: string[]) => ({
      date: item[0],
      open: parseFloat(item[1]) || 0,
      close: parseFloat(item[2]) || 0,
      high: parseFloat(item[3]) || 0,
      low: parseFloat(item[4]) || 0,
      volume: parseFloat(item[5]) || 0,
    }));
  } catch {
    // 所有真实API失败，返回空数组（UI层显示无数据提示）
    console.warn(`[${code}] 历史K线获取失败`);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// Strategy implementations
// ═══════════════════════════════════════════════════

interface StrategyConfig {
  maFast: number;
  maSlow: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  bbPeriod: number;
  bbStd: number;
  stopLossPct: number;
  takeProfitPct: number;
  holdDays: number;
}

function getStrategyConfig(strategyKey: string, customParams?: { stopLoss: number; takeProfit: number; holdPeriod: number } | { selectedFactors: string[]; factorWeights: Record<string, number> }): StrategyConfig {
  const isRiskParams = customParams && 'stopLoss' in customParams;
  const defaults: StrategyConfig = {
    maFast: 5,
    maSlow: 20,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    bbPeriod: 20,
    bbStd: 2,
    stopLossPct: isRiskParams ? (customParams as { stopLoss: number }).stopLoss / 100 : 0.08,
    takeProfitPct: isRiskParams ? (customParams as { takeProfit: number }).takeProfit / 100 : 0.15,
    holdDays: isRiskParams ? (customParams as { holdPeriod: number }).holdPeriod || 20 : 20,
  };

  switch (strategyKey) {
    case 'trend':
      return { ...defaults, maFast: 5, maSlow: 20, stopLossPct: 0.1, takeProfitPct: 0.2 };
    case 'revert':
      return { ...defaults, rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, stopLossPct: 0.05, takeProfitPct: 0.1 };
    case 'breakout':
      return { ...defaults, bbPeriod: 20, bbStd: 2, stopLossPct: 0.08, takeProfitPct: 0.18 };
    case 'factor':
      return { ...defaults, maFast: 10, maSlow: 30, stopLossPct: 0.08, takeProfitPct: 0.15 };
    default:
      return defaults;
  }
}

function sma(data: number[], period: number): number[] {
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

function calcRSI(data: number[], period: number): number[] {
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

function calcBollinger(data: number[], period: number, stdDev: number): { upper: number[]; mid: number[]; lower: number[] } {
  const mid = sma(data, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      let sum = 0, sqSum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
        sqSum += data[i - j] * data[i - j];
      }
      const mean = sum / period;
      const std = Math.sqrt(sqSum / period - mean * mean);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }

  return { upper, mid, lower };
}

// ═══════════════════════════════════════════════════
// Backtest engine
// ═══════════════════════════════════════════════════

function runBacktestEngine(
  klines: KLineData[],
  strategyKey: string,
  capital: number,
  customParams?: { stopLoss: number; takeProfit: number; holdPeriod: number } | { selectedFactors: string[]; factorWeights: Record<string, number> }
): RealBacktestResult {
  const config = getStrategyConfig(strategyKey, customParams);
  const closes = klines.map((k) => k.close);
  const dates = klines.map((k) => k.date);

  // Calculate indicators
  const maFast = sma(closes, config.maFast);
  const maSlow = sma(closes, config.maSlow);
  const rsiValues = calcRSI(closes, config.rsiPeriod);
  const bb = calcBollinger(closes, config.bbPeriod, config.bbStd);

  const trades: BacktestTrade[] = [];
  let cash = capital;
  let position = 0;
  let entryPrice = 0;
  let entryDay = 0;
  const monthlyReturns: Record<string, number> = {};
  let monthStartValue = capital;
  let currentMonth = '';
  let winningTrades = 0;
  let bestReturn = -Infinity;
  let worstReturn = Infinity;

  for (let i = config.maSlow + 5; i < klines.length; i++) {
    const price = closes[i];
    const date = dates[i];
    const currentValue = cash + position * price;

    // Track monthly returns
    const month = date.substring(0, 7);
    if (month !== currentMonth) {
      if (currentMonth) {
        const monthlyReturn = ((currentValue - monthStartValue) / monthStartValue) * 100;
        monthlyReturns[currentMonth] = parseFloat(monthlyReturn.toFixed(2));
      }
      currentMonth = month;
      monthStartValue = currentValue;
    }

    // Check exit conditions if in position
    if (position > 0) {
      const plPct = (price - entryPrice) / entryPrice;
      const daysHeld = i - entryDay;

      let shouldSell = false;

      // Stop loss
      if (plPct <= -config.stopLossPct) {
        shouldSell = true;
      }
      // Take profit
      if (plPct >= config.takeProfitPct) {
        shouldSell = true;
      }
      // Max hold period
      if (daysHeld >= config.holdDays) {
        shouldSell = true;
      }

      // Strategy-specific exit signals
      if (!shouldSell) {
        switch (strategyKey) {
          case 'trend':
            if (!isNaN(maFast[i]) && !isNaN(maSlow[i]) && maFast[i] < maSlow[i]) {
              shouldSell = true;
            }
            break;
          case 'revert':
            if (!isNaN(rsiValues[i]) && rsiValues[i] > config.rsiOverbought) {
              shouldSell = true;
            }
            break;
          case 'breakout':
            if (!isNaN(bb.upper[i]) && price < bb.mid[i]) {
              shouldSell = true;
            }
            break;
          case 'factor':
            if (!isNaN(maFast[i]) && !isNaN(maSlow[i]) && maFast[i] < maSlow[i]) {
              shouldSell = true;
            }
            break;
        }
      }

      if (shouldSell) {
        cash += position * price;
        const tradePlPct = plPct * 100;
        trades.push({ date, type: '卖出', price, plPct: parseFloat(tradePlPct.toFixed(2)) });
        if (tradePlPct > 0) winningTrades++;
        bestReturn = Math.max(bestReturn, tradePlPct);
        worstReturn = Math.min(worstReturn, tradePlPct);
        position = 0;
        entryPrice = 0;
      }
    }

    // Check entry conditions if not in position
    if (position === 0 && i < klines.length - 1) {
      let shouldBuy = false;

      switch (strategyKey) {
        case 'trend':
          if (!isNaN(maFast[i]) && !isNaN(maSlow[i]) && maFast[i] > maSlow[i] && maFast[i - 1] <= maSlow[i - 1]) {
            shouldBuy = true;
          }
          break;
        case 'revert':
          if (!isNaN(rsiValues[i]) && rsiValues[i] < config.rsiOversold && rsiValues[i - 1] >= config.rsiOversold) {
            shouldBuy = true;
          }
          break;
        case 'breakout':
          if (!isNaN(bb.upper[i]) && price > bb.upper[i]) {
            shouldBuy = true;
          }
          break;
        case 'factor':
          if (!isNaN(maFast[i]) && !isNaN(maSlow[i]) && maFast[i] > maSlow[i] && !isNaN(rsiValues[i]) && rsiValues[i] > 40 && rsiValues[i] < 65) {
            shouldBuy = true;
          }
          break;
        default:
          // Default to trend-following
          if (!isNaN(maFast[i]) && !isNaN(maSlow[i]) && maFast[i] > maSlow[i]) {
            shouldBuy = true;
          }
      }

      if (shouldBuy) {
        entryPrice = price;
        entryDay = i;
        position = Math.floor(cash / price);
        cash -= position * price;
        trades.push({ date, type: '买入', price });
      }
    }
  }

  // Close position at end if still holding
  if (position > 0) {
    const lastPrice = closes[klines.length - 1];
    const lastDate = dates[klines.length - 1];
    cash += position * lastPrice;
    const plPct = ((lastPrice - entryPrice) / entryPrice) * 100;
    trades.push({ date: lastDate, type: '卖出', price: lastPrice, plPct: parseFloat(plPct.toFixed(2)) });
    if (plPct > 0) winningTrades++;
    bestReturn = Math.max(bestReturn, plPct);
    worstReturn = Math.min(worstReturn, plPct);
  }

  // Finalize last month return
  if (currentMonth) {
    const finalValue = cash + position * closes[closes.length - 1];
    const monthlyReturn = ((finalValue - monthStartValue) / monthStartValue) * 100;
    monthlyReturns[currentMonth] = parseFloat(monthlyReturn.toFixed(2));
  }

  // Calculate equity curve from trade history
  const finalEquityCurve: EquityPoint[] = [];
  let simCash = capital;
  let simShares = 0;
  let tradeIdx = 0;

  for (let i = config.maSlow + 5; i < klines.length; i++) {
    const price = closes[i];

    if (tradeIdx < trades.length && trades[tradeIdx].date === dates[i]) {
      const t = trades[tradeIdx];
      if (t.type === '买入') {
        simShares = Math.floor(simCash / price);
        simCash -= simShares * price;
      } else {
        simCash += simShares * price;
        simShares = 0;
      }
      tradeIdx++;
    }

    const currentValue = simCash + simShares * price;
    finalEquityCurve.push({ date: dates[i], value: Math.round(currentValue) });
  }

  const finalValue = finalEquityCurve.length > 0 ? finalEquityCurve[finalEquityCurve.length - 1].value : capital;
  const totalReturn = ((finalValue - capital) / capital) * 100;
  const totalDays = klines.length;
  const years = totalDays / 252;
  const annualizedReturn = years > 0 ? (Math.pow(finalValue / capital, 1 / years) - 1) * 100 : 0;

  // Calculate max drawdown
  let peak = capital;
  let maxDrawdown = 0;
  for (const point of finalEquityCurve) {
    if (point.value > peak) peak = point.value;
    const dd = (peak - point.value) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const maxDrawdownPct = -maxDrawdown * 100;

  // Calculate volatility (annualized)
  const dailyReturns: number[] = [];
  for (let i = 1; i < finalEquityCurve.length; i++) {
    dailyReturns.push((finalEquityCurve[i].value - finalEquityCurve[i - 1].value) / finalEquityCurve[i - 1].value);
  }
  const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  // Sharpe ratio (risk-free rate approx 2%)
  const riskFreeRate = 0.02;
  const sharpeRatio = volatility > 0 ? (annualizedReturn / 100 - riskFreeRate) / (volatility / 100) : 0;

  // Win rate
  const sellTrades = trades.filter((t) => t.type === '卖出');
  const totalTrades = sellTrades.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  // Trade distribution
  const distribution: Record<string, number> = {};
  for (const t of sellTrades) {
    const pct = t.plPct || 0;
    let range: string;
    if (pct >= 15) range = '盈利15%+';
    else if (pct >= 10) range = '盈利10-15%';
    else if (pct >= 5) range = '盈利5-10%';
    else if (pct >= 2) range = '盈利2-5%';
    else if (pct >= 0) range = '盈利0-2%';
    else if (pct >= -2) range = '亏损0-2%';
    else if (pct >= -5) range = '亏损2-5%';
    else if (pct >= -10) range = '亏损5-10%';
    else range = '亏损10%+';
    distribution[range] = (distribution[range] || 0) + 1;
  }

  // 空分布表示无交易发生，保留空对象

  const actualStart = dates[config.maSlow + 5] || dates[0];
  const actualEnd = dates[dates.length - 1];

  return {
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    annualizedReturn: parseFloat(annualizedReturn.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdownPct.toFixed(2)),
    winRate: parseFloat(winRate.toFixed(2)),
    volatility: parseFloat(volatility.toFixed(2)),
    totalTrades,
    winningTrades,
    bestReturn: parseFloat((bestReturn === -Infinity ? 0 : bestReturn).toFixed(2)),
    worstReturn: parseFloat((worstReturn === Infinity ? 0 : worstReturn).toFixed(2)),
    equityCurve: finalEquityCurve,
    monthlyReturns,
    tradeDistribution: distribution,
    trades,
    actualStart,
    actualEnd,
  };
}

// ═══════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════

export async function runRealBacktest(
  stockCode: string,
  strategyKey: string,
  startDate: string,
  endDate: string,
  capital: number,
  customParams?: { stopLoss: number; takeProfit: number; holdPeriod: number } | { selectedFactors: string[]; factorWeights: Record<string, number> }
): Promise<RealBacktestResult | null> {
  try {
    const klines = await fetchHistoricalKLines(stockCode, startDate, endDate);
    if (!klines || klines.length < 60) {
      console.warn('K线数据不足，无法运行回测');
      return null;
    }
    return runBacktestEngine(klines, strategyKey, capital, customParams);
  } catch (err) {
    console.warn('回测执行失败:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// Sector Data — 板块数据接口与模拟数据
// ═══════════════════════════════════════════════════

export interface SectorItem {
  name: string;
  code: string;
  changePercent: number;
  turnover: number;
  turnoverRate: number;
  marginBalance: number;
  marginChange: number;
  mainForceFlow: number;
  northFlow: number;
  leadingStock?: string;
  leadingChange?: number;
  stockCount: number;
  avgCorrelation?: number;
}

/** 内置板块代码与名称映射（财务数据通过API动态获取） */
export const BUILT_IN_SECTORS: Pick<SectorItem, 'name' | 'code' | 'leadingStock'>[] = [
  { name: '白酒', code: 'BK0896', leadingStock: '600519' },
  { name: '新能源', code: 'BK0493', leadingStock: '300750' },
  { name: '半导体', code: 'BK0539', leadingStock: '688981' },
  { name: '银行', code: 'BK0475', leadingStock: '600036' },
  { name: '医药', code: 'BK0727', leadingStock: '600276' },
  { name: '汽车', code: 'BK0735', leadingStock: '002594' },
  { name: '通信', code: 'BK0736', leadingStock: '000063' },
  { name: '券商', code: 'BK0473', leadingStock: '600030' },
  { name: '家电', code: 'BK0455', leadingStock: '000333' },
  { name: '保险', code: 'BK0474', leadingStock: '601318' },
];

/**
 * @deprecated 仅用于测试，使用确定性hash生成伪稳定板块数据（非真实数据）
 * 请使用 `fetchSectorData()` 获取真实板块数据
 */
export function generateSectorData(baseSectors: Pick<SectorItem, 'name' | 'code' | 'leadingStock'>[] = BUILT_IN_SECTORS): SectorItem[] {
  // 基于板块名称的确定性hash生成伪稳定数据（无随机性）
  const hash = (str: string): number => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
    }
    return h / 4294967296;
  };

  return baseSectors.map((s) => {
    const h = hash(s.name);
    const changePercent = parseFloat(((h - 0.5) * 4).toFixed(2));
    return {
      name: s.name,
      code: s.code,
      changePercent,
      turnover: 0,
      turnoverRate: 0,
      marginBalance: 0,
      marginChange: 0,
      mainForceFlow: 0,
      northFlow: 0,
      leadingStock: s.leadingStock,
      leadingChange: changePercent,
      stockCount: 0,
      avgCorrelation: 0,
    };
  });
}

/** 分时数据点 */
export interface IntradayPoint {
  time: string;      // "09:30"
  price: number;     // 最新价
  avg: number;       // 均价
  volume: number;    // 成交量
  amount: number;    // 成交额
}

/** 从东方财富获取当日真实分时数据 */
export async function fetchIntradayTrends(code: string): Promise<IntradayPoint[] | null> {
  try {
    const prefix = getEastMoneySecId(code);
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${prefix}.${code}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ut=fa5fd1943c7b386f172d6893dbfba10b&ndays=1&iscr=0`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data?.trends) return null;
    const points: IntradayPoint[] = [];
    for (const item of json.data.trends) {
      const parts = item.split(',');
      if (parts.length < 8) continue;
      // parts: [0]=时间"15:01", [1]=开盘, [2]=收盘/最新价, [3]=最高, [4]=最低, [5]=成交量, [6]=成交额, [7]=均价
      points.push({
        time: parts[0],
        price: parseFloat(parts[2]) || 0,
        avg: parseFloat(parts[7]) || 0,
        volume: parseFloat(parts[5]) || 0,
        amount: parseFloat(parts[6]) || 0,
      });
    }
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════
// North Bound Flow — 北向资金（沪深港通）盘后数据
// ═══════════════════════════════════════════════════

/** 北向资金单日数据 */
export interface NorthBoundFlowItem {
  date: string;           // 交易日期 "YYYY-MM-DD"
  shNetInflow: number;    // 沪股通净流入（亿元）
  szNetInflow: number;    // 深股通净流入（亿元）
  totalNetInflow: number; // 合计净流入（亿元）
}

/** 北向资金数据结果 */
export interface NorthBoundFlowResult {
  data: NorthBoundFlowItem[];     // 历史数据列表
  latestDate: string;             // 最新数据日期
  isIntraday: boolean;            // 是否为盘中实时数据（false=盘后）
  note: string;                   // 数据说明
}

const NORTH_FLOW_CACHE_KEY = 'north_bound_flow_cache';
const NORTH_FLOW_CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * 获取北向资金历史数据（沪深港通）
 *
 * 注意：港交所2024年4月起停止盘中实时披露，此为**盘后数据**。
 * - 盘中调用：返回上一交易日数据（缓存），标注 "收盘后更新"
 * - 盘后调用：返回当日收盘数据
 *
 * 数据源：东方财富数据中心 RPT_MUTUAL_DEAL_HISTORY
 * @param days 获取天数（默认1，即最近1个交易日）
 * @returns 北向资金数据或null（API失败时）
 */
export async function fetchNorthBoundFlow(days = 1): Promise<NorthBoundFlowResult | null> {
  // 1. 检查缓存（用于盘中时段减少API调用）
  const cached = localStorage.getItem(NORTH_FLOW_CACHE_KEY);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      // 缓存有效期内直接返回
      if (age < NORTH_FLOW_CACHE_TTL) {
        return data as NorthBoundFlowResult;
      }
    } catch { /* ignore parse error */ }
  }

  try {
    // 2. 调用东方财富数据中心API
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=TRADE_DATE&sortTypes=-1&pageSize=${days}&reportName=RPT_MUTUAL_DEAL_HISTORY`;

    const res = await fetch(url, { headers: { 'Referer': 'https://data.eastmoney.com/' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const rawItems = json?.result?.data || json?.data || [];

    if (!rawItems || rawItems.length === 0) {
      console.warn('[NorthBoundFlow] API返回空数据');
      return null;
    }

    // 3. 解析数据
    const data: NorthBoundFlowItem[] = rawItems.map((item: Record<string, unknown>) => {
      // 字段映射：TRADE_DATE=日期, NET_INFLOW=沪股通净流入, NET_DEAL_AMT=深股通（看实际字段名调整）
      const date = (item['TRADE_DATE'] as string) || '';
      // 沪股通净流入（元→亿元）
      const shNetInflow = safeNum(item['NET_INFLOW']) / 1e8;
      // 深股通净流入（元→亿元）— 字段名可能不同，做fallback
      const szNetInflow = safeNum(item['NET_DEAL_AMT'] || item['NET_INFLOW_SZ'] || 0) / 1e8;
      // 合计净流入
      const totalNetInflow = shNetInflow + szNetInflow;

      return {
        date,
        shNetInflow: Math.round(shNetInflow * 100) / 100,
        szNetInflow: Math.round(szNetInflow * 100) / 100,
        totalNetInflow: Math.round(totalNetInflow * 100) / 100,
      };
    });

    const latestDate = data[0]?.date || '';

    // 4. 判断数据时效性
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isTradingHours = now.getHours() >= 9 && now.getHours() < 15;
    const isLatestToday = latestDate === todayStr;

    const result: NorthBoundFlowResult = {
      data,
      latestDate,
      isIntraday: false, // 北向资金已停止盘中实时披露，始终为false
      note: isLatestToday && !isTradingHours
        ? '收盘后数据（当日）'
        : isLatestToday && isTradingHours
          ? '盘中数据延迟披露，显示为最新可用数据'
          : `上一交易日数据（${latestDate}），盘中不实时披露`,
    };

    // 5. 写入缓存
    localStorage.setItem(NORTH_FLOW_CACHE_KEY, JSON.stringify({ data: result, timestamp: Date.now() }));
    return result;
  } catch (err) {
    console.error('[NorthBoundFlow] 获取失败:', err);
    // 失败时尝试返回过期缓存（降级）
    if (cached) {
      try {
        const { data } = JSON.parse(cached);
        console.warn('[NorthBoundFlow] API失败，返回过期缓存数据');
        return data as NorthBoundFlowResult;
      } catch { /* ignore */ }
    }
    return null;
  }
}

/** 获取板块数据（含缓存）
 *  调用东方财富真实板块API获取涨跌幅和主力资金数据
 */
export async function fetchSectorData(): Promise<SectorItem[]> {
  // 优先使用缓存（5分钟内）
  const cacheKey = 'sector_data_cache';
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached) as { data: SectorItem[]; timestamp: number };
      if (Date.now() - timestamp < 5 * 60 * 1000) return data;
    } catch { /* ignore */ }
  }

  // 调用东方财富板块API获取真实数据
  try {
    const res = await fetch(
      'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f14,f3,f62',
      { headers: { 'Referer': 'https://data.eastmoney.com/' } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const diff = json.data?.diff || [];

    // 构建板块名称到数据的映射
    const apiDataMap = new Map<string, { changePercent: number; mainForceFlow: number }>();
    for (const item of diff) {
      const rawName: string = item.f14 || '';
      const changePercent = safeNum(item.f3);
      const mainForceFlow = safeNum(item.f62) / 100000000; // 元→亿元
      // 尝试匹配标准名称
      const standardName = resolveStandardSectorName(rawName);
      const key = standardName || rawName;
      apiDataMap.set(key, { changePercent, mainForceFlow });
    }

    const sectors: SectorItem[] = BUILT_IN_SECTORS.map((base) => {
      const apiData = apiDataMap.get(base.name);
      return {
        name: base.name,
        code: base.code,
        changePercent: apiData?.changePercent ?? 0,
        turnover: 0,      // 需要单独API获取
        turnoverRate: 0,
        marginBalance: 0,
        marginChange: 0,
        mainForceFlow: apiData?.mainForceFlow ?? 0,
        northFlow: 0,     // 需要单独API获取
        leadingStock: base.leadingStock,
        leadingChange: apiData?.changePercent ?? 0,
        stockCount: 0,
        avgCorrelation: 0,
      };
    });

    // 写入缓存
    localStorage.setItem(cacheKey, JSON.stringify({ data: sectors, timestamp: Date.now() }));
    return sectors;
  } catch (err) {
    console.warn('[fetchSectorData] 获取真实板块数据失败:', err);
    // 失败时返回基于hash的确定性数据（无随机性）
    return generateSectorData();
  }
}
