/**
 * 인게임 채팅 보드(탁자) 레이아웃.
 *
 * InGameChatShell·variant="board" InGameChatContent에서 사용합니다.
 */
import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"
import {
  INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "./ingameChatFrameLayout.js"

/** scale 보정 전 내부 레이아웃 박스 너비 — cqi 기준 유지용 */
export const INGAME_CHAT_LAYOUT_WIDTH_PERCENT = `${100 / INGAME_CHAT_FRAME_SCALE}%`

/** 인게임-채팅창프레임2.png — 메시지 목록 영역 (top + height로 세로 클램프) */
const CHAT_MESSAGE_LIST_INSET_FRAME = {
  top: 8,
  left: 3 + INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  right: 5,
  height: 68,
}

/** 인게임-채팅창프레임2.png — 텍스트 입력줄 + 보내기 버튼 영역 */
const CHAT_TEXT_FIELD_INSET_FRAME = {
  bottom: 7,
  left: 4,
  right: 5,
  height: 11,
}

/** 열린 패널 기준 너비 — 탁자 중앙 Messages 프레임 (G센세 prototype) */
const INGAME_CHAT_PANEL_WIDTH_BASE = {
  minRem: 19,
  midCqw: 40,
  maxRem: 30,
}

/**
 * 중앙 채팅 패널 화면 크기 배율.
 * inset %·cqi 비율은 그대로 두고 패널 너비만 일괄 확대합니다.
 */
export const INGAME_CHAT_PANEL_SIZE_SCALE = 1.08

function scaleChatPanelWidth(value, scale = INGAME_CHAT_PANEL_SIZE_SCALE) {
  return Math.round(value * scale * 1000) / 1000
}

/** 중앙 채팅 패널 — 화면 점유 너비 */
export function getInGameChatPanelWidthStyle(
  scale = INGAME_CHAT_PANEL_SIZE_SCALE,
) {
  return {
    width: `clamp(${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.minRem, scale)}rem, ${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.midCqw, scale)}cqw, ${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.maxRem, scale)}rem)`,
  }
}

/** 중앙 채팅 패널 — 탁자 위 고정 (탑뷰 perspective) */
export const INGAME_CHAT_PANEL_POSITION_CLASS =
  "absolute left-1/2 top-[47.5%] z-20 overflow-visible [container-type:inline-size]"

/** G센세 prototype — 탁자 기울기에 맞춘 채팅 프레임 perspective */
export const INGAME_CHAT_PANEL_PERSPECTIVE = {
  rotateX: 20,
  perspective: 1100,
}

/** 중앙 채팅 패널 width + transform (Tailwind translate와 style transform 병합) */
export function getInGameChatPanelStyle(
  scale = INGAME_CHAT_PANEL_SIZE_SCALE,
  {
    rotateX = INGAME_CHAT_PANEL_PERSPECTIVE.rotateX,
    perspective = INGAME_CHAT_PANEL_PERSPECTIVE.perspective,
  } = INGAME_CHAT_PANEL_PERSPECTIVE,
) {
  return {
    ...getInGameChatPanelWidthStyle(scale),
    transform: `translate(-50%, -50%) perspective(${perspective}px) rotateX(${rotateX}deg)`,
    transformOrigin: "center center",
  }
}

/** InGameChatContent — 보드 메시지 목록 inset (scale 보정 적용) */
export const INGAME_CHAT_MESSAGE_LIST_INSET = mapFrameInsetToLayoutBox(
  CHAT_MESSAGE_LIST_INSET_FRAME,
)

/** InGameChatContent — 보드 입력줄 inset */
export const INGAME_CHAT_TEXT_FIELD_INSET = mapFrameInsetToLayoutBox(
  CHAT_TEXT_FIELD_INSET_FRAME,
)
