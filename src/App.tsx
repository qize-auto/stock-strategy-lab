import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import { SkeletonPage } from './components/Skeleton'
import { AppProvider } from './contexts/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import RequireAuth from './components/RequireAuth'

// ─── Core Pages: eager load (most visited) ───
import Home from './pages/Home'
import TodayStrategy from './pages/TodayStrategy'
import Monitor from './pages/Monitor'
import Login from './pages/Login'

// ─── Secondary Pages: lazy load (code split) ───
const StrategyLab = lazy(() => import('./pages/StrategyLab'))
const Backtest = lazy(() => import('./pages/Backtest'))
const Matching = lazy(() => import('./pages/Matching'))
const Strategies = lazy(() => import('./pages/Strategies'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const StockProfile = lazy(() => import('./pages/StockProfile'))
const Admin = lazy(() => import('./pages/Admin'))

/** Lazy page wrapper with skeleton loading */
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<SkeletonPage />}>{children}</Suspense>
}

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/today" element={<TodayStrategy />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/login" element={<Login />} />

            {/* Lazy loaded secondary pages */}
            {/* /lab 需要登录 */}
            <Route path="/lab" element={<LazyPage><RequireAuth><StrategyLab /></RequireAuth></LazyPage>} />
            <Route path="/backtest" element={<LazyPage><Backtest /></LazyPage>} />
            <Route path="/match" element={<LazyPage><Matching /></LazyPage>} />
            <Route path="/strategies" element={<LazyPage><Strategies /></LazyPage>} />
            <Route path="/knowledge" element={<LazyPage><Knowledge /></LazyPage>} />
            <Route path="/stock" element={<LazyPage><StockProfile /></LazyPage>} />
            <Route path="/admin" element={<LazyPage><Admin /></LazyPage>} />

            {/* Legacy /evolution → redirect to /lab */}
            <Route path="/evolution" element={<Navigate to="/lab" replace />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </AppProvider>
  )
}
