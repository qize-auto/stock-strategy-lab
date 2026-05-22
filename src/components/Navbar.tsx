import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const navLinks = [
  { path: '/', label: '首页' },
  { path: '/today', label: '今日策略' },
  { path: '/monitor', label: '实时盯盘' },
  { path: '/strategies', label: '策略生态库' },
  { path: '/match', label: '智能匹配' },
  { path: '/backtest', label: '回测模拟' },
  { path: '/lab', label: '策略实验室' },
  { path: '/knowledge', label: '知识熔炉' },
];

const strategyColors: Record<string, string> = {
  '/': '',
  '/today': 'border-[#00FF94]',
  '/monitor': 'border-[#FF2A6D]',
  '/stock': 'border-[#D4AF37]',
  '/strategies': 'border-[#00FF94]',
  '/match': 'border-[#FF2A6D]',
  '/backtest': 'border-[#D4AF37]',
  '/lab': 'border-[#4A9EFF]',
  '/knowledge': 'border-[#CED1D5]',
  '/admin': 'border-[#FF2A6D]',
};

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { loggedIn, user, admin, logout } = useApp();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center transition-all duration-500 ease-expo-out"
      style={{
        backgroundColor: scrolled ? 'rgba(11, 12, 16, 0.85)' : 'transparent',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(206, 209, 213, 0.15)',
      }}
    >
      <div className="w-full px-6 lg:px-10 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-500 group-hover:rotate-180"
          >
            <path
              d="M14 2L26 14L14 26L2 14L14 2Z"
              stroke="#CED1D5"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M14 6L22 14L14 22L6 14L14 6Z"
              stroke="#00FF94"
              strokeWidth="1"
              fill="none"
              opacity="0.6"
            />
            <circle cx="14" cy="14" r="2" fill="#00FF94" opacity="0.8" />
          </svg>
          <span className="font-mono text-sm tracking-wider text-pure">
            STRATEGY<span className="text-apex-green">.MATCH</span>
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="relative font-mono text-[13px] tracking-wide text-ash hover:text-pure transition-colors duration-300 py-1 group"
            >
              {link.label}
              <span
                className={`absolute bottom-0 left-0 h-[2px] bg-apex-green transition-all duration-300 ease-expo-out ${
                  location.pathname === link.path ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
              {location.pathname === link.path && (
                <span className="absolute -right-2 top-0 w-1 h-1 rounded-full bg-apex-green" />
              )}
            </Link>
          ))}
        </div>

        {/* Desktop Auth Buttons */}
        <div className="hidden lg:flex items-center gap-4">
          {admin && (
            <Link
              to="/admin"
              className="relative font-mono text-[13px] tracking-wide text-reversion-red hover:text-pure transition-colors duration-300 py-1 group"
            >
              管理
              <span
                className={`absolute bottom-0 left-0 h-[2px] bg-reversion-red transition-all duration-300 ease-expo-out ${
                  location.pathname === '/admin' ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
            </Link>
          )}
          {loggedIn ? (
            <>
              <span className="font-mono text-[12px] text-ash/60">
                {user?.name || '用户'}
              </span>
              <button
                onClick={logout}
                className="font-mono text-[12px] text-ash/60 hover:text-reversion-red transition-colors duration-300"
              >
                退出
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="relative font-mono text-[13px] tracking-wide text-ash hover:text-pure transition-colors duration-300 py-1 group"
            >
              登录
              <span
                className={`absolute bottom-0 left-0 h-[2px] bg-apex-green transition-all duration-300 ease-expo-out ${
                  location.pathname === '/login' ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
            </Link>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden text-ash hover:text-pure transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="absolute top-16 left-0 right-0 z-40 lg:hidden"
          style={{
            backgroundColor: 'rgba(11, 12, 16, 0.95)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(206, 209, 213, 0.15)',
          }}
        >
          <div className="flex flex-col p-6 gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`font-mono text-sm text-ash hover:text-pure transition-colors py-2 border-l-2 pl-4 ${
                  location.pathname === link.path
                    ? strategyColors[link.path] || 'border-apex-green'
                    : 'border-transparent'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {/* Mobile Auth Links */}
            {admin && (
              <Link
                to="/admin"
                className={`font-mono text-sm text-reversion-red hover:text-pure transition-colors py-2 border-l-2 pl-4 ${
                  location.pathname === '/admin'
                    ? strategyColors['/admin']
                    : 'border-transparent'
                }`}
              >
                管理
              </Link>
            )}
            {loggedIn ? (
              <>
                <div className="flex items-center justify-between py-2 border-t border-[rgba(206,209,213,0.08)]">
                  <span className="font-mono text-[12px] text-ash/60">
                    {user?.name || '用户'}
                  </span>
                  <button
                    onClick={logout}
                    className="font-mono text-[12px] text-ash/60 hover:text-reversion-red transition-colors"
                  >
                    退出
                  </button>
                </div>
              </>
            ) : (
              <Link
                to="/login"
                className={`font-mono text-sm text-ash hover:text-pure transition-colors py-2 border-l-2 pl-4 ${
                  location.pathname === '/login'
                    ? 'border-apex-green'
                    : 'border-transparent'
                }`}
              >
                登录
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
