// 내 생존 고르기와 밤 조커 채팅 자격·밤 대기 창 덮기 보기
// 행동 대상 훅·밤 이벤트 손잡이·채팅 채널·조커 채팅·채팅 틀 속성 훅·인게임 화면 대기 창 잠금이 사용
import { isSessionPlayerAlive } from "./actionTargets.js"

// 판 참가자 목록에서 내 생존 (모르면 null)
export function selectInGameSelfAlive(state) {
  const selfUuid = state?.self?.uuid
  if (typeof selfUuid !== "string" || selfUuid.length === 0) return null

  const players = state?.players
  if (!Array.isArray(players)) return null

  const selfEntry = players.find((player) => player?.uuid === selfUuid)
  if (!selfEntry || typeof selfEntry.alive !== "boolean") return null

  return selfEntry.alive
}

// 조작 화면용: 판 값이 없으면 세션 참가자 상태로 봄
export function resolveInGameSelfAliveForControls(state, localSessionPlayer) {
  const canonicalAlive = selectInGameSelfAlive(state)
  if (canonicalAlive !== null) return canonicalAlive

  return isSessionPlayerAlive(localSessionPlayer)
}

// 밤 연출 대기 창이 내 화면을 덮는지: 죽은 사람은 안 덮음 (죽은 사람끼리 채팅은 밤에도 됨, 사용자 결정 2026-11-09), 생존 모르면 덮음
export function nightWaitCoversSelf(state) {
  return selectInGameSelfAlive(state) !== false
}

// 밤 같은 직업 채팅 직업들
const NIGHT_CHAT_ROLES = ["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]

// 밤 같은 직업 채팅을 쓸 수 있는지: 밤에 산 사람만 (죽은 사람은 죽은 사람 채팅, 사용자 결정 2026-11-09)
export function isJokerNightChatEligible(state) {
  if (state?.phase !== "NIGHT") return false
  const alive = selectInGameSelfAlive(state)
  if (alive !== true) return false
  return NIGHT_CHAT_ROLES.includes(state?.self?.role)
}

// 밤 같은 직업 채팅을 받아 볼 수 있는지: 쓸 수 있는 사람 + 죽은 광대 (서버가 죽은 광대한테도 보냄, 읽기만)
export function canReadRoleNightChat(state) {
  if (isJokerNightChatEligible(state)) return true
  if (state?.phase !== "NIGHT") return false
  return selectInGameSelfAlive(state) === false && state?.self?.role === "JOKER"
}
