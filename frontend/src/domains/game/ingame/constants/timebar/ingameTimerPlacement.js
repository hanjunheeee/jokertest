/** 인게임 phase 타이머 UI 마운트 위치 — timebar(확대 바) | chat(채팅 상단) */
export const INGAME_TIMER_PLACEMENT = Object.freeze({
  TIMEBAR: "timebar",
  CHAT: "chat",
})

export const INGAME_TIMER_PLACEMENT_STORAGE_KEY = "joker.ingame.timerPlacement"

const VALID = new Set(Object.values(INGAME_TIMER_PLACEMENT))

/**
 * @returns {typeof INGAME_TIMER_PLACEMENT[keyof typeof INGAME_TIMER_PLACEMENT]}
 */
export function readInGameTimerPlacementFromSearch(search) {
  const raw = new URLSearchParams(search).get("timerPlacement")
  if (raw === INGAME_TIMER_PLACEMENT.CHAT || raw === INGAME_TIMER_PLACEMENT.TIMEBAR) {
    return raw
  }
  return null
}

/**
 * @param {{ search?: string, storage?: Storage | null }} [options]
 * @returns {typeof INGAME_TIMER_PLACEMENT[keyof typeof INGAME_TIMER_PLACEMENT]}
 */
export function readInGameTimerPlacement(options = {}) {
  const search = options.search ?? (typeof window !== "undefined" ? window.location.search : "")
  const fromQuery = readInGameTimerPlacementFromSearch(search)
  if (fromQuery) return fromQuery

  const storage = options.storage ?? (typeof window !== "undefined" ? window.localStorage : null)
  if (storage) {
    try {
      const stored = storage.getItem(INGAME_TIMER_PLACEMENT_STORAGE_KEY)
      if (VALID.has(stored)) return stored
    } catch {
      /* ignore */
    }
  }

  if (import.meta.env.DEV) {
    return INGAME_TIMER_PLACEMENT.CHAT
  }
  return INGAME_TIMER_PLACEMENT.TIMEBAR
}

/**
 * @param {typeof INGAME_TIMER_PLACEMENT[keyof typeof INGAME_TIMER_PLACEMENT]} placement
 */
export function writeInGameTimerPlacement(placement, storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!VALID.has(placement) || !storage) return
  try {
    storage.setItem(INGAME_TIMER_PLACEMENT_STORAGE_KEY, placement)
  } catch {
    /* ignore */
  }
}
