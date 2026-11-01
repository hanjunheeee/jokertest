// 인원수별(4~10명) 카드 자리표: 위치·구역·기울기
// 카드 판 상수(ingamePlayerBoard.js)가 사용

// 자리마다 화면 비율 위치(left·top %)와 구역(top·side·bottom), 기울기
export const INGAME_PLAYER_LAYOUT_4 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -6 },
  { left: 82, top: 46, zone: "side", rotate: 10 },
  { left: 50, top: 81, zone: "bottomCenter", rotate: 0 },
  { left: 18, top: 46, zone: "side", rotate: -10 },
]

export const INGAME_PLAYER_LAYOUT_5 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -6 },
  { left: 20, top: 42, zone: "top", scale: 0.95, rotate: -14, rotateX: -3 },
  { left: 80, top: 42, zone: "top", scale: 0.95, rotate: 14, rotateX: -3 },
  { left: 34, top: 82, zone: "bottomCenter", rotate: -2 },
  { left: 66, top: 82, zone: "bottomCenter", rotate: 2 },
]

export const INGAME_PLAYER_LAYOUT_6 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -6 },
  { left: 82, top: 32, zone: "side", rotate: 10 },
  { left: 82, top: 62, zone: "side", rotate: 10 },
  { left: 50, top: 81, zone: "bottomCenter", rotate: 0 },
  { left: 18, top: 62, zone: "side", rotate: -10 },
  { left: 18, top: 32, zone: "side", rotate: -10 },
]

export const INGAME_PLAYER_LAYOUT_7 = [
  { left: 50, top: 18, zone: "top", rotate: 0, rotateX: -6 },
  { left: 82, top: 30, zone: "side", rotate: 10 },
  { left: 82, top: 56, zone: "side", rotate: 10 },
  { left: 66, top: 82, zone: "bottomCenter", rotate: 2 },
  { left: 34, top: 82, zone: "bottomCenter", rotate: -2 },
  { left: 18, top: 56, zone: "side", rotate: -10 },
  { left: 18, top: 30, zone: "side", rotate: -10 },
]

export const INGAME_PLAYER_LAYOUT_8 = [
  { left: 50, top: 15, zone: "top", rotate: 0, rotateX: -6 },
  { left: 76, top: 20, zone: "side", rotate: 10 },
  { left: 84, top: 49, zone: "side", rotate: 10 },
  { left: 75, top: 80, zone: "bottom", rotate: 3 },
  { left: 50, top: 85, zone: "bottomCenter", rotate: 0 },
  { left: 25, top: 80, zone: "bottom", rotate: -3 },
  { left: 16, top: 49, zone: "side", rotate: -10 },
  { left: 24, top: 20, zone: "side", rotate: -10 },
]

export const INGAME_PLAYER_LAYOUT_9 = [
  { left: 21, top: 28, zone: "top", scale: 0.96, rotate: -9, rotateX: -1 },
  { left: 40, top: 18, zone: "top", rotate: -6, rotateX: -4 },
  { left: 59, top: 18, zone: "top", rotate: 6, rotateX: -4 },
  { left: 79, top: 28, zone: "top", scale: 0.96, rotate: 9, rotateX: -1 },
  { left: 18, top: 52, zone: "side", rotate: -10 },
  { left: 82, top: 52, zone: "side", rotate: 10 },
  { left: 26, top: 80, zone: "bottomCenter", rotate: -2 },
  { left: 50, top: 85, zone: "bottomCenter", rotate: 0 },
  { left: 74, top: 80, zone: "bottomCenter", rotate: 2 },
]

export const INGAME_PLAYER_LAYOUT_10 = [
  { left: 21, top: 22, zone: "top", scale: 0.96, rotate: -9, rotateX: -1 },
  { left: 40, top: 18, zone: "top", rotate: -6, rotateX: -4 },
  { left: 59, top: 18, zone: "top", rotate: 6, rotateX: -4 },
  { left: 79, top: 22, zone: "top", scale: 0.96, rotate: 9, rotateX: -1 },
  { left: 18, top: 46, zone: "side", rotate: -10 },
  { left: 82, top: 46, zone: "side", rotate: 10 },
  { left: 18, top: 77, zone: "bottom", rotate: 3 },
  { left: 39, top: 81, zone: "bottomCenter", rotate: 1 },
  { left: 61, top: 81, zone: "bottomCenter", rotate: -1 },
  { left: 82, top: 77, zone: "bottom", rotate: -3 },
]

// 인원수 → 자리표 (없는 인원수는 카드 판 상수가 10명 표 앞부분을 씀)
export const LAYOUTS_BY_COUNT = {
  4: INGAME_PLAYER_LAYOUT_4,
  5: INGAME_PLAYER_LAYOUT_5,
  6: INGAME_PLAYER_LAYOUT_6,
  7: INGAME_PLAYER_LAYOUT_7,
  8: INGAME_PLAYER_LAYOUT_8,
  9: INGAME_PLAYER_LAYOUT_9,
  10: INGAME_PLAYER_LAYOUT_10,
}
