import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  Users,
  KeyRound,
  Copy,
  CheckCircle2,
  Trash2,
  ArrowLeft,
  Lock,
} from 'lucide-react';
import { isAdmin, generateInviteCode, getInviteCodes, getAllUsers, deleteUser, type InviteCode, type StoredUser } from '@/services/authSecurity';

export default function Admin() {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [copied, setCopied] = useState('');
  const [activeTab, setActiveTab] = useState<'codes' | 'users'>('codes');

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/login');
      return;
    }
    loadData();
  }, [navigate]);

  const loadData = useCallback(() => {
    setCodes(getInviteCodes());
    setUsers(getAllUsers());
  }, []);

  const handleGenerateCode = () => {
    generateInviteCode('admin');
    loadData();
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleDeleteUser = (username: string) => {
    if (username === 'admin') { alert('不能删除管理员账户'); return; }
    if (confirm(`确定删除用户 ${username}？`)) {
      deleteUser(username);
      loadData();
    }
  };

  const unusedCodes = codes.filter((c) => !c.used);
  const usedCodes = codes.filter((c) => c.used);

  return (
    <div className="min-h-[100dvh] pt-16">
      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-apex-green" />
            <h1 className="font-heading text-2xl text-pure">管理控制台</h1>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 border border-[rgba(206,209,213,0.12)] rounded font-mono text-sm text-ash/60 hover:text-pure hover:border-apex-green/40 transition-all"
          >
            <ArrowLeft size={14} />返回
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="data-card p-4">
            <div className="font-mono text-[10px] text-ash/40 mb-1">总用户</div>
            <div className="font-heading text-2xl text-pure">{users.length}</div>
          </div>
          <div className="data-card p-4">
            <div className="font-mono text-[10px] text-ash/40 mb-1">未使用邀请码</div>
            <div className="font-heading text-2xl text-apex-green">{unusedCodes.length}</div>
          </div>
          <div className="data-card p-4">
            <div className="font-mono text-[10px] text-ash/40 mb-1">已使用邀请码</div>
            <div className="font-heading text-2xl text-gold-standard">{usedCodes.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-[rgba(206,209,213,0.1)]">
          <button
            onClick={() => setActiveTab('codes')}
            className={`px-4 py-2 font-mono text-sm font-medium transition-all ${activeTab === 'codes' ? 'text-apex-green border-b-2 border-apex-green' : 'text-ash/50 hover:text-ash'}`}
          >
            <KeyRound size={14} className="inline mr-1.5" />邀请码管理
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 font-mono text-sm font-medium transition-all ${activeTab === 'users' ? 'text-apex-green border-b-2 border-apex-green' : 'text-ash/50 hover:text-ash'}`}
          >
            <Users size={14} className="inline mr-1.5" />用户管理
          </button>
        </div>

        {activeTab === 'codes' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-base text-pure">邀请码列表</h3>
              <button
                onClick={handleGenerateCode}
                className="flex items-center gap-2 px-4 py-2 bg-gold-standard text-void font-mono text-sm font-bold rounded hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all"
              >
                <KeyRound size={14} />生成新邀请码
              </button>
            </div>

            {codes.length === 0 ? (
              <div className="data-card py-12 text-center">
                <KeyRound size={32} className="mx-auto mb-3 text-ash/20" />
                <p className="font-mono text-[12px] text-ash/40">暂无邀请码，点击上方按钮生成</p>
              </div>
            ) : (
              <div className="space-y-2">
                {codes.map((c) => (
                  <div key={c.code} className={`data-card p-4 flex items-center justify-between ${c.used ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-lg tracking-widest text-pure">{c.code}</span>
                      <span className={`font-mono text-[10px] px-2 py-0.5 ${c.used ? 'bg-reversion-red/10 text-reversion-red' : 'bg-apex-green/10 text-apex-green'}`}>
                        {c.used ? '已使用' : '未使用'}
                      </span>
                      {c.usedBy && <span className="font-mono text-[10px] text-ash/40">使用者: {c.usedBy}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-ash/30">{new Date(c.createdAt).toLocaleDateString()}</span>
                      {!c.used && (
                        <button
                          onClick={() => handleCopy(c.code)}
                          className="p-1.5 text-ash/40 hover:text-apex-green transition-colors"
                          title="复制"
                        >
                          {copied === c.code ? <CheckCircle2 size={14} className="text-apex-green" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="font-heading text-base text-pure mb-4">用户列表</h3>
            {users.length === 0 ? (
              <div className="data-card py-12 text-center">
                <Users size={32} className="mx-auto mb-3 text-ash/20" />
                <p className="font-mono text-[12px] text-ash/40">暂无用户</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.username} className="data-card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-pure">{u.username}</span>
                      {u.isAdmin && (
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-apex-green/10 text-apex-green flex items-center gap-1">
                          <Shield size={10} />管理员
                        </span>
                      )}
                      {u.forceChangePassword && (
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-[rgba(255,42,109,0.1)] text-reversion-red flex items-center gap-1">
                          <Lock size={10} />需改密
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-ash/30">{new Date(u.createdAt).toLocaleDateString()}</span>
                      {!u.isAdmin && (
                        <button
                          onClick={() => handleDeleteUser(u.username)}
                          className="p-1.5 text-ash/40 hover:text-reversion-red transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
