/**
 * Skeleton / Shimmer Loading Component
 * 统一的骨架屏加载占位组件
 */

import { motion } from 'framer-motion';

/** 基础骨架条 */
export function SkeletonBar({ width = '100%', height = '16px', className = '' }: { width?: string; height?: string; className?: string }) {
  return (
    <div
      className={`bg-[rgba(206,209,213,0.06)] rounded-sm overflow-hidden ${className}`}
      style={{ width, height }}
    >
      <motion.div
        className="h-full w-1/3"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(206,209,213,0.08), transparent)' }}
        animate={{ x: ['-100%', '300%'] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
      />
    </div>
  );
}

/** 卡片骨架屏 */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-[rgba(11,12,16,0.4)] border border-[rgba(206,209,213,0.08)] rounded-sm p-5 space-y-3">
      <SkeletonBar width="60%" height="18px" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar key={i} width={i === rows - 1 ? '40%' : '100%'} height="12px" />
      ))}
    </div>
  );
}

/** 指标骨架屏（4列网格） */
export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-[rgba(11,12,16,0.4)] border border-[rgba(206,209,213,0.08)] rounded-sm p-4 space-y-2">
          <SkeletonBar width="50%" height="10px" />
          <SkeletonBar width="70%" height="24px" />
        </div>
      ))}
    </div>
  );
}

/** 列表骨架屏 */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-[rgba(11,12,16,0.4)] border border-[rgba(206,209,213,0.08)] rounded-sm p-3 flex items-center gap-3">
          <SkeletonBar width="32px" height="32px" className="rounded-sm shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBar width="40%" height="14px" />
            <SkeletonBar width="70%" height="10px" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 全页面骨架屏 */
export function SkeletonPage() {
  return (
    <div className="min-h-[100dvh] bg-void pt-16 space-y-8 p-6">
      <SkeletonBar width="300px" height="32px" />
      <SkeletonMetrics count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={3} />
        </div>
        <div className="space-y-4">
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
        </div>
      </div>
    </div>
  );
}
