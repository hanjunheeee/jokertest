// ViewportShell의 인라인 스타일과 index.css의 레이아웃 CSS가 같은 값을 공유합니다.
// 숫자와 CSS 변수 이름을 한곳에서 관리하면, 레이아웃 기준이 바뀌어도 한 파일만 수정하면 됩니다.
export const GAME_VIEWPORT_MAX_WIDTH_PX = 1192
export const GAME_VIEWPORT_MAX_WIDTH_VAR = "--game-viewport-max-width"
export const VIEWPORT_SHELL_COLUMN_GAP_PX = 20
export const VIEWPORT_SHELL_COLUMN_GAP_VAR = "--viewport-shell-column-gap"

/** 임시: 좌우 배너 **이미지** 노출 여부(슬롯·게임 열 폭은 유지) — 되돌릴 때 true */
export const VIEWPORT_SIDE_BANNER_IMAGES_VISIBLE = false
