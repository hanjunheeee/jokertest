/**
 * 인게임 채팅 공통 레이아웃 상수 + variant facade.
 *
 * InGameChatContent·InGameChatInput·InGameChatMessageList·InGameChatMessageRow에서 사용합니다.
 * 보드 전용: ingameChatBoardLayout.js — 클로즈업 전용: closeup/ingameChatCloseupLayout.js
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import {
  INGAME_CHAT_MESSAGE_LIST_INSET,
  INGAME_CHAT_STATUS_LINE_INSET,
  INGAME_CHAT_TEXT_FIELD_INSET,
} from "./ingameChatBoardLayout.js"
import {
  INGAME_CHAT_CLOSEUP_INPUT_SHIFT_CLASS,
  INGAME_CHAT_CLOSEUP_INPUT_SINGLE_LINE_HEIGHT_CLASS,
  INGAME_CHAT_CLOSEUP_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS,
  INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET,
  INGAME_CHAT_CLOSEUP_SEND_BUTTON_CLASS,
  INGAME_CHAT_CLOSEUP_SEND_BUTTON_LABEL_CLASS,
  INGAME_CHAT_CLOSEUP_SEND_BUTTON_SHIFT_CLASS,
  INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET,
  INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET,
  INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_CLASS,
  INGAME_CHAT_CLOSEUP_TEXT_WRAP_TRIM_CLASS,
} from "./closeup/ingameChatCloseupLayout.js"
import { INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME } from "./ingameChatFrameLayout.js"

export { INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME }

/** 인게임 채팅 — 입력·목록 공통 타이포 */
export const INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS =
  "font-subheading text-[clamp(0.72rem,3.2cqi,0.92rem)] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatTextTypographyClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_CLASS
    : INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputClass(variant = "board") {
  return `block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#4a2814] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${getInGameChatTextTypographyClass(variant)}`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputPlaceholderClass(variant = "board") {
  return `pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${getInGameChatTextTypographyClass(variant)} text-[#4a2814]`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatTextWrapTrimClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_WRAP_TRIM_CLASS
    : INGAME_CHAT_TEXT_WRAP_TRIM_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatMessageBodyClass(variant = "board") {
  return `min-w-0 box-border ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatTextTypographyClass(variant)} ${INGAME_CHAT_TEXT_WRAP_CLASS} ${getInGameChatTextWrapTrimClass(variant)}`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatMessageSenderClass(variant = "board") {
  return `shrink-0 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatTextTypographyClass(variant)}`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputSingleLineHeightClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_SINGLE_LINE_HEIGHT_CLASS
    : INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputViewportFixedHeightClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS
    : INGAME_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputViewportSinglelineClass(variant = "board") {
  return `overflow-hidden box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${getInGameChatInputSingleLineHeightClass(variant)}`
}

/** 인게임 채팅 — 폭 기준 줄바꿈 (textarea·목록 공통) */
export const INGAME_CHAT_TEXT_WRAP_CLASS =
  "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"

/** 줄바꿈 기준 폭 trim — 목록 우측 여백 */
export const INGAME_CHAT_TEXT_WRAP_TRIM_CLASS =
  "pr-[clamp(0.85rem,3.2cqi,1.35rem)]"

/** 입력창 전용 trim — 보내기 버튼 여백 */
export const INGAME_CHAT_INPUT_WRAP_TRIM_CLASS =
  "pr-[clamp(1.55rem,5.2cqi,2.45rem)]"

/** 한 줄 line-height (font-size × leading 1.35) */
export const INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS =
  "max-h-[clamp(0.98rem,4.32cqi,1.26rem)]"

/** 입력창 viewport — 프레임 입력 슬롯 기준 고정 높이 */
export const INGAME_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS =
  "h-[clamp(1.68rem,6.85cqi,2.12rem)]"

/** 2줄+ — 현재 줄 전체 + 윗줄 약 절반 peek */
export const INGAME_CHAT_INPUT_MULTI_LINE_VIEWPORT_HEIGHT_CLASS =
  INGAME_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS

/** InGameChatInput — viewport 래퍼 공통 */
export const INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS =
  "relative min-w-0 flex-1 overflow-hidden"

/** 빈 입력 — placeholder 세로 중앙 */
export const INGAME_CHAT_INPUT_VIEWPORT_EMPTY_CLASS = "flex items-center"

/** 입력 중 — 멀티라인 peek용 하단 정렬 */
export const INGAME_CHAT_INPUT_VIEWPORT_FILLED_CLASS =
  "flex flex-col justify-end"

/** 빈 입력 placeholder — textarea 위 오버레이 */
export const INGAME_CHAT_INPUT_PLACEHOLDER_CLASS =
  `pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS} text-[#4a2814]`

/** 2줄+ 시 윗줄 상단 mask clip (~viewport 상단 22%) */
export const INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS =
  "[mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)]"

/** 1줄 — mask 해제 (부모/조상 mask 상속 방지) */
export const INGAME_CHAT_INPUT_VIEWPORT_NO_MASK_CLASS =
  "[mask-image:none] [-webkit-mask-image:none]"

/** @deprecated INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS + 조건부 mask 사용 */
export const INGAME_CHAT_INPUT_VIEWPORT_WRAP_CLASS =
  `${INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS} ${INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS} ${INGAME_CHAT_INPUT_MULTI_LINE_VIEWPORT_HEIGHT_CLASS}`

/** InGameChatInput — textarea 본문 */
export const INGAME_CHAT_INPUT_CLASS =
  `block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#4a2814] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS}`

/** 2줄+ — 고정 viewport, scrollTop으로 최신 줄 유지 */
export const INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS}`

/** 1줄 — 내용 높이에 맞춤 */
export const INGAME_CHAT_INPUT_VIEWPORT_SINGLELINE_CLASS =
  `overflow-hidden box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS}`

/** @deprecated INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS / SINGLELINE_CLASS 사용 */
export const INGAME_CHAT_INPUT_VIEWPORT_CLASS =
  INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS

/** InGameChatContent — 입력창만 우측 시프트 (보내기 버튼 위치 유지) */
export const INGAME_CHAT_INPUT_SHIFT_CLASS =
  "ml-[clamp(1.4rem,7.6cqi,2.35rem)]"

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputShiftClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_SHIFT_CLASS
    : INGAME_CHAT_INPUT_SHIFT_CLASS
}

/** InGameChatContent — 보내기 버튼 좌측 당김 (값을 줄이면 오른쪽으로 이동) */
export const INGAME_CHAT_SEND_BUTTON_SHIFT_CLASS =
  "-translate-x-[clamp(1.15rem,6.2cqi,1.85rem)]"

const INGAME_CHAT_SEND_BUTTON_CLASS =
  "interactive-scale relative block w-[clamp(3.45rem,24cqi,4.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

const INGAME_CHAT_SEND_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.56rem,3.1cqi,0.74rem)] font-bold text-[#e9b582] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatSendButtonClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_CLASS
    : INGAME_CHAT_SEND_BUTTON_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatSendButtonLabelClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_LABEL_CLASS
    : INGAME_CHAT_SEND_BUTTON_LABEL_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatSendButtonShiftClass(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_SHIFT_CLASS
    : INGAME_CHAT_SEND_BUTTON_SHIFT_CLASS
}

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

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatMessageListInset(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET
    : INGAME_CHAT_MESSAGE_LIST_INSET
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatTextFieldInset(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET
    : INGAME_CHAT_TEXT_FIELD_INSET
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatStatusLineInset(variant = "board") {
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET
    : INGAME_CHAT_STATUS_LINE_INSET
}

/** InGameChatContent — 상태·오류 문구 줄 래퍼 */
export const INGAME_CHAT_STATUS_LINE_WRAP_CLASS =
  "absolute flex items-center justify-center"
