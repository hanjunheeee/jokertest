import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../../shared/constants/customScrollbarStyles.js"
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
import {
  INGAME_TRIBUNAL_CHAT_INPUT_SHIFT_CLASS,
  INGAME_TRIBUNAL_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS,
  INGAME_TRIBUNAL_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS,
  INGAME_TRIBUNAL_CHAT_SEND_BUTTON_CLASS,
  INGAME_TRIBUNAL_CHAT_SEND_BUTTON_LABEL_CLASS,
  INGAME_TRIBUNAL_CHAT_SEND_BUTTON_SHIFT_CLASS,
  INGAME_TRIBUNAL_CHAT_TEXT_SCALED_FONT_SIZE,
  INGAME_TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_CLASS,
  INGAME_TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS,
  INGAME_TRIBUNAL_CHAT_TEXT_WRAP_TRIM_CLASS,
} from "../tribunalPresentation/ingameTribunalPresentationChatLayout.js"

export { INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME }

function isInGameChatCloseupLikeVariant(variant) {
  return variant === "closeup" || variant === "tribunal"
}

export const INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS =
  "font-subheading text-[clamp(0.72rem,3.2cqi,0.92rem)] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

export function getInGameChatTextTypographyClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_CLASS
    : INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS
}

export const INGAME_CHAT_TEXT_SCALE_CSS_VAR = "--ingame-chat-text-scale"

export const INGAME_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS =
  "font-subheading text-[clamp(calc(0.72rem*var(--ingame-chat-text-scale,1)),calc(3.2cqi*var(--ingame-chat-text-scale,1)),calc(0.92rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

export const INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_SCALED_CLASS =
  "font-subheading text-[clamp(calc(0.95rem*var(--ingame-chat-text-scale,1)),calc(4.15cqi*var(--ingame-chat-text-scale,1)),calc(1.28rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

export const INGAME_CHAT_TEXT_SCALED_FONT_SIZE =
  "clamp(calc(0.72rem*var(--ingame-chat-text-scale,1)),calc(3.2cqi*var(--ingame-chat-text-scale,1)),calc(0.92rem*var(--ingame-chat-text-scale,1)))"

export const INGAME_CHAT_CLOSEUP_TEXT_SCALED_FONT_SIZE =
  "clamp(calc(0.95rem*var(--ingame-chat-text-scale,1)),calc(4.15cqi*var(--ingame-chat-text-scale,1)),calc(1.28rem*var(--ingame-chat-text-scale,1)))"

export function getInGameChatScaledFontSize(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_SCALED_FONT_SIZE
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_SCALED_FONT_SIZE
    : INGAME_CHAT_TEXT_SCALED_FONT_SIZE
}

export function getInGameChatScaledTypographyClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_SCALED_CLASS
    : INGAME_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS
}

export function getInGameChatTextScaleStyle(chatTextSize) {
  return { [INGAME_CHAT_TEXT_SCALE_CSS_VAR]: String(getInGameChatTextScale(chatTextSize)) }
}

const CHAT_TEXT_SCALE_MIN = 0.6
const CHAT_TEXT_SCALE_MAX = 1

export function getInGameChatTextScale(chatTextSize) {
  const n = Number(chatTextSize)
  if (!Number.isFinite(n)) return 1

  const clamped = Math.min(100, Math.max(0, n))
  const ratio = clamped / 100
  return CHAT_TEXT_SCALE_MIN + (CHAT_TEXT_SCALE_MAX - CHAT_TEXT_SCALE_MIN) * ratio
}

export function getInGameChatMessageTimeClass(variant = "board") {
  return `shrink-0 opacity-60 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatScaledTypographyClass(variant)}`
}

export function getInGameChatInputClass(variant = "board") {
  return `block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#4a2814] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${getInGameChatScaledTypographyClass(variant)}`
}

export function getInGameChatInputPlaceholderClass(variant = "board") {
  return `pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${getInGameChatScaledTypographyClass(variant)} text-[#4a2814]`
}

export function getInGameChatTextWrapTrimClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_WRAP_TRIM_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_WRAP_TRIM_CLASS
    : INGAME_CHAT_TEXT_WRAP_TRIM_CLASS
}

export function getInGameChatMessageBodyClass(variant = "board") {
  return `min-w-0 box-border ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatScaledTypographyClass(variant)} ${INGAME_CHAT_TEXT_WRAP_CLASS} ${getInGameChatTextWrapTrimClass(variant)}`
}

export function getInGameChatMessageSenderClass(variant = "board") {
  return `shrink-0 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatScaledTypographyClass(variant)}`
}

export function getInGameChatInputSingleLineHeightClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_SINGLE_LINE_HEIGHT_CLASS
    : INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS
}

export function getInGameChatInputViewportFixedHeightClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS
    : INGAME_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS
}

export function getInGameChatInputViewportSinglelineClass(variant = "board") {
  return `overflow-hidden box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${getInGameChatInputSingleLineHeightClass(variant)}`
}

export const INGAME_CHAT_TEXT_WRAP_CLASS =
  "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"

export const INGAME_CHAT_TEXT_WRAP_TRIM_CLASS =
  "pr-[clamp(0.85rem,3.2cqi,1.35rem)]"

export const INGAME_CHAT_INPUT_WRAP_TRIM_CLASS =
  "pr-[clamp(1.55rem,5.2cqi,2.45rem)]"

export const INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS =
  "max-h-[clamp(0.98rem,4.32cqi,1.26rem)]"

export const INGAME_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS =
  "h-[clamp(1.68rem,6.85cqi,2.12rem)]"

export const INGAME_CHAT_INPUT_MULTI_LINE_VIEWPORT_HEIGHT_CLASS =
  INGAME_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS

export const INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS =
  "relative min-w-0 flex-1 overflow-hidden"

export const INGAME_CHAT_INPUT_VIEWPORT_EMPTY_CLASS = "flex items-center"

export const INGAME_CHAT_INPUT_VIEWPORT_FILLED_CLASS =
  "flex flex-col justify-end"

export const INGAME_CHAT_INPUT_PLACEHOLDER_CLASS =
  `pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS} text-[#4a2814]`

export const INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS =
  "[mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)]"

export const INGAME_CHAT_INPUT_VIEWPORT_NO_MASK_CLASS =
  "[mask-image:none] [-webkit-mask-image:none]"

export const INGAME_CHAT_INPUT_VIEWPORT_WRAP_CLASS =
  `${INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS} ${INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS} ${INGAME_CHAT_INPUT_MULTI_LINE_VIEWPORT_HEIGHT_CLASS}`

export const INGAME_CHAT_INPUT_CLASS =
  `block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#4a2814] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS}`

export const INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS}`

export const INGAME_CHAT_INPUT_VIEWPORT_SINGLELINE_CLASS =
  `overflow-hidden box-border ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS}`

export const INGAME_CHAT_INPUT_VIEWPORT_CLASS =
  INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS

export const INGAME_CHAT_INPUT_SHIFT_CLASS =
  "ml-[clamp(1.4rem,7.6cqi,2.35rem)]"

export function getInGameChatInputShiftClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_INPUT_SHIFT_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_SHIFT_CLASS
    : INGAME_CHAT_INPUT_SHIFT_CLASS
}

export const INGAME_CHAT_SEND_BUTTON_SHIFT_CLASS =
  "-translate-x-[clamp(1.15rem,6.2cqi,1.85rem)]"

const INGAME_CHAT_SEND_BUTTON_CLASS =
  "interactive-scale relative block w-[clamp(3.45rem,24cqi,4.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

const INGAME_CHAT_SEND_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.56rem,3.1cqi,0.74rem)] font-bold text-[#e9b582] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export function getInGameChatSendButtonClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_SEND_BUTTON_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_CLASS
    : INGAME_CHAT_SEND_BUTTON_CLASS
}

export function getInGameChatSendButtonLabelClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_SEND_BUTTON_LABEL_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_LABEL_CLASS
    : INGAME_CHAT_SEND_BUTTON_LABEL_CLASS
}

export function getInGameChatSendButtonShiftClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_SEND_BUTTON_SHIFT_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_SHIFT_CLASS
    : INGAME_CHAT_SEND_BUTTON_SHIFT_CLASS
}

export const INGAME_CHAT_TEXT_FIELD_ROW_CLASS =
  "absolute flex min-h-0 items-center gap-[clamp(0.15rem,1cqi,0.35rem)]"

export const INGAME_CHAT_MESSAGE_LIST_CONTAINER_CLASS =
  "absolute min-h-0 [mask-image:linear-gradient(to_bottom,transparent_0%,#000_5%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,#000_5%,#000_100%)]"

export const INGAME_CHAT_MESSAGE_LIST_SCROLL_WRAP_CLASS =
  "relative h-full min-h-0 w-full overflow-hidden"

export const INGAME_CHAT_MESSAGE_LIST_SCROLL_CLASS =
  `h-full min-h-0 cursor-grab select-none overflow-x-hidden overflow-y-auto overscroll-contain touch-none ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const INGAME_CHAT_MESSAGE_LIST_INNER_CLASS =
  "flex min-h-full select-none flex-col items-start gap-[0.52em] pl-[clamp(0.08rem,0.75cqi,0.18rem)] pt-[clamp(0.38rem,1.6cqi,0.55rem)] pb-[clamp(0.18rem,1cqi,0.28rem)]"

export const INGAME_CHAT_MESSAGE_LIST_SPACER_CLASS =
  "min-h-0 flex-1 list-none"

export const INGAME_CHAT_MESSAGE_READ_ONLY_CLASS = "select-none"

export const INGAME_CHAT_MESSAGE_BODY_CLASS =
  `min-w-0 box-border ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS} ${INGAME_CHAT_TEXT_WRAP_CLASS} ${INGAME_CHAT_TEXT_WRAP_TRIM_CLASS}`

export const INGAME_CHAT_MESSAGE_SENDER_CLASS =
  `shrink-0 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS}`

export const INGAME_CHAT_MESSAGE_ROW_CLASS =
  `flex min-w-0 list-none items-start gap-[0.25em] ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS}`

export function getInGameChatMessageListInset(variant = "board") {
  return isInGameChatCloseupLikeVariant(variant)
    ? INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET
    : INGAME_CHAT_MESSAGE_LIST_INSET
}

export function getInGameChatTextFieldInset(variant = "board") {
  return isInGameChatCloseupLikeVariant(variant)
    ? INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET
    : INGAME_CHAT_TEXT_FIELD_INSET
}

export function getInGameChatStatusLineInset(variant = "board") {
  return isInGameChatCloseupLikeVariant(variant)
    ? INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET
    : INGAME_CHAT_STATUS_LINE_INSET
}

export const INGAME_CHAT_STATUS_LINE_WRAP_CLASS =
  "absolute flex items-center justify-center"
