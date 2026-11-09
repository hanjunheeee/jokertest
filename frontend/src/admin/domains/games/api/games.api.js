// 지난 판 경로 부르기 파일, 판 찾기(회원·한국 날짜·커서) · 판 하나
// GamesPage·GameDetailPage가 부름
import { adminApi } from '@/admin/shared/api/adminClient'

// 빈 칸은 빼고 주소로 (예: { userUuid:'', from:'2026-11-01' } → 'from=2026-11-01')
const queryOf = (filters) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()

// 응답: { items:[{ gameId, startedAt, endedAt, winner, winReason, playerCount, dayIndex }], nextBefore }
export const fetchGames = (filters = {}) => {
  const query = queryOf(filters)
  return adminApi.get(query ? `/games?${query}` : '/games')
}

// 응답: { game:{ …, roomId, completed, durationSec }, players:[{ uuid, nickname, role, team, won, alive, deathReason }] }
export const fetchGame = (gameId) => adminApi.get(`/games/${encodeURIComponent(gameId)}`)
