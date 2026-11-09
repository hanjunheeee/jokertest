// 운영 현황 경로 부르기 파일, GET /admin-api/dashboard
// DashboardPage가 처음 열 때(보통)·30초마다(백그라운드 = 활동으로 안 셈) 부름
import { adminApi } from '@/admin/shared/api/adminClient'

// 응답: { totalMembers, todayGames:{ finished, inProgress, total }, inProgressGames, onlineCount, openReports, openInquiries, maintenance, live?, liveError? }
export const fetchDashboard = ({ background = false } = {}) => adminApi.get('/dashboard', { background })
