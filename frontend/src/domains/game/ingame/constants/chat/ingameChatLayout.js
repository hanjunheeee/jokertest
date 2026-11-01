/**
 * 인게임 채팅 공통 레이아웃 상수 + variant facade.
 *
 * InGameChatContent·InGameChatInput·InGameChatMessageList·InGameChatMessageRow에서 사용합니다.
 * 보드 전용: ingameChatBoardLayout.js — 클로즈업 전용: closeup/ingameChatCloseupLayout.js
 */
// node:test는 "@/" Vite 별칭을 해석하지 못한다(useSocket.js의 같은 이유) — 이 시험이
// 상대 경로로 실제 코드를 그대로 import해서 돌 수 있도록 상대 경로를 쓴다.
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../../shared/constants/customScrollbarStyles.js"
import {
  INGAME_CHAT_MESSAGE_LIST_INSET,
  INGAME_CHAT_MESSAGE_LIST_INSET_WITH_EMBEDDED_TIMER,
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

/** @param {"board" | "closeup" | "tribunal"} variant */
function isInGameChatCloseupLikeVariant(variant) {
  return variant === "closeup" || variant === "tribunal"
}

/** 인게임 채팅 — 입력·목록 공통 타이포 */
export const INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS =
  "font-subheading text-[clamp(0.72rem,3.2cqi,0.92rem)] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatTextTypographyClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_CLASS
    : INGAME_CHAT_TEXT_TYPOGRAPHY_CLASS
}

/** F-15(AC-02): 채팅 글자 크기 배율을 싣는 CSS 사용자 지정 속성 — 채팅 행·입력 래퍼에
 *  인라인으로 얹으면 자손 타이포가 상속받는다. */
export const INGAME_CHAT_TEXT_SCALE_CSS_VAR = "--ingame-chat-text-scale"

/**
 * F-15(AC-02): 타이포 클래스의 "배율 적용본".
 *
 * clamp(min, 선호, max)의 세 항 **전부**에 같은 배율을 곱한다 — 선호값만 바꾸고 경계를
 * 버리면(이전 구현) 배율을 낮춰도 원래 min에 걸려 작아지지 않고, 배율을 올려도 max에
 * 막히는 등 설정이 실제로 반영되지 않는 구간이 생긴다. 세 항을 함께 곱하면 원래의
 * 최소·최대 경계 관계(반응형 clamp 동작)를 그대로 유지한 채 크기만 이동한다.
 *
 * 인라인 font-size가 아니라 클래스로 두는 이유: Tailwind JIT는 소스를 정적으로 훑어
 * 유틸리티 CSS를 생성하므로, 런타임에 조합한 클래스 문자열은 빌드 산출물에 존재하지
 * 않는다. 그래서 여기서는 리터럴 문자열로 적고, 컴포넌트는 배율 숫자만
 * INGAME_CHAT_TEXT_SCALE_CSS_VAR로 내려준다. 변수가 없으면 fallback 1이라
 * calc(x*1) === x — 설정을 저장한 적 없는 화면은 기존과 완전히 동일하다.
 *
 * 아래 두 리터럴이 기본 타이포 클래스와 어긋나지 않는지는
 * __tests__/ingameChatLayout.test.js가 기본 클래스의 clamp 항을 직접 파싱해 대조한다.
 */
export const INGAME_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS =
  "font-subheading text-[clamp(calc(0.72rem*var(--ingame-chat-text-scale,1)),calc(3.2cqi*var(--ingame-chat-text-scale,1)),calc(0.92rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

/** 클로즈업 타이포의 배율 적용본 — 원본은 closeup/ingameChatCloseupLayout.js */
export const INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_SCALED_CLASS =
  "font-subheading text-[clamp(calc(0.95rem*var(--ingame-chat-text-scale,1)),calc(4.15cqi*var(--ingame-chat-text-scale,1)),calc(1.28rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

/**
 * 위 타이포 클래스가 쓰는 배율 적용 clamp 식 — 클래스 리터럴과 textarea 인라인 font-size가
 * 공유하는 **단일 출처**다.
 *
 * textarea는 이 클래스만으로는 크기를 못 받아 상속 16px로 떨어지는 문제가 있어
 * 인라인 font-size를 함께 얹는다. 이전 구현은 그 값을 클래스 문자열에서 정규식으로
 * 되파싱했는데(`inputClass.match(/text-\[(clamp\([^\]]+\))\]/)`), 값 안에 `]`가 없다는 가정과
 * 유틸리티 순서에 기대고 있어 타이포 클래스를 조금만 손대도 조용히 undefined가 되어
 * 16px 결함이 되살아난다. 그래서 식을 여기 한 번만 적고 클래스·인라인 양쪽이 이것을 쓴다.
 *
 * 클래스 리터럴은 Tailwind JIT가 소스를 정적으로 훑어야 하므로 템플릿으로 조립하지 않고
 * 그대로 둔다 — 대신 리터럴이 정확히 `text-[이 값]`을 담고 있는지를
 * __tests__/ingameChatLayout.test.js가 대조한다.
 */
export const INGAME_CHAT_TEXT_SCALED_FONT_SIZE =
  "clamp(calc(0.72rem*var(--ingame-chat-text-scale,1)),calc(3.2cqi*var(--ingame-chat-text-scale,1)),calc(0.92rem*var(--ingame-chat-text-scale,1)))"

/** 클로즈업 타이포의 배율 적용 clamp 식 */
export const INGAME_CHAT_CLOSEUP_TEXT_SCALED_FONT_SIZE =
  "clamp(calc(0.95rem*var(--ingame-chat-text-scale,1)),calc(4.15cqi*var(--ingame-chat-text-scale,1)),calc(1.28rem*var(--ingame-chat-text-scale,1)))"

/** 타이포 클래스와 같은 값을 쓰는 font-size 식 — 인라인 style이 필요한 곳(textarea)이 쓴다.
 *  @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatScaledFontSize(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_SCALED_FONT_SIZE
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_SCALED_FONT_SIZE
    : INGAME_CHAT_TEXT_SCALED_FONT_SIZE
}

/** 채팅 본문·입력이 실제로 쓰는 타이포 클래스 — 배율 변수를 반영한다.
 *  @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatScaledTypographyClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_SCALED_CLASS
    : INGAME_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS
}

/**
 * 채팅 글자 크기 설정값을 배율 CSS 변수 인라인 스타일로 바꾼다 — 보드·클로즈업 어느
 * variant든 같은 변수를 쓰므로 호출부는 행·입력 래퍼에 그대로 얹기만 하면 된다.
 * @param {number} chatTextSize
 * @returns {Record<string, string>}
 */
export function getInGameChatTextScaleStyle(chatTextSize) {
  return { [INGAME_CHAT_TEXT_SCALE_CSS_VAR]: String(getInGameChatTextScale(chatTextSize)) }
}

const CHAT_TEXT_SCALE_MIN = 0.6
const CHAT_TEXT_SCALE_MAX = 1

/**
 * F-15(AC-02): 채팅 글자 크기 설정(ingameSettingData.js의 INGAME_SETTING_CHAT_SLIDER,
 * 0~100·기본값 100)을 실제 폰트 배율로 바꾼다. 슬라이더 최댓값(기본값)이 배율 1(기존
 * 화면과 동일)이 되도록 해서, 이 설정을 저장한 적 없는 기존 사용자·시험에는 시각적
 * 차이가 없다 — 슬라이더를 낮출수록 최대 40%까지만 줄어드는 좁은 범위로 제한한다.
 * @param {number} chatTextSize
 */
export function getInGameChatTextScale(chatTextSize) {
  const n = Number(chatTextSize)
  if (!Number.isFinite(n)) return 1

  const clamped = Math.min(100, Math.max(0, n))
  const ratio = clamped / 100
  return CHAT_TEXT_SCALE_MIN + (CHAT_TEXT_SCALE_MAX - CHAT_TEXT_SCALE_MIN) * ratio
}

/** F-15(AC-02): "채팅 시간 표시"가 켜졌을 때 sentAt을 그리는 시각 표기 — 발신자 접두사와
 *  같은 타이포를 쓰되 흐리게 표시해 본문과 구분한다.
 *  @param {"board" | "closeup"} [variant] */
export function getInGameChatMessageTimeClass(variant = "board") {
  return `shrink-0 opacity-60 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatScaledTypographyClass(variant)}`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputClass(variant = "board") {
  return `block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#4a2814] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${getInGameChatScaledTypographyClass(variant)}`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatInputPlaceholderClass(variant = "board") {
  return `pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ${INGAME_CHAT_INPUT_WRAP_TRIM_CLASS} ${getInGameChatScaledTypographyClass(variant)} text-[#4a2814]`
}

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatTextWrapTrimClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_TEXT_WRAP_TRIM_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_TEXT_WRAP_TRIM_CLASS
    : INGAME_CHAT_TEXT_WRAP_TRIM_CLASS
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatMessageBodyClass(variant = "board") {
  return `min-w-0 box-border ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatScaledTypographyClass(variant)} ${INGAME_CHAT_TEXT_WRAP_CLASS} ${getInGameChatTextWrapTrimClass(variant)}`
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatMessageSenderClass(variant = "board") {
  return `shrink-0 ${INGAME_CHAT_MESSAGE_READ_ONLY_CLASS} ${getInGameChatScaledTypographyClass(variant)}`
}

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatInputSingleLineHeightClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_INPUT_SINGLE_LINE_HEIGHT_CLASS
    : INGAME_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS
}

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatInputViewportFixedHeightClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS
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

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatInputShiftClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_INPUT_SHIFT_CLASS
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

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatSendButtonClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_SEND_BUTTON_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_CLASS
    : INGAME_CHAT_SEND_BUTTON_CLASS
}

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatSendButtonLabelClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_SEND_BUTTON_LABEL_CLASS
  return variant === "closeup"
    ? INGAME_CHAT_CLOSEUP_SEND_BUTTON_LABEL_CLASS
    : INGAME_CHAT_SEND_BUTTON_LABEL_CLASS
}

/** @param {"board" | "closeup" | "tribunal"} [variant] */
export function getInGameChatSendButtonShiftClass(variant = "board") {
  if (variant === "tribunal") return INGAME_TRIBUNAL_CHAT_SEND_BUTTON_SHIFT_CLASS
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

/**
 * @param {"board" | "closeup"} [variant]
 * @param {{ withEmbeddedPhaseTimer?: boolean }} [options]
 */
export function getInGameChatMessageListInset(variant = "board", options = {}) {
  const { withEmbeddedPhaseTimer = false } = options
  if (isInGameChatCloseupLikeVariant(variant)) {
    return INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET
  }
  if (withEmbeddedPhaseTimer) {
    return INGAME_CHAT_MESSAGE_LIST_INSET_WITH_EMBEDDED_TIMER
  }
  return INGAME_CHAT_MESSAGE_LIST_INSET
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatTextFieldInset(variant = "board") {
  return isInGameChatCloseupLikeVariant(variant)
    ? INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET
    : INGAME_CHAT_TEXT_FIELD_INSET
}

/** @param {"board" | "closeup"} [variant] */
export function getInGameChatStatusLineInset(variant = "board") {
  return isInGameChatCloseupLikeVariant(variant)
    ? INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET
    : INGAME_CHAT_STATUS_LINE_INSET
}

/** InGameChatContent — 상태·오류 문구 줄 래퍼 */
export const INGAME_CHAT_STATUS_LINE_WRAP_CLASS =
  "absolute flex items-center justify-center"
