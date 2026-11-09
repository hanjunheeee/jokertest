// 열린 방·판 경로 부르기 파일, GET /admin-api/live (/internal/live와 같은 모양)
// LivePage가 처음 열 때(보통)·30초마다(백그라운드 = 활동으로 안 셈) 부름
import { adminApi } from '@/admin/shared/api/adminClient'

// 응답: { onlineCount, roomCount, gameCount, rooms:[…node], games:[…node], nodes?, partial?, maintenance }
export const fetchLive = ({ background = false } = {}) => adminApi.get('/live', { background })
