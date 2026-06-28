/**
 * 인게임 플레이어 보드 그리드·레이아웃 설정.
 *
 * InGamePlayerBoard·PlayerSlotGrid 열 수·배치·카드 크기·prototype 더미 인원에 사용합니다.
 */

/** 한 행 열 수 — 최대 10명 = 5열 × 2행 */
export const INGAME_PLAYER_SLOT_COLUMNS = 5

/**
 * 레이아웃 확인용 플레이어 수 (4~10).
 * 추후 game setup max-players / ingame store 값으로 교체.
 */
export const INGAME_PREVIEW_PLAYER_COUNT = 10

/** InGamePlayerBoard — 화면 중앙 고정 (채팅 open/close와 무관) */
export const INGAME_PLAYER_BOARD_POSITION_CLASS =
  "absolute left-1/2 top-1/2 z-10 w-[clamp(42rem,88cqw,70rem)] -translate-x-1/2 -translate-y-1/2 [container-type:inline-size]"

/** InGamePlayerBoard — 행 간격 */
export const INGAME_PLAYER_BOARD_GRID_CLASS =
  "flex flex-col items-center gap-[clamp(0.75rem,2.5cqi,1.25rem)]"

/** InGamePlayerBoard — 카드 열 간격 */
export const INGAME_PLAYER_BOARD_ROW_CLASS =
  "flex items-end justify-center gap-[clamp(0.65rem,2cqi,1.15rem)]"

/** 2행(6명 이상)일 때 카드 너비 */
export const INGAME_PLAYER_CARD_CLASS_COMPACT =
  "w-[clamp(7.25rem,22.5cqi,11rem)] shrink-0"

/** 1행(5명 이하)일 때 카드 너비 */
export const INGAME_PLAYER_CARD_CLASS_LARGE =
  "w-[clamp(8rem,22.5cqi,11.75rem)] shrink-0"
