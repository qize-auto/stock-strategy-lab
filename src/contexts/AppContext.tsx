import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

/* ──────────────────────── Types ──────────────────────── */

export interface StrategyParam {
  name: string;
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
}

export interface StrategyElement {
  id: string;
  type: 'entry' | 'exit' | 'filter' | 'risk' | 'position';
  name: string;
  description: string;
  params?: StrategyParam[];
  logic?: 'or' | 'and';
}

export interface CustomStrategy {
  id: string;
  name: string;
  description: string;
  elements: StrategyElement[];
  backtestScore: number;
  backtestReturn: number;
  createdAt: string;
  isSystem: boolean;
}

export interface StrategyCombo {
  id: string;
  name: string;
  description: string;
  elements: StrategyElement[];
}

interface User {
  name: string;
  email: string;
}

interface AppState {
  strategies: CustomStrategy[];
  customStrategies: CustomStrategy[];
  refreshStrategies: () => void;
  addStrategy: (strategy: CustomStrategy) => void;
  removeStrategy: (id: string) => void;
  loggedIn: boolean;
  user: User | null;
  admin: boolean;
  logout: () => void;
}

/* ──────────────────────── Storage helpers ──────────────────────── */

const STORAGE_KEY = 'quant_lab_strategies';

function loadStrategies(): CustomStrategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CustomStrategy[];
  } catch { /* ignore */ }
  return getDefaultStrategies();
}

function saveStrategies(list: CustomStrategy[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function getDefaultStrategies(): CustomStrategy[] {
  return [
    {
      id: 'sys_ma_cross',
      name: '均线金叉策略',
      description: '5日均线上穿10日均线买入，下穿卖出。经典趋势跟踪策略。',
      elements: [
        { id: 'ma_cross', type: 'entry', name: '均线金叉', description: '5日均线上穿10日均线' },
        { id: 'ma_death', type: 'exit', name: '均线死叉', description: '5日均线下穿10日均线' },
        { id: 'fixed_stop', type: 'risk', name: '固定止损', description: '亏损3%止损', params: [{ name: 'stopPct', value: 3, min: 1, max: 10, step: 0.5 }] },
      ],
      backtestScore: 62.5,
      backtestReturn: 15.2,
      createdAt: new Date().toISOString(),
      isSystem: true,
    },
    {
      id: 'sys_macd',
      name: 'MACD动能策略',
      description: 'MACD柱状线由负转正买入，由正转负卖出。捕捉动能转换。',
      elements: [
        { id: 'macd_turn_pos', type: 'entry', name: 'MACD转正', description: 'MACD柱状线由负转正' },
        { id: 'macd_turn_neg', type: 'exit', name: 'MACD转负', description: 'MACD柱状线由正转负' },
        { id: 'trailing_stop', type: 'risk', name: '移动止损', description: '回撤2%止损', params: [{ name: 'trailPct', value: 2, min: 1, max: 5, step: 0.5 }] },
      ],
      backtestScore: 58.3,
      backtestReturn: 12.8,
      createdAt: new Date().toISOString(),
      isSystem: true,
    },
    {
      id: 'sys_kdj',
      name: 'KDJ超卖反弹',
      description: 'KDJ的K值低于20且上穿D值时买入，高于80且下穿D值时卖出。',
      elements: [
        { id: 'kdj_oversold', type: 'entry', name: 'KDJ超卖', description: 'K值低于20且上穿D值', params: [{ name: 'threshold', value: 20, min: 10, max: 40, step: 5 }] },
        { id: 'kdj_overbought', type: 'exit', name: 'KDJ超买', description: 'K值高于80且下穿D值', params: [{ name: 'threshold', value: 80, min: 60, max: 90, step: 5 }] },
        { id: 'fixed_stop', type: 'risk', name: '固定止损', description: '亏损3%止损', params: [{ name: 'stopPct', value: 3, min: 1, max: 10, step: 0.5 }] },
      ],
      backtestScore: 55.1,
      backtestReturn: 11.5,
      createdAt: new Date().toISOString(),
      isSystem: true,
    },
  ];
}

/* ──────────────────────── Context ──────────────────────── */

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [strategies, setStrategies] = useState<CustomStrategy[]>(loadStrategies);
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState(false);

  // Check login status on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        setLoggedIn(true);
        setUser(parsed);
        setAdmin(localStorage.getItem('auth_admin') === 'true');
      } catch { /* ignore */ }
    }
  }, []);

  const refreshStrategies = useCallback(() => {
    setStrategies(loadStrategies());
  }, []);

  const addStrategy = useCallback((strategy: CustomStrategy) => {
    setStrategies((prev) => {
      const exists = prev.some((s) => s.id === strategy.id);
      if (exists) return prev;
      const next = [...prev, strategy];
      saveStrategies(next);
      return next;
    });
  }, []);

  const removeStrategy = useCallback((id: string) => {
    setStrategies((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveStrategies(next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_admin');
    setLoggedIn(false);
    setUser(null);
    setAdmin(false);
    window.location.reload();
  }, []);

  // Filter non-system strategies as customStrategies
  const customStrategies = strategies.filter((s) => !s.isSystem);

  return (
    <AppContext.Provider value={{ strategies, customStrategies, refreshStrategies, addStrategy, removeStrategy, loggedIn, user, admin, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/* ──────────────────────── Helpers ──────────────────────── */

export function saveCustomStrategy(strategy: CustomStrategy) {
  const list = loadStrategies();
  const exists = list.some((s) => s.id === strategy.id);
  if (!exists) {
    list.push(strategy);
    saveStrategies(list);
  }
}

export function cloneElement(el: StrategyElement): StrategyElement {
  return {
    ...el,
    params: el.params?.map((p) => ({ ...p })),
  };
}
