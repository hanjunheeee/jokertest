/**
 * 인게임 플레이어 슬롯 좌표 데이터.
 *
 * prototype `플레이어 수 별 좌표 세트.png` + 10인 튜닝값 기준.
 * 슬롯 순서: 12시 방향부터 시계방향.
 * transform 기본값은 ingamePlayerBoard.js의 zone·derive 규칙에서 상속.
 */

/** 4인 — 상·우·하·좌 (십자) */
export const INGAME_PLAYER_LAYOUT_4 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -13 },
  { left: 82, top: 46, zone: "side", rotate: 10 },
  { left: 50, top: 81, zone: "bottomCenter", rotate: 0 },
  { left: 18, top: 46, zone: "side", rotate: -10 },
]

/** 5인 — 상 1 + 상단 좌우 2 + 하단 좌우 2 (6시 없음) */
export const INGAME_PLAYER_LAYOUT_5 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -13 },
  { left: 20, top: 42, zone: "top", scale: 0.95, rotate: -14, rotateX: -7 },
  { left: 80, top: 42, zone: "top", scale: 0.95, rotate: 14, rotateX: -7 },
  { left: 34, top: 82, zone: "bottomCenter", rotate: -2 },
  { left: 66, top: 82, zone: "bottomCenter", rotate: 2 },
]

/** 6인 — 상·하 + 좌 2 + 우 2 */
export const INGAME_PLAYER_LAYOUT_6 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -13 },
  { left: 82, top: 32, zone: "side", rotate: 10 },
  { left: 82, top: 62, zone: "side", rotate: 10 },
  { left: 50, top: 81, zone: "bottomCenter", rotate: 0 },
  { left: 18, top: 62, zone: "side", rotate: -10 },
  { left: 18, top: 32, zone: "side", rotate: -10 },
]

/** 7인 — 8인에서 6시 제거 (프로토타입 없음, 6↔8 보간) */
export const INGAME_PLAYER_LAYOUT_7 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -13 },
  { left: 82, top: 30, zone: "side", rotate: 10 },
  { left: 82, top: 56, zone: "side", rotate: 10 },
  { left: 66, top: 82, zone: "bottomCenter", rotate: 2 },
  { left: 34, top: 82, zone: "bottomCenter", rotate: -2 },
  { left: 18, top: 56, zone: "side", rotate: -10 },
  { left: 18, top: 30, zone: "side", rotate: -10 },
]

/** 8인 — 상·하 + 좌 3 + 우 3 */
export const INGAME_PLAYER_LAYOUT_8 = [
  { left: 50, top: 15, zone: "top", rotate: 0, rotateX: -13 },
  { left: 76, top: 20, zone: "side", rotate: 10 },
  { left: 84, top: 49, zone: "side", rotate: 10 },
  { left: 75, top: 80, zone: "bottom", rotate: 3 },
  { left: 50, top: 85, zone: "bottomCenter", rotate: 0 },
  { left: 25, top: 80, zone: "bottom", rotate: -3 },
  { left: 16, top: 49, zone: "side", rotate: -10 },
  { left: 24, top: 20, zone: "side", rotate: -10 },
]

/** 9인 — 10인에서 하단 중앙 1석 제거 (상4·측2·하3) */
export const INGAME_PLAYER_LAYOUT_9 = [
  { left: 21, top: 28, zone: "top", scale: 0.96, rotate: -9, rotateX: -3 },
  { left: 40, top: 18, zone: "top", rotate: -6, rotateX: -9 },
  { left: 59, top: 18, zone: "top", rotate: 6, rotateX: -9 },
  { left: 79, top: 28, zone: "top", scale: 0.96, rotate: 9, rotateX: -3 },
  { left: 18, top: 52, zone: "side", rotate: -10 },
  { left: 82, top: 52, zone: "side", rotate: 10 },
  { left: 26, top: 80, zone: "bottomCenter", rotate: -2 },
  { left: 50, top: 85, zone: "bottomCenter", rotate: 0 },
  { left: 74, top: 80, zone: "bottomCenter", rotate: 2 },
]

/** 10인 — G센세 prototype (상4·좌·하4·우) */
export const INGAME_PLAYER_LAYOUT_10 = [
  { left: 21, top: 22, zone: "top", scale: 0.96, rotate: -9, rotateX: -3 },
  { left: 40, top: 18, zone: "top", rotate: -6, rotateX: -9 },
  { left: 59, top: 18, zone: "top", rotate: 6, rotateX: -9 },
  { left: 79, top: 22, zone: "top", scale: 0.96, rotate: 9, rotateX: -3 },
  { left: 18, top: 46, zone: "side", rotate: -10 },
  { left: 82, top: 46, zone: "side", rotate: 10 },
  { left: 18, top: 77, zone: "bottom", rotate: 3 },
  { left: 39, top: 81, zone: "bottomCenter", rotate: 1 },
  { left: 61, top: 81, zone: "bottomCenter", rotate: -1 },
  { left: 82, top: 77, zone: "bottom", rotate: -3 },
]

/** 인원수별 좌표 세트 */
export const INGAME_PLAYER_LAYOUTS_BY_COUNT = {
  4: INGAME_PLAYER_LAYOUT_4,
  5: INGAME_PLAYER_LAYOUT_5,
  6: INGAME_PLAYER_LAYOUT_6,
  7: INGAME_PLAYER_LAYOUT_7,
  8: INGAME_PLAYER_LAYOUT_8,
  9: INGAME_PLAYER_LAYOUT_9,
  10: INGAME_PLAYER_LAYOUT_10,
}
