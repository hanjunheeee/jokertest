// 플레이어 카드 메뉴 고정 값: 항목 종류·문구·잠김 이유·범위 비교 필드
// 카드 메뉴 항목 만들기(utils/cardMenu/)·카드 메뉴 훅·메뉴 화면이 사용 (훅 입구가 다시 내보냄)

export const INGAME_CARD_MENU_ITEM_KINDS = Object.freeze({
  DAY_VOTE: "DAY_VOTE",
  DAY_VOTE_CANCEL: "DAY_VOTE_CANCEL",
  TRIBUNAL_GUILTY: "TRIBUNAL_GUILTY",
  TRIBUNAL_NOT_GUILTY: "TRIBUNAL_NOT_GUILTY",
  NIGHT_ACTION: "NIGHT_ACTION",
  NIGHT_ACTION_CANCEL: "NIGHT_ACTION_CANCEL",
})

export const INGAME_CARD_MENU_DAY_VOTE_LABEL = "투표하기"
export const INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL = "투표취소"
export const INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL = "취소하기"
export const NIGHT_FALLBACK_LABEL = "밤 행동"

export const INGAME_CARD_MENU_DISABLED_REASONS = Object.freeze({
  selfDead: "사망한 플레이어는 행동할 수 없습니다",
  notTarget: "대상이 아닙니다",
  submitting: "전송 중입니다",
  blocked: "현재 행동할 수 없습니다",
})

// 고른 뒤 제출하기 전까지 그대로여야 하는 범위 필드
export const CARD_MENU_SCOPE_FIELDS = [
  "gameId", "authUuid", "identityGeneration", "identityScopeVersion",
  "phase", "dayPhase", "dayIndex", "dayVoteRound", "nightTurnRole",
]
