// 통계 경로 부르기 파일, GET /admin-api/stats?from=&to= (한국 날짜, 최대 92일)
// StatsPage가 기간 고를 때 부름
import { adminApi } from '@/admin/shared/api/adminClient'

// 응답: { days:[{ date, signups, peakOnline, games, revenueKrw, refundsKrw }] }
export const fetchStats = ({ from, to }) => adminApi.get(`/stats?${new URLSearchParams({ from, to })}`)
