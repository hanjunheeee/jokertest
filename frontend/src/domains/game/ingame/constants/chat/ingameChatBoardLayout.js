// 판 위 채팅 창 모양: 패널 폭·기울기·목록/입력/상태 줄 자리
// 채팅 틀(InGameChatShell)과 채팅 레이아웃 상수가 사용
import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"
import {
  CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "./ingameChatFrameLayout.js"

// 틀 배율을 되돌린 폭
export const WIDTH_PERCENT = `${100 / INGAME_CHAT_FRAME_SCALE}%`

// 틀 그림 기준 목록·입력·상태 줄 자리 (% 값)
const MSG_LIST_INSET_FRAME = {
  top: 8,
  left: 3 + CONTENT_SHIFT_LEFT_FRAME,
  right: 5,
  height: 68,
}

const TEXT_FIELD_INSET_FRAME = {
  bottom: 7,
  left: 4,
  right: 5,
  height: 11,
}

const STATUS_LINE_INSET_FRAME = {
  bottom: 18,
  left: 4,
  right: 5,
  height: 6,
}

// 패널 폭 기준값과 배율
const PANEL_WIDTH_BASE = {
  minRem: 19,
  midCqw: 40,
  maxRem: 30,
}

export const PANEL_SIZE_SCALE = 1.08

// 배율 곱한 값 (소수 셋째 자리까지)
function scaleChatPanelWidth(value, scale = PANEL_SIZE_SCALE) {
  return Math.round(value * scale * 1000) / 1000
}

// 패널 폭 (화면 폭 따라 늘지만 최소·최대 rem 안에서)
export function getPanelWidthStyle(
  scale = PANEL_SIZE_SCALE,
) {
  return {
    width: `clamp(${scaleChatPanelWidth(PANEL_WIDTH_BASE.minRem, scale)}rem, ${scaleChatPanelWidth(PANEL_WIDTH_BASE.midCqw, scale)}cqw, ${scaleChatPanelWidth(PANEL_WIDTH_BASE.maxRem, scale)}rem)`,
  }
}

// 판 가운데 자리와 뒤로 눕힌 기울기 값
export const PANEL_POSITION_CLASS =
  "absolute left-1/2 top-[47.5%] z-20 overflow-visible [container-type:inline-size]"

export const PANEL_PERSPECTIVE = {
  rotateX: 20,
  perspective: 1100,
}

// 패널 폭 + 가운데 맞춤 + 뒤로 눕힌 기울기
export function getPanelStyle(
  scale = PANEL_SIZE_SCALE,
  {
    rotateX = PANEL_PERSPECTIVE.rotateX,
    perspective = PANEL_PERSPECTIVE.perspective,
  } = PANEL_PERSPECTIVE,
) {
  return {
    ...getPanelWidthStyle(scale),
    transform: `translate(-50%, -50%) perspective(${perspective}px) rotateX(${rotateX}deg)`,
    transformOrigin: "center center",
  }
}

// 틀 기준 자리를 화면 자리로 바꾼 값
export const INGAME_CHAT_MESSAGE_LIST_INSET = mapFrameInsetToLayoutBox(
  MSG_LIST_INSET_FRAME,
)

export const INGAME_CHAT_TEXT_FIELD_INSET = mapFrameInsetToLayoutBox(
  TEXT_FIELD_INSET_FRAME,
)

export const INGAME_CHAT_STATUS_LINE_INSET = mapFrameInsetToLayoutBox(
  STATUS_LINE_INSET_FRAME,
)
