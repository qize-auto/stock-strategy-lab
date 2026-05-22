import { Link } from 'react-router-dom';

const footerLinks = [
  { path: '/stock', label: '股票画像' },
  { path: '/strategies', label: '策略生态库' },
  { path: '/match', label: '智能匹配' },
  { path: '/backtest', label: '回测模拟' },
  { path: '/knowledge', label: '知识熔炉' },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-[rgba(206,209,213,0.1)] bg-void">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
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
            </div>
            <p className="text-caption text-ash/60 leading-relaxed">
              基于自适应市场假说的三维智能匹配引擎
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-widest text-pure mb-4">
              导航
            </h4>
            <div className="flex flex-col gap-2">
              {footerLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="text-caption text-ash/70 hover:text-apex-green transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-widest text-pure mb-4">
              免责声明
            </h4>
            <p className="text-caption text-ash/50 leading-relaxed">
              本系统提供的策略匹配结果仅供研究参考，不构成投资建议。过往表现不代表未来收益。投资有风险，决策需谨慎。
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-6 border-t border-[rgba(206,209,213,0.08)] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-caption text-ash/40">
            &copy; {new Date().getFullYear()} 股票策略智能匹配系统. All rights reserved.
          </p>
          <p className="font-mono text-[11px] text-ash/30 tracking-wider">
            POWERED BY AMH ENGINE v2.4.1
          </p>
        </div>
      </div>
    </footer>
  );
}
