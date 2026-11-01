// 직업 구성 상수: 자동/직접 지정, 직접 지정할 직업·이름, 인원 상한
// 직업 구성 화면·폼 계산·요청 만들기·저장값 정리가 씀, 시험도 씀

// 구성 방식
export const ROLE_COMPOSITION_MODES = Object.freeze({ AUTO: "auto", CUSTOM: "custom" })

// 직접 지정할 수 있는 직업 (시민은 남은 자리로 계산)
export const CUSTOM_ROLE_KEYS = Object.freeze(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

// 직업 이름
export const CUSTOM_ROLE_LABELS = Object.freeze({
  JOKER: "광대",
  DOCTOR: "의사",
  GUARD: "경비원",
  WITCH_HUNTER: "마녀사냥꾼",
})

// 시민 이름
export const CITIZEN_ROLE_LABEL = "시민"

// 특수 직업 하나당 최대 인원
export const MAX_SPECIAL_ROLE_COUNT = 2

// 직접 지정할 때 광대 최소·최대
export const MIN_CUSTOM_JOKER_COUNT = 1
export const MAX_CUSTOM_JOKER_COUNT = MAX_SPECIAL_ROLE_COUNT

// 직접 지정 처음 값
export const DEFAULT_CUSTOM_ROLE_COUNTS = Object.freeze({
  JOKER: 1,
  DOCTOR: 0,
  GUARD: 0,
  WITCH_HUNTER: 0,
})

// 구성 방식 고르기 글자
export const ROLE_COMPOSITION_MODE_OPTIONS = Object.freeze([
  { mode: ROLE_COMPOSITION_MODES.AUTO, label: "자동" },
  { mode: ROLE_COMPOSITION_MODES.CUSTOM, label: "직접 지정" },
])
