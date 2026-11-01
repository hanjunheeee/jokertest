// 단계 타이머 자리 값(확대 시간 바·채팅 틀 안)과 읽기·저장 (주소 쿼리 → 브라우저 저장 → 기본값)
// 타이머 자리 훅(useTimerPlacement)·채팅 틀·채팅 내용·진행 바·타이머 묶음·개발용 전환 버튼이 사용
export const INGAME_TIMER_PLACEMENT = Object.freeze({
  TIMEBAR: "timebar",
  CHAT: "chat",
})

export const PLACEMENT_STORAGE_KEY = "joker.ingame.timerPlacement"

const VALID_PLACEMENTS = new Set(Object.values(INGAME_TIMER_PLACEMENT))

// 주소 ?timerPlacement= 값 (아는 값 아니면 null)
export function readInGameTimerPlacementFromSearch(search) {
  const raw = new URLSearchParams(search).get("timerPlacement")
  if (raw === INGAME_TIMER_PLACEMENT.CHAT || raw === INGAME_TIMER_PLACEMENT.TIMEBAR) {
    return raw
  }
  return null
}

// 자리 정하기: 쿼리 → 저장 값 → 개발 땐 채팅, 배포 땐 시간 바 (빌드 환경 값 없는 node 시험은 배포 쪽)
export function readInGameTimerPlacement(options = {}) {
  const search = options.search ?? (typeof window !== "undefined" ? window.location.search : "")
  const fromQuery = readInGameTimerPlacementFromSearch(search)
  if (fromQuery) return fromQuery

  // 저장소가 막혀 던져도 기본값으로 넘어감
  const storage = options.storage ?? (typeof window !== "undefined" ? window.localStorage : null)
  if (storage) {
    try {
      const stored = storage.getItem(PLACEMENT_STORAGE_KEY)
      if (VALID_PLACEMENTS.has(stored)) return stored
    } catch {
      // 못 읽으면 저장 값 없는 것으로 봄
    }
  }

  if (import.meta.env?.DEV === true) {
    return INGAME_TIMER_PLACEMENT.CHAT
  }
  return INGAME_TIMER_PLACEMENT.TIMEBAR
}

// 고른 자리 저장 (모르는 값·저장소 없으면 안 함, 못 써도 화면은 그대로)
export function writeInGameTimerPlacement(placement, storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!VALID_PLACEMENTS.has(placement) || !storage) return
  try {
    storage.setItem(PLACEMENT_STORAGE_KEY, placement)
  } catch {
    // 저장 막혀도 지금 화면 자리만 바뀌면 됨
  }
}
