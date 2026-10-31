import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"
import {
  INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "./ingameChatFrameLayout.js"

export const INGAME_CHAT_LAYOUT_WIDTH_PERCENT = `${100 / INGAME_CHAT_FRAME_SCALE}%`

const CHAT_MESSAGE_LIST_INSET_FRAME = {
  top: 8,
  left: 3 + INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  right: 5,
  height: 68,
}

const CHAT_TEXT_FIELD_INSET_FRAME = {
  bottom: 7,
  left: 4,
  right: 5,
  height: 11,
}

const CHAT_STATUS_LINE_INSET_FRAME = {
  bottom: 18,
  left: 4,
  right: 5,
  height: 6,
}

const INGAME_CHAT_PANEL_WIDTH_BASE = {
  minRem: 19,
  midCqw: 40,
  maxRem: 30,
}

export const INGAME_CHAT_PANEL_SIZE_SCALE = 1.08

function scaleChatPanelWidth(value, scale = INGAME_CHAT_PANEL_SIZE_SCALE) {
  return Math.round(value * scale * 1000) / 1000
}

export function getInGameChatPanelWidthStyle(
  scale = INGAME_CHAT_PANEL_SIZE_SCALE,
) {
  return {
    width: `clamp(${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.minRem, scale)}rem, ${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.midCqw, scale)}cqw, ${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.maxRem, scale)}rem)`,
  }
}

export const INGAME_CHAT_PANEL_POSITION_CLASS =
  "absolute left-1/2 top-[47.5%] z-20 overflow-visible [container-type:inline-size]"

export const INGAME_CHAT_PANEL_PERSPECTIVE = {
  rotateX: 20,
  perspective: 1100,
}

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

export const INGAME_CHAT_MESSAGE_LIST_INSET = mapFrameInsetToLayoutBox(
  CHAT_MESSAGE_LIST_INSET_FRAME,
)

export const INGAME_CHAT_TEXT_FIELD_INSET = mapFrameInsetToLayoutBox(
  CHAT_TEXT_FIELD_INSET_FRAME,
)

export const INGAME_CHAT_STATUS_LINE_INSET = mapFrameInsetToLayoutBox(
  CHAT_STATUS_LINE_INSET_FRAME,
)
