// 명패+시간패널: 통합 채팅 패널(텍스트만) · 시간 바 위 스트립(옛 프레임 그림)
// 단계 타이머 묶음(InGamePhaseTurnTimerPanel)이 사용
import { mapFrameInsetToLayoutBox } from "./ingameChatFrameLayout.js"
import { INGAME_CHAT_USE_UNIFIED_PANEL } from "./ingameChatAssets.js"

// 통합 패널이면 목록을 추가로 내리지 않음 (명패·타이머가 틀 안에 있음)
export const EMBEDDED_TIMER_LIST_OFFSET_FRAME = INGAME_CHAT_USE_UNIFIED_PANEL ? 0 : 9

/** 통합 패널 상단 명패·타이머 텍스트 영역 (틀 기준) */
const UNIFIED_PANEL_HEADER_INSET_FRAME = {
  top: 1.2,
  left: 4.5,
  right: 4.5,
  height: 11.5,
}

/** 채팅 틀 위에 겹치는 옛 스트립 (시간 바 전용) */
const EMBEDDED_TIMER_STACK_INSET_FRAME_TIMEBAR = {
  top: -9.5,
  left: 14,
  right: 0,
}

const LEGACY_STRIP_STACK_INSET_FRAME_BOARD = {
  top: -4,
  left: 4.5,
  right: 4.5,
}

const LEGACY_STRIP_STACK_INSET_FRAME_CLOSEUP = {
  top: -3.5,
  left: 5,
  right: 5,
}

const LEGACY_STRIP_SRC =
  "/frame/ingame-chatting/명패+시간패널 프레임.png"

const UNIFIED_HEADER_WRAP_CLASS =
  "pointer-events-none absolute z-[6] flex min-h-0 items-stretch justify-center [container-type:inline-size]"

const LEGACY_STRIP_WRAP_CLASS =
  "pointer-events-none absolute z-[6] flex min-h-0 items-center justify-center [container-type:inline-size]"

const LEGACY_STRIP_WRAP_CLASS_TIMEBAR =
  "pointer-events-none absolute z-[6] flex min-h-0 items-center justify-end [container-type:inline-size]"

const UNIFIED_FRAME_IMAGE_CLASS =
  "block h-auto w-full select-none"

const LEGACY_STRIP_CLASS_BOARD =
  "pointer-events-none relative z-[6] mx-auto w-[92%] -translate-y-[28%] shrink-0 [container-type:inline-size]"

const LEGACY_STRIP_CLASS_CLOSEUP =
  "pointer-events-none relative z-[6] mx-auto w-[92%] -translate-y-[26%] shrink-0 [container-type:inline-size]"

const UNIFIED_STATUS_CLASS_PANEL =
  "pointer-events-none absolute left-[21%] top-[46%] z-[2] flex w-[37%] -translate-y-1/2 items-center justify-center px-[3%] text-center font-display text-[clamp(0.78rem,4.35cqi,1.14rem)] font-medium leading-tight tracking-normal text-[#2a1810] antialiased [text-shadow:0_1px_0_rgba(255,255,255,0.55),0_0_1px_rgba(42,24,16,0.4)]"

const UNIFIED_DIGITS_CLASS_PANEL =
  "pointer-events-none absolute right-[7.5%] top-[48%] z-[2] w-[20%] -translate-y-1/2 text-center font-display text-[clamp(0.78rem,4.35cqi,1.12rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

const UNIFIED_STATUS_CLASS_CLOSEUP =
  "pointer-events-none absolute left-[21%] top-[46%] z-[2] flex w-[37%] -translate-y-1/2 items-center justify-center px-[4%] text-center font-display text-[clamp(1.38rem,5.65cqi,2.28rem)] font-medium leading-tight tracking-normal text-[#2a1810] antialiased [text-shadow:0_1px_0_rgba(255,255,255,0.55),0_0_1px_rgba(42,24,16,0.4)]"

const UNIFIED_DIGITS_CLASS_CLOSEUP =
  "pointer-events-none absolute right-[7.5%] top-[48%] z-[2] w-[21%] -translate-y-1/2 text-center font-display text-[clamp(1.05rem,5.1cqi,1.68rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

const LEGACY_STATUS_CLASS_BOARD =
  "pointer-events-none absolute left-[5%] top-1/2 z-[2] flex w-[58%] translate-x-[7%] translate-y-[calc(-50%+0.22em)] items-center justify-center px-[5%] text-center font-subheading text-[clamp(0.76rem,4.15cqi,1.1rem)] font-bold leading-tight tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

const LEGACY_DIGITS_CLASS_BOARD =
  "pointer-events-none absolute right-[6.5%] top-1/2 z-[2] w-[23%] -translate-x-[5%] translate-y-[calc(-50%+0.1em)] text-center font-display text-[clamp(0.8rem,4.4cqi,1.16rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

const LEGACY_STATUS_CLASS_CLOSEUP =
  "pointer-events-none absolute left-[5%] top-1/2 z-[2] flex w-[58%] translate-x-[7%] translate-y-[calc(-50%+0.22em)] items-center justify-center px-[6%] text-center font-subheading text-[clamp(1.22rem,4.55cqi,1.95rem)] font-bold leading-tight tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

const LEGACY_DIGITS_CLASS_CLOSEUP =
  "pointer-events-none absolute right-[6.5%] top-1/2 z-[2] w-[24%] -translate-x-[5%] translate-y-[calc(-50%+0.2em)] text-center font-display text-[clamp(1.18rem,5.35cqi,1.82rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

const LEGACY_STRIP_CLASS_TIMEBAR =
  "pointer-events-none relative z-[6] w-[min(100%,clamp(11.8rem,100cqi,17.2rem))] -translate-y-[40%] shrink-0 [container-type:inline-size]"

const LEGACY_STATUS_CLASS_TIMEBAR =
  "pointer-events-none absolute left-[5%] top-1/2 z-[2] flex w-[58%] translate-x-[7%] translate-y-[calc(-50%+0.22em)] items-center justify-center px-[5%] text-center font-subheading text-[clamp(0.74rem,4.05cqi,1.08rem)] font-bold leading-tight tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

const LEGACY_DIGITS_CLASS_TIMEBAR =
  "pointer-events-none absolute right-[6.5%] top-1/2 z-[2] w-[23%] -translate-x-[5%] translate-y-[calc(-50%+0.22em)] text-center font-display text-[clamp(0.78rem,4.25cqi,1.14rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

function mapTimebarTimerStackInset(inset) {
  return {
    top: `${inset.top}%`,
    left: `${inset.left}%`,
    right: `${inset.right}%`,
  }
}

function chatPanelHeaderLayout(embeddedLayout) {
  const isCloseup = embeddedLayout === "closeup"
  return {
    stackInset: mapFrameInsetToLayoutBox(UNIFIED_PANEL_HEADER_INSET_FRAME),
    wrapClass: UNIFIED_HEADER_WRAP_CLASS,
    showStripFrameImage: false,
    unifiedFrameSrc: null,
    unifiedStripClass: "relative h-full w-full",
    unifiedFrameImageClass: UNIFIED_FRAME_IMAGE_CLASS,
    unifiedStatusClass: isCloseup ? UNIFIED_STATUS_CLASS_CLOSEUP : UNIFIED_STATUS_CLASS_PANEL,
    unifiedDigitsClass: isCloseup ? UNIFIED_DIGITS_CLASS_CLOSEUP : UNIFIED_DIGITS_CLASS_PANEL,
  }
}

function legacyStripLayout(embeddedLayout) {
  if (embeddedLayout === "closeup") {
    return {
      stackInset: mapFrameInsetToLayoutBox(LEGACY_STRIP_STACK_INSET_FRAME_CLOSEUP),
      wrapClass: LEGACY_STRIP_WRAP_CLASS,
      showStripFrameImage: true,
      unifiedFrameSrc: LEGACY_STRIP_SRC,
      unifiedStripClass: LEGACY_STRIP_CLASS_CLOSEUP,
      unifiedFrameImageClass: UNIFIED_FRAME_IMAGE_CLASS,
      unifiedStatusClass: LEGACY_STATUS_CLASS_CLOSEUP,
      unifiedDigitsClass: LEGACY_DIGITS_CLASS_CLOSEUP,
    }
  }
  return {
    stackInset: mapFrameInsetToLayoutBox(LEGACY_STRIP_STACK_INSET_FRAME_BOARD),
    wrapClass: LEGACY_STRIP_WRAP_CLASS,
    showStripFrameImage: true,
    unifiedFrameSrc: LEGACY_STRIP_SRC,
    unifiedStripClass: LEGACY_STRIP_CLASS_BOARD,
    unifiedFrameImageClass: UNIFIED_FRAME_IMAGE_CLASS,
    unifiedStatusClass: LEGACY_STATUS_CLASS_BOARD,
    unifiedDigitsClass: LEGACY_DIGITS_CLASS_BOARD,
  }
}

const MOBILE_STRIP_WRAP_CLASS =
  "pointer-events-none relative z-[6] flex w-full justify-center [container-type:inline-size]"

const MOBILE_STRIP_CLASS =
  "pointer-events-none relative z-[6] mx-auto w-[min(100%,94cqi)] shrink-0 [container-type:inline-size]"

function mobileStripLayout() {
  return {
    wrapClass: MOBILE_STRIP_WRAP_CLASS,
    showStripFrameImage: true,
    unifiedFrameSrc: LEGACY_STRIP_SRC,
    unifiedStripClass: MOBILE_STRIP_CLASS,
    unifiedFrameImageClass: UNIFIED_FRAME_IMAGE_CLASS,
    unifiedStatusClass: LEGACY_STATUS_CLASS_BOARD,
    unifiedDigitsClass: LEGACY_DIGITS_CLASS_BOARD,
  }
}

function resolveEmbeddedChatTimerLayout(embeddedLayout = "board") {
  if (embeddedLayout === "mobile") {
    return mobileStripLayout()
  }

  if (embeddedLayout === "timebar") {
    return {
      stackInset: mapTimebarTimerStackInset(EMBEDDED_TIMER_STACK_INSET_FRAME_TIMEBAR),
      wrapClass: LEGACY_STRIP_WRAP_CLASS_TIMEBAR,
      showStripFrameImage: true,
      unifiedFrameSrc: LEGACY_STRIP_SRC,
      unifiedStripClass: LEGACY_STRIP_CLASS_TIMEBAR,
      unifiedFrameImageClass: UNIFIED_FRAME_IMAGE_CLASS,
      unifiedStatusClass: LEGACY_STATUS_CLASS_TIMEBAR,
      unifiedDigitsClass: LEGACY_DIGITS_CLASS_TIMEBAR,
    }
  }

  if (INGAME_CHAT_USE_UNIFIED_PANEL) {
    if (embeddedLayout === "closeup") return chatPanelHeaderLayout("closeup")
    return chatPanelHeaderLayout("board")
  }

  if (embeddedLayout === "tribunal") {
    return legacyStripLayout("board")
  }

  if (embeddedLayout === "closeup") {
    return legacyStripLayout("closeup")
  }

  return legacyStripLayout("board")
}

/**
 * @param {"board" | "closeup" | "tribunal" | "timebar" | "mobile"} [embeddedLayout]
 */
export function getEmbeddedChatTimerLayout(embeddedLayout = "board") {
  return resolveEmbeddedChatTimerLayout(embeddedLayout)
}