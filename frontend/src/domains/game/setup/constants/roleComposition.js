export const ROLE_COMPOSITION_MODES = Object.freeze({ AUTO: "auto", CUSTOM: "custom" })

export const CUSTOM_ROLE_KEYS = Object.freeze(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

export const CUSTOM_ROLE_LABELS = Object.freeze({
  JOKER: "광대",
  DOCTOR: "의사",
  GUARD: "경비원",
  WITCH_HUNTER: "마녀사냥꾼",
})

export const CITIZEN_ROLE_LABEL = "시민"

export const MAX_SPECIAL_ROLE_COUNT = 2

export const MIN_CUSTOM_JOKER_COUNT = 1
export const MAX_CUSTOM_JOKER_COUNT = MAX_SPECIAL_ROLE_COUNT

export const DEFAULT_CUSTOM_ROLE_COUNTS = Object.freeze({
  JOKER: 1,
  DOCTOR: 0,
  GUARD: 0,
  WITCH_HUNTER: 0,
})

export const ROLE_COMPOSITION_MODE_OPTIONS = Object.freeze([
  { mode: ROLE_COMPOSITION_MODES.AUTO, label: "자동" },
  { mode: ROLE_COMPOSITION_MODES.CUSTOM, label: "직접 지정" },
])
