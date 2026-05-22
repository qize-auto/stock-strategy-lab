import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogIn,
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  login,
  register,
  changePassword,
  generateCaptcha,
  verifyCaptcha,
  isLoggedIn,
} from '@/services/authSecurity';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/';
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaText, setCaptchaText] = useState('');
  const [captchaImg, setCaptchaImg] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forceChange, setForceChange] = useState(false);
  const [sessionUser, setSessionUser] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const refreshCaptcha = useCallback(() => {
    const c = generateCaptcha();
    setCaptchaText(c.text);
    setCaptchaImg(c.image);
  }, []);

  useEffect(() => {
    if (isLoggedIn()) {
      navigate('/');
      return;
    }
    refreshCaptcha();
  }, [navigate, refreshCaptcha]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!captchaAnswer) { setError('请输入验证码'); return; }
    if (!verifyCaptcha(captchaAnswer, captchaText)) { setError('验证码错误'); refreshCaptcha(); setCaptchaAnswer(''); return; }
    setLoading(true);
    const result = await login(username, password);
    if (result.success) {
      if (result.forceChange) {
        setForceChange(true);
        setSessionUser(username);
      } else {
        window.location.href = from;
      }
    } else {
      setError(result.error || '登录失败');
      refreshCaptcha();
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('两次密码不一致'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }
    if (!inviteCode) { setError('请输入邀请码'); return; }
    if (!captchaAnswer) { setError('请输入验证码'); return; }
    if (!verifyCaptcha(captchaAnswer, captchaText)) { setError('验证码错误'); refreshCaptcha(); setCaptchaAnswer(''); return; }
    setLoading(true);
    const result = await register(username, password, inviteCode);
    if (result.success) {
      setTab('login');
      setError('');
      setPassword('');
      setConfirmPassword('');
      setInviteCode('');
      alert('注册成功，请登录');
    } else {
      setError(result.error || '注册失败');
      refreshCaptcha();
    }
    setLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('新密码至少6位'); return; }
    setLoading(true);
    const result = await changePassword(sessionUser, oldPassword, newPassword);
    if (result.success) {
      window.location.href = from;
    } else {
      setError(result.error || '修改失败');
    }
    setLoading(false);
  };

  if (forceChange) {
    return (
      <div className="min-h-[100dvh] pt-16 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 border border-[rgba(255,42,109,0.3)] bg-[rgba(11,12,16,0.8)]"
        >
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle size={18} className="text-reversion-red" />
            <h2 className="font-heading text-lg text-pure">首次登录强制改密码</h2>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block font-mono text-[11px] text-ash/50 mb-1.5">原密码</label>
              <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full px-4 py-3 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50" required />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-ash/50 mb-1.5">新密码</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50" required />
            </div>
            {error && <p className="font-mono text-[11px] text-reversion-red">{error}</p>}
            <button type="submit" disabled={loading} className="w-full px-4 py-3 bg-apex-green text-void font-mono text-sm font-bold rounded hover:shadow-[0_0_20px_rgba(0,255,148,0.3)] transition-all disabled:opacity-50">
              {loading ? '处理中...' : '确认修改'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pt-16 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Tab Switcher */}
        <div className="flex mb-6 border-b border-[rgba(206,209,213,0.1)]">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-3 font-mono text-sm font-medium transition-all ${tab === 'login' ? 'text-apex-green border-b-2 border-apex-green' : 'text-ash/50 hover:text-ash'}`}
          >
            <LogIn size={14} className="inline mr-2" />登录
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-3 font-mono text-sm font-medium transition-all ${tab === 'register' ? 'text-gold-standard border-b-2 border-gold-standard' : 'text-ash/50 hover:text-ash'}`}
          >
            <UserPlus size={14} className="inline mr-2" />注册
          </button>
        </div>

        <div className="p-8 border border-[rgba(206,209,213,0.12)] bg-[rgba(11,12,16,0.8)]">
          {/* Title */}
          <div className="flex items-center gap-2 mb-6">
            {tab === 'login' ? <Shield size={18} className="text-apex-green" /> : <KeyRound size={18} className="text-gold-standard" />}
            <h2 className="font-heading text-lg text-pure">{tab === 'login' ? '用户登录' : '新用户注册'}</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 border border-[rgba(255,42,109,0.2)] bg-[rgba(255,42,109,0.05)]">
              <p className="font-mono text-[11px] text-reversion-red">{error}</p>
            </div>
          )}

          <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="space-y-4">
            <div>
              <label className="block font-mono text-[11px] text-ash/50 mb-1.5">用户名</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-3 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50" required autoComplete="username" />
            </div>

            <div>
              <label className="block font-mono text-[11px] text-ash/50 mb-1.5">密码</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 pr-10 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50" required autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ash/40 hover:text-ash">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <>
                <div>
                  <label className="block font-mono text-[11px] text-ash/50 mb-1.5">确认密码</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50" required />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-ash/50 mb-1.5">
                    <KeyRound size={10} className="inline mr-1" />邀请码
                    <span className="text-ash/30 ml-1">(需管理员生成)</span>
                  </label>
                  <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="输入8位邀请码" className="w-full px-4 py-3 bg-deep-space/80 border border-[rgba(212,175,55,0.2)] rounded font-mono text-sm text-pure outline-none focus:border-gold-standard/50 uppercase tracking-widest" required maxLength={8} />
                </div>
              </>
            )}

            {/* Captcha */}
            <div>
              <label className="block font-mono text-[11px] text-ash/50 mb-1.5">验证码</label>
              <div className="flex items-center gap-3">
                <input type="text" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value.toUpperCase())} placeholder="输入验证码" maxLength={4} className="flex-1 px-4 py-3 bg-deep-space/80 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-pure outline-none focus:border-apex-green/50 uppercase tracking-widest" required />
                <button type="button" onClick={refreshCaptcha} className="shrink-0 border border-[rgba(206,209,213,0.15)] rounded overflow-hidden hover:border-apex-green/40 transition-colors">
                  {captchaImg ? <img src={captchaImg} alt="captcha" className="w-[100px] h-[36px]" /> : <div className="w-[100px] h-[36px] bg-deep-space flex items-center justify-center"><RefreshCw size={14} className="text-ash/40" /></div>}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className={`w-full px-4 py-3 font-mono text-sm font-bold rounded transition-all disabled:opacity-50 ${tab === 'login' ? 'bg-apex-green text-void hover:shadow-[0_0_20px_rgba(0,255,148,0.3)]' : 'bg-gold-standard text-void hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]'}`}>
              {loading ? '处理中...' : tab === 'login' ? '登录' : '注册'}
            </button>
          </form>

          {tab === 'login' && (
            <p className="mt-4 font-mono text-[10px] text-ash/30 text-center">
              管理员初始密码: A83967251a
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
