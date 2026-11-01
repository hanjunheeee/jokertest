// 밤 개인 결과(조사·확인 결과, 암살 실패) 검사와 화면 문구 만들기
// 밤 이벤트 손잡이가 검사를, 밤 개인 결과 훅(useInGameNightPrivateResult)이 문구를 씀
import { getRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

// 행동 종류별 주인 직업 (내 직업과 맞아야 받음)
const OWNER_ROLE_BY_ACTION_TYPE = Object.freeze({
  INVESTIGATE: "GUARD",
  CONFIRM: "WITCH_HUNTER",
  ASSASSINATE: "JOKER",
})

// 대상이 있는 행동 (조사·확인)
const TARGETED_ACTION_TYPES = new Set(["INVESTIGATE", "CONFIRM"])

// 암살 실패 문구
export const INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL =
  "이번 밤의 암살이 실패했습니다."

// 개인 결과 방송 검사: 지금 판·밤·날짜, 내 직업 행동, 살아 있을 때만 (틀리면 null)
export function parseInGameNightPrivateResultPayload({
  payload,
  gameId,
  dayIndex,
  phase,
  selfRole,
  selfUuid = null,
  selfAlive = null,
}) {
  // 지금 판 것인지
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof payload.gameId !== "string" || payload.gameId !== gameId) return null

  // 지금 밤·같은 날짜인지
  if (phase !== "NIGHT") return null
  if (!Number.isInteger(dayIndex)) return null
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== dayIndex) return null

  // 내 직업의 행동인지, 죽었으면 안 받음
  const ownerRole = OWNER_ROLE_BY_ACTION_TYPE[payload.actionType]
  if (ownerRole === undefined) return null
  if (typeof selfRole !== "string" || selfRole !== ownerRole) return null

  if (selfAlive === false) return null

  // 조사·확인: 대상이 내가 아니고 아는 직업이어야 함
  if (TARGETED_ACTION_TYPES.has(payload.actionType)) {
    if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null
    if (typeof selfUuid === "string" && selfUuid.length > 0 && payload.targetId === selfUuid) {
      return null
    }
    if (getRoleRevealDisplay(payload.role) === null) return null
    return {
      gameId: payload.gameId,
      dayIndex: payload.dayIndex,
      actionType: payload.actionType,
      targetId: payload.targetId,
      role: payload.role,
    }
  }

  // 암살: 실패 알림만 받음
  if (payload.success !== false) return null
  return {
    gameId: payload.gameId,
    dayIndex: payload.dayIndex,
    actionType: payload.actionType,
    targetId: null,
    role: null,
  }
}

// 저장된 결과 → 화면 문구 (대상이 명단에 없거나 모르는 직업이면 null)
export function reduceInGameNightPrivateResult(payload, players) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!Array.isArray(players)) return null

  // 암살은 실패일 때만 실패 문구
  if (payload.actionType === "ASSASSINATE") {
    if (payload.success !== undefined && payload.success !== false) return null
    return {
      kind: "ASSASSINATE",
      targetNickname: null,
      label: INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL,
    }
  }

  // 조사·확인은 대상 별명·직업 이름으로 문구
  if (!TARGETED_ACTION_TYPES.has(payload.actionType)) return null
  if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null

  const target = players.find((p) => p && p.uuid === payload.targetId) ?? null
  if (target === null) return null
  if (typeof target.nickname !== "string" || target.nickname.length === 0) return null

  const display = getRoleRevealDisplay(payload.role)
  if (display === null) return null

  const verb = payload.actionType === "INVESTIGATE" ? "조사" : "확인"
  return {
    kind: payload.actionType,
    targetNickname: target.nickname,
    label: `${verb} 결과, ${target.nickname} 님의 역할은 ${display.name}입니다.`,
  }
}
