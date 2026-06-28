/**
 * 인게임 채팅 패널 레이아웃 상수.
 *
 * InGameChatShell·InGameChatContent·InGameChatToggleButton·InGameChatCloseButton에서 사용합니다.
 * 프레임 scale(bottom-left) 보정은 mapFrameInsetToLayoutBox로 일괄 변환합니다.
 */
import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"

/** 채팅창 프레임.png — 메시지 목록 영역 (원본 1.0 기준 %) */
const CHAT_MESSAGE_LIST_INSET_FRAME = {
  top: 22,
  bottom: 30,
  left: 8,
  right: 8.5,
}

/** 채팅창 프레임.png — 텍스트 입력줄 영역 */
const CHAT_TEXT_FIELD_INSET_FRAME = {
  bottom: 15,
  left: 8,
  right: 3,
  height: 8.5,
}

/** 채팅창 프레임.png — 보내기 버튼 영역 */
const CHAT_SEND_BUTTON_INSET_FRAME = {
  bottom: 4.5,
  right: 3,
  height: 11,
}

/** 채팅창 프레임.png — 우상단 닫기 버튼 */
const CHAT_CLOSE_BUTTON_INSET_FRAME = {
  top: 1,
  right: 1,
}

/** INGAME_CHAT_FRAME_SCALE 적용 시 레이아웃 박스 % 좌표로 변환 */
function mapFrameInsetToLayoutBox(inset, scale = INGAME_CHAT_FRAME_SCALE) {
  const gap = (1 - scale) * 100
  const mapped = {}

  if (inset.top != null) mapped.top = `${gap + inset.top * scale}%`
  if (inset.bottom != null) mapped.bottom = `${inset.bottom * scale}%`
  if (inset.left != null) mapped.left = `${inset.left * scale}%`
  if (inset.right != null) mapped.right = `${gap + inset.right * scale}%`
  if (inset.height != null) mapped.height = `${inset.height * scale}%`

  return mapped
}

/** scale 보정 전 내부 레이아웃 박스 너비 — cqi 기준 유지용 */
export const INGAME_CHAT_LAYOUT_WIDTH_PERCENT = `${100 / INGAME_CHAT_FRAME_SCALE}%`

/** 열린 패널 기준 너비 (FRAME_SCALE=0.85 튜닝값) — inset·cqi는 패널 너비에 종속 */
const INGAME_CHAT_PANEL_WIDTH_BASE = {
  minRem: 15.725,
  midCqw: 28.9,
  maxRem: 24.225,
}

/**
 * 열린 채팅 패널 화면 크기 배율.
 * inset %·cqi 비율은 그대로 두고 패널 너비만 일괄 확대합니다.
 */
export const INGAME_CHAT_PANEL_SIZE_SCALE = 1.25

function scaleChatPanelWidth(value, scale = INGAME_CHAT_PANEL_SIZE_SCALE) {
  return Math.round(value * scale * 1000) / 1000
}

/** 열린 채팅 패널 — 화면 점유 너비 (Tailwind 동적 클래스는 JIT에서 누락되므로 style 사용) */
export function getInGameChatPanelWidthStyle(
  scale = INGAME_CHAT_PANEL_SIZE_SCALE,
) {
  return {
    width: `clamp(${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.minRem, scale)}rem, ${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.midCqw, scale)}cqw, ${scaleChatPanelWidth(INGAME_CHAT_PANEL_WIDTH_BASE.maxRem, scale)}rem)`,
  }
}

/** 열린 채팅 패널 — 좌하단 오버레이 위치 */
export const INGAME_CHAT_PANEL_POSITION_CLASS =
  "absolute bottom-[clamp(0.6rem,2.2vh,1.35rem)] left-[clamp(0.45rem,1.4cqw,0.9rem)] z-30 overflow-hidden"

/** 닫힌 상태 — 채팅 열기 버튼 위치 */
export const INGAME_CHAT_TOGGLE_POSITION_CLASS =
  "absolute bottom-[clamp(0.6rem,2.2vh,1.35rem)] left-[clamp(0.45rem,1.4cqw,0.9rem)] z-10"

export const INGAME_CHAT_TOGGLE_BTN_CLASS =
  "group block w-[clamp(4.5rem,8.5cqw,6.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const INGAME_CHAT_TOGGLE_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.06] group-active:scale-[0.96]"

/** InGameChatCloseButton — 닫기 버튼 크기·호버 */
export const INGAME_CHAT_CLOSE_BTN_CLASS =
  "group block w-[clamp(2.75rem,11cqi,3.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const INGAME_CHAT_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.06] group-active:scale-[0.96]"

/** InGameChatContent — 메시지 목록 inset (scale 보정 적용) */
export const INGAME_CHAT_MESSAGE_LIST_INSET = mapFrameInsetToLayoutBox(
  CHAT_MESSAGE_LIST_INSET_FRAME,
)

/** InGameChatContent — 입력줄 inset */
export const INGAME_CHAT_TEXT_FIELD_INSET = mapFrameInsetToLayoutBox(
  CHAT_TEXT_FIELD_INSET_FRAME,
)

/** InGameChatContent — 보내기 버튼 inset */
export const INGAME_CHAT_SEND_BUTTON_INSET = mapFrameInsetToLayoutBox(
  CHAT_SEND_BUTTON_INSET_FRAME,
)

/** InGameChatContent — 우상단 닫기 버튼 inset */
export const INGAME_CHAT_CLOSE_BUTTON_INSET = mapFrameInsetToLayoutBox(
  CHAT_CLOSE_BUTTON_INSET_FRAME,
)
