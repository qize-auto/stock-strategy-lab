import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

/**
 * 路由守卫：未登录用户重定向到登录页
 * 用法：<RequireAuth><StrategyLab /></RequireAuth>
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loggedIn } = useApp();
  const location = useLocation();

  if (!loggedIn) {
    // 未登录 → 跳转到登录页，并记录redirect路径
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
