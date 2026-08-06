/**
 * 방 생성 화면의 역할 구성(AUTO/CUSTOM) 계약 상수.
 *
 * backend/game-core/roleComposition.js의 ROLE_COMPOSITION_MODES/CUSTOM_ROLE_KEYS와 값이
 * 일치해야 한다 — 이 저장소에는 백엔드/프런트가 공유하는 상수 모듈이 없어 수동으로
 * 동기화한다(ingameRoleRevealData.js와 동일한 관례).
 */

/** 서버 settings.roleCompositionMode에 그대로 실리는 값 */
export const ROLE_COMPOSITION_MODES = Object.freeze({ AUTO: "auto", CUSTOM: "custom" })

/**
 * 방장이 직접 개수를 지정할 수 있는 역할. CITIZEN은 의도적으로 없다 — 시작 시점의 실제
 * 인원에서 파생되는 값이라 클라이언트가 보내지 않는다(서버도 받지 않는다).
 */
export const CUSTOM_ROLE_KEYS = Object.freeze(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

/** 표시용 역할 이름 — ingame의 INGAME_ROLE_REVEAL_DISPLAY와 같은 명칭을 쓴다. */
export const CUSTOM_ROLE_LABELS = Object.freeze({
  JOKER: "광대",
  DOCTOR: "의사",
  GUARD: "경비대",
  WITCH_HUNTER: "마녀사냥꾼",
})

/** 파생 표시에만 쓰는 CITIZEN 라벨(입력 항목이 아니다). */
export const CITIZEN_ROLE_LABEL = "시민"

/**
 * CUSTOM에서 지정할 수 있는 광대 수 상한. 서버는 CUSTOM에서도 payload의 jokerCount를
 * 기존 규칙(backend/utils/createRoomValidation.js의 ALLOWED_JOKER_COUNT = 1~4)으로
 * 검증하고, roleCounts.JOKER와 다르면 거부한다 — 그래서 프런트도 같은 상한을 쓴다.
 */
export const MIN_CUSTOM_JOKER_COUNT = 1
export const MAX_CUSTOM_JOKER_COUNT = 4

/** CUSTOM으로 전환했을 때의 초기값. 광대 1명 외 고정 역할은 0명에서 시작한다. */
export const DEFAULT_CUSTOM_ROLE_COUNTS = Object.freeze({
  JOKER: 1,
  DOCTOR: 0,
  GUARD: 0,
  WITCH_HUNTER: 0,
})

/** AUTO/CUSTOM 선택 행에 표시할 라벨(선택지 순서 = 인덱스) */
export const ROLE_COMPOSITION_MODE_OPTIONS = Object.freeze([
  { mode: ROLE_COMPOSITION_MODES.AUTO, label: "자동" },
  { mode: ROLE_COMPOSITION_MODES.CUSTOM, label: "직접 지정" },
])
