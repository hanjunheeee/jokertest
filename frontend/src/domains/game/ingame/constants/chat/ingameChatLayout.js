/**
 * 인게임 채팅 패널 레이아웃 상수.
 *
 * InGameChatShell·InGameChatContent·InGameChatInput·InGameChatMessageList·InGameChatMessageRow에서 사용합니다.
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"

/** 보내기 제외 — 목록·입력 우측 시프트 (프레임 left % 가산) */
export const INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME = 9

/** 인게임-채팅창프레임.png — 메시지 목록 영역 (top + height로 세로 클램프) */
const CHAT_MESSAGE_LIST_INSET_FRAME = {
  top: 20,
  left: 8 + INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  right: 8,
  height: 50,
}

/** 인게임-채팅창프레임.png — 텍스트 입력줄 + 보내기 버튼 영역 */
const CHAT_TEXT_FIELD_INSET_FRAME = {
  bottom: 13.5,
  left: 9,
  right: 9,
  height: 11,
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
export const INGAME_CHAT_PANEL_SIZE_SCALE = 1.15

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

/** 인게임 채팅 — 입력·목록 공통 타이포 */
export const INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS =
  "font-subheading text-[clamp(0.72rem,3.2cqi,0.92rem)] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

/** 인게임 채팅 — 폭 기준 줄바꿈 (textarea·목록 공통) */
export const INGAME_CHAT_TEXT_WRAP_CLASS =
  "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"

/** 줄바꿈 기준 폭 trim — 목록 우측 여백 */
export const INGAME_CHAT_TEXT_WRAP_TRIM_CLASS =
  "pr-[clamp(0.85rem,3.2cqi,1.35rem)]"

/** 입력창 전용 trim — 목록보다 폭을 조금 더 짧게 */
export const INGAME_CHAT_INPUT_WRAP_TRIM_CLASS =
  "pr-[clamp(1.8rem,5.8cqi,2.7rem)]"

/** InGameChatInput — viewport 래퍼 (2줄+ 시 윗줄 상단 mask clip) */
export const INGAME_CHAT_INPUT_VIEWPORT_WRAP_CLASS =
  "relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)]"

/** InGameChatInput — textarea 본문 */
export const INGAME_CHAT_INPUT_CLASS =
  `block w-full resize-none border-0 bg-transparent outline-none placeholder:text-[#4a2814] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS}`

/** InGameChatInput — ~1.5줄 보이는 고정 viewport, 초과분은 내부 스크롤 */
export const INGAME_CHAT_INPUT_VIEWPORT_CLASS =
  `max-h-[clamp(1.45rem,6.2cqi,1.95rem)] overflow-y-auto overscroll-contain box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS}`

/** InGameChatContent — 입력창만 우측 시프트 (보내기 버튼 위치 유지) */
export const INGAME_CHAT_INPUT_SHIFT_CLASS =
  "ml-[clamp(1.65rem,8.8cqi,2.65rem)]"

/** InGameChatContent — 입력줄 + 보내기 버튼 행 */
export const INGAME_CHAT_TEXT_FIELD_ROW_CLASS =
  "absolute flex min-h-0 items-center gap-[clamp(0.15rem,1cqi,0.35rem)]"

/** InGameChatContent — 메시지 목록 컨테이너 (상단 페이드 — 5%만 투명) */
export const INGAME_CHAT_MESSAGE_LIST_CONTAINER_CLASS =
  "absolute min-h-0 [mask-image:linear-gradient(to_bottom,transparent_0%,#000_5%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,#000_5%,#000_100%)]"

/** InGameChatMessageList — 스크롤 래퍼 */
export const INGAME_CHAT_MESSAGE_LIST_SCROLL_WRAP_CLASS =
  "relative h-full min-h-0 w-full overflow-hidden"

/** InGameChatMessageList — 드래그 스크롤 뷰포트 (스크롤바 UI 없음, 텍스트 선택 불가) */
export const INGAME_CHAT_MESSAGE_LIST_SCROLL_CLASS =
  `h-full min-h-0 cursor-grab select-none overflow-x-hidden overflow-y-auto overscroll-contain touch-none ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

/** InGameChatMessageList — min-h-full + 하단 정렬용 spacer (justify-end 대신 — 스크롤 상단 누락 방지) */
export const INGAME_CHAT_MESSAGE_LIST_INNER_CLASS =
  "flex min-h-full select-none flex-col items-start gap-[0.52em] pl-[clamp(0.08rem,0.75cqi,0.18rem)] pt-[clamp(0.38rem,1.6cqi,0.55rem)] pb-[clamp(0.18rem,1cqi,0.28rem)]"

/** 메시지 적을 때 하단 밀착 — overflow 시 flex-1 spacer는 0으로 수축 */
export const INGAME_CHAT_MESSAGE_LIST_SPACER_CLASS =
  "min-h-0 flex-1 list-none"

/** InGameChatMessageRow — 읽기 전용 메시지 (드래그 스크롤 시 텍스트 선택 방지) */
export const INGAME_CHAT_MESSAGE_READ_ONLY_CLASS = "select-none"

/** InGameChatMessageRow — 메시지 본문 (입력창과 동일 wrap) */
export const INGAME_CHAT_MESSAGE_BODY_CLASS =
  `min-w-0 box-border ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS} ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_TEXT_WRAP_TRIM_CLASS}`

/** InGameChatMessageRow — 발신자 접두사 */
export const INGAME_CHAT_MESSAGE_SENDER_CLASS =
  `shrink-0 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS}`

/** InGameChatMessageRow — 행 레이아웃 */
export const INGAME_CHAT_MESSAGE_ROW_CLASS =
  `flex min-w-0 list-none items-start gap-[0.25em] ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS}`

/** InGameChatContent — 메시지 목록 inset (scale 보정 적용) */
export const INGAME_CHAT_MESSAGE_LIST_INSET = mapFrameInsetToLayoutBox(
  CHAT_MESSAGE_LIST_INSET_FRAME,
)

/** InGameChatContent — 입력줄 inset */
export const INGAME_CHAT_TEXT_FIELD_INSET = mapFrameInsetToLayoutBox(
  CHAT_TEXT_FIELD_INSET_FRAME,
)
