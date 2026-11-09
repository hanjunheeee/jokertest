// 관리자 메뉴·경로 표 파일, 줄 하나 = { path, label, page } (메뉴 순서 = 이 순서)
// AdminApp(경로)·AdminLayout(메뉴)이 씀, 영역 화면 파일은 각 단위가 채우고 이 표는 안 고침
import DashboardPage from '@/admin/domains/dashboard/pages/DashboardPage'
import MembersPage from '@/admin/domains/members/pages/MembersPage'
import MemberDetailPage from '@/admin/domains/members/pages/MemberDetailPage'
import AnnouncementsPage from '@/admin/domains/announcements/pages/AnnouncementsPage'
import AuditLogsPage from '@/admin/domains/auditLogs/pages/AuditLogsPage'
import ReportsPage from '@/admin/domains/reports/pages/ReportsPage'
import InquiriesPage from '@/admin/domains/inquiries/pages/InquiriesPage'
import MaintenancePage from '@/admin/domains/maintenance/pages/MaintenancePage'
import BannedWordsPage from '@/admin/domains/bannedWords/pages/BannedWordsPage'
import PaymentsPage from '@/admin/domains/payments/pages/PaymentsPage'
import ProductsPage from '@/admin/domains/products/pages/ProductsPage'
import CouponsPage from '@/admin/domains/coupons/pages/CouponsPage'
import StatsPage from '@/admin/domains/stats/pages/StatsPage'
import GamesPage from '@/admin/domains/games/pages/GamesPage'
import TermsPage from '@/admin/domains/terms/pages/TermsPage'
import LivePage from '@/admin/domains/live/pages/LivePage'

// 처음 여는 화면 (로그인 뒤 갈 곳이 없을 때)
export const HOME_PATH = '/dashboard'

// 영역 경로는 '<path>/*'로 붙음 → 영역 안 상세(예: /reports/12)는 그 영역 화면이 안에서 <Routes>로 나눔
export const adminRoutes = Object.freeze([
  { path: '/dashboard', label: '운영 현황', page: DashboardPage },
  { path: '/members', label: '회원', page: MembersPage },
  { path: '/announcements', label: '공지', page: AnnouncementsPage },
  { path: '/audit-logs', label: '처리 이력', page: AuditLogsPage },
  { path: '/reports', label: '신고', page: ReportsPage },
  { path: '/inquiries', label: '문의', page: InquiriesPage },
  { path: '/maintenance', label: '점검', page: MaintenancePage },
  { path: '/banned-words', label: '금지어', page: BannedWordsPage },
  { path: '/payments', label: '결제', page: PaymentsPage },
  { path: '/products', label: '상품', page: ProductsPage },
  { path: '/coupons', label: '쿠폰', page: CouponsPage },
  { path: '/stats', label: '통계', page: StatsPage },
  { path: '/games', label: '지난 판', page: GamesPage },
  { path: '/terms', label: '약관', page: TermsPage },
  { path: '/live', label: '열린 방', page: LivePage },
])

// 메뉴에는 없는 화면 (회원 상세는 다른 영역(신고·문의·결제)에서도 바로 가므로 따로 붙임)
export const adminDetailRoutes = Object.freeze([
  { path: '/members/:uuid', page: MemberDetailPage },
])
