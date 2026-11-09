// 지난 판 글자 파일, 직업·진영·끝난 이유·죽은 이유 코드 → 화면 글자 (모르는 코드는 그대로)
// GamesPage·GameDetailPage가 씀 (관리자는 플레이어 화면 글자를 못 불러서 따로 둠, 마녀사냥꾼도 진짜 이름)
const ROLE = { JOKER: '광대', CITIZEN: '귀족', DOCTOR: '주치의', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' }
const TEAM = { JOKER: '광대 진영', CITIZEN: '시민 진영', NONE: '없음' }
const WIN_REASON = {
  ALL_JOKERS_ELIMINATED: '광대 전부 탈락',
  JOKER_PARITY_REACHED: '광대 수가 같아짐',
  ABORTED: '중간에 깨짐',
  MAINTENANCE: '점검으로 끝남',
}
const DEATH = { ASSASSINATION: '밤 암살', EXECUTION: '재판 처형', DISCONNECT: '끊김' }

const pick = (table) => (code) => (code ? table[code] ?? code : '—')

export const roleText = pick(ROLE)
export const teamText = pick(TEAM)
export const winReasonText = pick(WIN_REASON)
export const deathText = pick(DEATH)

// 승패 칸: true 승 · false 패 · null 승패 없음
export const wonText = (won) => (won === true ? '승' : won === false ? '패' : '승패 없음')

// 판 시간 초 → '12분 30초'
export const durationText = (seconds) => {
  if (!Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}분 ${seconds % 60}초` : `${seconds}초`
}
