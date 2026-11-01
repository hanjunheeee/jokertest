// 방 설정 폼 항목 id와 서버 설정 키 짝, 폼 오류 코드
// utils/roomSettingsForm/ 아래 계산 파일들이 씀
import {
  GENERAL_GAME_SETUP,
  MEETING_GAME_SETUP,
  ROLE_NIGHT_ACTION_TIME_OPTIONS,
} from "./gameSetupOptions.js"

// 전체 밤 행동 시간 항목 id (직업별 밤 시간의 기본값)
export const OVERALL_NIGHT_ACTION_TIME_ID = "night-action-time"

// 숫자 고르기 항목 id → 서버 설정 키
export const RANGE_ID_TO_SETTING_KEY = Object.freeze({
  "max-players": "maxPlayers",
  "joker-count": "jokerCount",
  "day-discussion-time": "dayDiscussionTime",
  "day-vote-time": "dayVoteTime",
  [OVERALL_NIGHT_ACTION_TIME_ID]: "nightActionTime",
})

// 체크 항목 id → 서버 설정 키
export const CHECK_ID_TO_SETTING_KEY = Object.freeze({
  "lights-out": "lightsOut",
  "soul-betting": "soulBetting",
  "vote-reveal": "voteReveal",
})

// 방을 만든 뒤엔 바꿀 수 없는 항목 (편집 모드에서 숨김)
export const NON_EDITABLE_SETUP_ITEM_IDS = Object.freeze(["lights-out", "soul-betting", "vote-reveal"])

export const ALL_SETUP_ITEMS = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]

// 직업 ↔ 직업별 밤 시간 항목 id
export const ROLE_TO_NIGHT_TIME_ID = Object.freeze(
  Object.fromEntries(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role, id }) => [role, id])),
)

export const NIGHT_TIME_ID_TO_ROLE = Object.freeze(
  Object.fromEntries(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role, id }) => [id, role])),
)

export const ROOM_SETTINGS_FORM_ERROR_CODES = Object.freeze({
  NOT_OBJECT: "NOT_OBJECT",
  INVALID_ACCESS_TYPE: "INVALID_ACCESS_TYPE",
  MISSING_FIELD: "MISSING_FIELD",
  OUT_OF_RANGE: "OUT_OF_RANGE",
  INVALID_ROLE_COUNTS: "INVALID_ROLE_COUNTS",
  INVALID_ROLE_MODE: "INVALID_ROLE_MODE",
})

// 숫자 고르기 항목 id → 항목 정의 (최소·최대·간격 보기용)
export const STEPPER_ITEMS_BY_ID = Object.freeze(Object.fromEntries(
  [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]
    .filter((item) => item.type === "stepper")
    .map((item) => [item.id, item]),
))
