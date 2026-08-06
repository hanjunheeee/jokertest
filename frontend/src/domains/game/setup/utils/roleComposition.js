/**
 * 역할 구성(AUTO/CUSTOM) UX 검증·파생 계산 순수 함수 모음.
 * React/Socket/Zustand에 의존하지 않아 node:test에서 JSX 없이 그대로 검증할 수 있다.
 *
 * 여기의 판정은 서버 검증(backend/game-core/roleComposition.js)의 사본이 아니라 "미리
 * 알려주는" 보조 장치다 — 최종 판단은 항상 서버가 하며, 이 파일은 잘못된 값을 clamp하지
 * 않고 "무엇이 왜 잘못됐는지"만 돌려준다.
 */
import {
  CUSTOM_ROLE_KEYS,
  MAX_CUSTOM_JOKER_COUNT,
  MIN_CUSTOM_JOKER_COUNT,
  ROLE_COMPOSITION_MODES,
  DEFAULT_CUSTOM_ROLE_COUNTS,
} from "../constants/roleComposition.js"

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

/** CUSTOM 초기 상태용 새 객체(상수 객체를 그대로 넘겨 공유 변형되는 일을 막는다). */
export function createDefaultCustomRoleCounts() {
  return { ...DEFAULT_CUSTOM_ROLE_COUNTS }
}

/**
 * 지정된 고정 역할 인원의 합. 값이 숫자가 아니면 NaN이 되어 검증에서 걸린다.
 * Number()로 감싸지 않는 이유: "2" 같은 문자열이 조용히 2로 바뀌면 합계·파생 시민 수는
 * 멀쩡해 보이는데 서버는 INVALID_ROLE_COUNT로 거부하는 어긋남이 생긴다.
 */
export function getFixedRoleCount(roleCounts) {
  return CUSTOM_ROLE_KEYS.reduce((sum, key) => {
    const value = roleCounts?.[key]
    return sum + (typeof value === "number" ? value : NaN)
  }, 0)
}

/**
 * 생성 화면 미리보기용 CITIZEN 수 — 정원(maxPlayers)에서 고정 역할 합을 뺀 나머지.
 * 실제 CITIZEN 수는 게임 시작 시점의 실제 인원으로 서버가 다시 계산한다.
 * 계산이 불가능하면(잘못된 입력) null을 돌려준다 — 0으로 뭉개면 잘못된 설정이 정상처럼 보인다.
 */
export function deriveCitizenCount(maxPlayers, roleCounts) {
  if (!Number.isInteger(maxPlayers)) return null
  const fixed = getFixedRoleCount(roleCounts)
  if (!Number.isInteger(fixed)) return null
  const citizen = maxPlayers - fixed
  return citizen < 0 ? null : citizen
}

/** 검증 실패 코드 → 방장에게 보여줄 안내 문구 */
export const ROLE_COMPOSITION_ERROR_MESSAGES = Object.freeze({
  INVALID_MAX_PLAYERS: "최대 플레이어 수가 올바르지 않습니다.",
  ROLE_COUNTS_NOT_OBJECT: "역할 구성 값이 올바르지 않습니다.",
  UNKNOWN_ROLE_KEY: "지정할 수 없는 역할이 포함되어 있습니다.",
  INVALID_ROLE_COUNT: "역할별 인원은 0 이상의 정수여야 합니다.",
  JOKER_COUNT_TOO_LOW: `광대는 최소 ${MIN_CUSTOM_JOKER_COUNT}명이어야 합니다.`,
  JOKER_COUNT_TOO_HIGH: "광대 수는 최대 플레이어 수보다 적어야 합니다.",
  JOKER_COUNT_ABOVE_LIMIT: `광대는 최대 ${MAX_CUSTOM_JOKER_COUNT}명까지 지정할 수 있습니다.`,
  FIXED_ROLES_EXCEED_MAX_PLAYERS: "지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.",
})

/**
 * 현재 역할 구성 설정이 방 생성 요청을 보낼 수 있는 상태인지 판정합니다.
 * AUTO는 항상 유효하다(기존 jokerCount 스테퍼가 이미 범위를 강제한다).
 * @param {{mode:string, roleCounts:object, maxPlayers:number}} input
 * @returns {{ok:true}|{ok:false, code:string, message:string}}
 */
export function validateRoleComposition({ mode, roleCounts, maxPlayers }) {
  if (mode !== ROLE_COMPOSITION_MODES.CUSTOM) return { ok: true }

  const fail = (code) => ({ ok: false, code, message: ROLE_COMPOSITION_ERROR_MESSAGES[code] })

  if (!Number.isInteger(maxPlayers) || maxPlayers < 1) return fail("INVALID_MAX_PLAYERS")
  if (typeof roleCounts !== "object" || roleCounts === null || Array.isArray(roleCounts)) {
    return fail("ROLE_COUNTS_NOT_OBJECT")
  }
  for (const key of Object.keys(roleCounts)) {
    // CITIZEN을 포함한 미허용 키는 서버가 거부하므로 여기서도 똑같이 거부한다.
    if (!CUSTOM_ROLE_KEYS.includes(key)) return fail("UNKNOWN_ROLE_KEY")
  }
  for (const key of CUSTOM_ROLE_KEYS) {
    if (!isNonNegativeInteger(roleCounts[key])) return fail("INVALID_ROLE_COUNT")
  }
  if (roleCounts.JOKER < MIN_CUSTOM_JOKER_COUNT) return fail("JOKER_COUNT_TOO_LOW")
  if (roleCounts.JOKER > MAX_CUSTOM_JOKER_COUNT) return fail("JOKER_COUNT_ABOVE_LIMIT")
  if (roleCounts.JOKER >= maxPlayers) return fail("JOKER_COUNT_TOO_HIGH")
  if (getFixedRoleCount(roleCounts) > maxPlayers) return fail("FIXED_ROLES_EXCEED_MAX_PLAYERS")

  return { ok: true }
}

/**
 * 각 역할 스테퍼의 선택 범위. 역할 하나만 보고 정하는 값이라 "합계"는 여기서 막지 않는다 —
 * 다른 역할의 현재 값에 따라 상한을 줄이면, 이미 고른 값이 선택지 밖으로 밀려나 화면에는
 * 다른 숫자가 보이면서 상태는 그대로인 어긋남이 생긴다. 합계 초과는 validateRoleComposition의
 * 인라인 경고와 생성 버튼 비활성화로 처리한다.
 */
export function getRoleCountRange(roleKey, maxPlayers) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1) {
    return { min: 0, max: 0 }
  }
  if (roleKey === "JOKER") {
    // 광대는 "비-광대 최소 1명" 때문에 정원보다 반드시 적어야 하고, 서버의 기존 상한도 받는다.
    return {
      min: MIN_CUSTOM_JOKER_COUNT,
      max: Math.max(MIN_CUSTOM_JOKER_COUNT, Math.min(maxPlayers - 1, MAX_CUSTOM_JOKER_COUNT)),
    }
  }
  return { min: 0, max: maxPlayers }
}
