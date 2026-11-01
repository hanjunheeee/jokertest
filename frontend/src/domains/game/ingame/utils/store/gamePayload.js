// 판 정보 다듬기: 시작 상태 기본값 채우기·방장 id 고르기, 공개 진행 수 모양 검사 (순수 계산)
// 인게임 스토어의 판 시작·참여·본인 진행 반영과 스냅샷 반영이 사용
import { normalizeRoomSettingsSource } from "../snapshot/roomSettings.js"

// 빈 문자열이 아닌 방장 id만 받음
const pickId = (value) => (typeof value === "string" && value.trim().length > 0 ? value : null)

// 상태 다듬기: 방 코드·방 설정 정리, 플레이어 생존·참여 기본값 채움
export function normalizeGameState(state) {
  if (!state) return null
  return {
    ...state,
    roomCode: typeof state.roomCode === "string" && state.roomCode.length > 0
      ? state.roomCode
      : null,
    roomSettingsSource: normalizeRoomSettingsSource(state.roomSettingsSource),
    players: Array.isArray(state.players)
      ? state.players.map((p) => ({
          ...p,
          alive: typeof p?.isAlive === "boolean" ? p.isAlive : p?.alive !== false,
          isParticipating: p?.isParticipating !== false,
        }))
      : state.players,
  }
}

// 방장 id 고르기: 서버 상태 값을 먼저, 없으면 따로 온 값
export function pickHostUuid(state, hostUuid) {
  return pickId(state?.hostUuid) ?? pickId(hostUuid)
}

// 공개 진행 수(몇 명 했는지)
// 종류 이름이 있고, 한 수·필요 수가 null이거나 0 이상 정수일 때만 받음
export function isPublicProgress(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (typeof value.kind !== "string" || value.kind.length === 0) return false
  const okCount = (n) => n === null || (Number.isInteger(n) && n >= 0)
  return okCount(value.doneCount) && okCount(value.requiredCount)
}
