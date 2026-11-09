// 관리자 앱 뿌리 파일, 세션 상태에 따라 로그인 · 권한 없음 · 화면 틀(영역 경로들) 중 하나를 그림
// main.jsx가 BrowserRouter로 감싼 AdminApp을 씀, 시험은 AdminScreens를 MemoryRouter로 감쌈
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import AdminLayout from '@/admin/app/AdminLayout'
import { adminDetailRoutes, adminRoutes, HOME_PATH } from '@/admin/app/adminRoutes'
import { useAdminSession } from '@/admin/domains/auth/hooks/useAdminSession'
import LoginPage from '@/admin/domains/auth/pages/LoginPage'
import NoAccessPage from '@/admin/domains/auth/pages/NoAccessPage'
import StatusNote from '@/admin/shared/ui/StatusNote'

const BLOCKED_STATES = new Set(['noAccess', 'off', 'unavailable'])

// 로그인 뒤 갈 곳: 같은 사이트 안 주소만 (예: '/members?q=가면' 됨, '//남의.사이트' · 'https://…' 안 됨)
const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : HOME_PATH)

// 로그인 안 됨 → 지금 주소를 next에 실어 로그인 화면으로
function ToLogin() {
  const location = useLocation()
  const next = `${location.pathname}${location.search}`
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
}

function LoginRoute({ session }) {
  const [params] = useSearchParams()
  if (session.state === 'in') return <Navigate to={safeNext(params.get('next'))} replace />
  return <LoginPage onLogin={session.login} notice={session.lostCode} />
}

function NotFound() {
  return <StatusNote state="empty">없는 화면이에요. 왼쪽(휴대폰은 위) 메뉴에서 골라 주세요.</StatusNote>
}

export function AdminScreens() {
  const session = useAdminSession()

  if (session.state === 'loading') {
    return <main className="min-h-dvh bg-page px-4 text-ink"><StatusNote state="loading">로그인 상태를 확인하는 중…</StatusNote></main>
  }
  if (BLOCKED_STATES.has(session.state)) return <NoAccessPage reason={session.state} onRetry={session.retry} />
  if (session.state === 'error') {
    return <main className="min-h-dvh bg-page px-4 py-6 text-ink"><StatusNote state="error" error={session.error} onRetry={session.retry} /></main>
  }

  const signedIn = session.state === 'in'
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute session={session} />} />
      <Route element={signedIn ? <AdminLayout admin={session.admin} onLogout={session.logout} /> : <ToLogin />}>
        <Route index element={<Navigate to={HOME_PATH} replace />} />
        {adminRoutes.map(({ path, page: Page }) => <Route key={path} path={`${path}/*`} element={<Page />} />)}
        {adminDetailRoutes.map(({ path, page: Page }) => <Route key={path} path={path} element={<Page />} />)}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function AdminApp() {
  return (
    <BrowserRouter>
      <AdminScreens />
    </BrowserRouter>
  )
}
