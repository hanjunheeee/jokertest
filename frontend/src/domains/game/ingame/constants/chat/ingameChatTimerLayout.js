// 채팅 틀 안쪽 단계 타이머 모양: 타이머 자리·층, 타이머 켜면 메시지 목록 내리는 값
// 단계 타이머 묶음(InGamePhaseTurnTimerPanel)·판 위 채팅 모양 상수가 사용
import {
  CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "./ingameChatFrameLayout.js"
import { INGAME_TIMEBAR_ASSETS } from "../timebar/ingameTimebarAssets.js"

// 타이머 켜면 메시지 목록 위를 이만큼 내리고 높이도 같은 만큼 줄임 (틀 기준 %)
export const EMBEDDED_TIMER_LIST_OFFSET_FRAME = 12

const EMBEDDED_TIMER_STACK_INSET_FRAME_BOARD = {
  top: 0.5,
  left: 2 + CONTENT_SHIFT_LEFT_FRAME,
  right: 10,
  height: 21,
}

const EMBEDDED_TIMER_STACK_INSET_FRAME_CLOSEUP = {
  top: -5,
  left: 2 + CONTENT_SHIFT_LEFT_FRAME,
  right: 10,
  height: 22,
}

// 채팅 틀 안, 메시지 목록 위 층
export const EMBEDDED_TIMER_WRAP_CLASS =
  "pointer-events-none absolute z-[4] flex min-h-0 flex-col items-center justify-end gap-0 [container-type:inline-size]"

const EMBEDDED_TIMER_WRAP_CLASS_CLOSEUP =
  `${EMBEDDED_TIMER_WRAP_CLASS} -translate-y-[4%]`

const EMBEDDED_PHASE_HEADER_WRAP_BOARD =
  "pointer-events-none relative z-[5] w-[clamp(10.2rem,86cqi,14.5rem)] shrink-0 -translate-y-[22%]"

const EMBEDDED_PHASE_HEADER_WRAP_CLOSEUP =
  "pointer-events-none relative z-[5] w-[clamp(20rem,46cqi,33rem)] shrink-0 -translate-y-[6%]"

const EMBEDDED_PHASE_HEADER_TITLE_CLOSEUP =
  "pointer-events-none absolute inset-0 flex items-start justify-center px-[9%] pt-[10.5%] text-center font-subheading text-[clamp(1rem,3.15cqi,1.48rem)] font-bold leading-tight tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

const EMBEDDED_TIMER_BODY_BOARD =
  "relative z-[4] mt-[clamp(-0.35rem,-1.6cqi,-0.15rem)] w-full h-[clamp(2.05rem,11.5cqi,3.15rem)] shrink-0 [container-type:inline-size]"

/** 클로즈업: 고정 높이·너비 비율 — flex-1로 세로 늘어나며 게이지가 찌그러지지 않게 */
const EMBEDDED_TIMER_BODY_CLOSEUP =
  "relative z-[4] mx-auto mt-[clamp(-0.45rem,-1.1cqi,-0.2rem)] w-[min(100%,clamp(32rem,92cqi,58rem))] h-[clamp(2.85rem,7.2cqi,4.1rem)] shrink-0 [container-type:inline-size]"

/** 클로즈업 MM:SS — 크게, 시계 칸 쪽으로 약간 왼쪽 */
const EMBEDDED_TIMER_DIGITS_CLASS_CLOSEUP =
  "pointer-events-none absolute right-[7%] top-1/2 z-[4] -translate-y-1/2 font-display text-[clamp(1.05rem,4.65cqi,1.55rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

/** 클로즈업: 너비(cqi)만 키우면 max에 막혀 잘 안 커짐 → 타이머 틀 높이 % 기준 */
const EMBEDDED_TIMER_MARKER_CLASS_CLOSEUP =
  "pointer-events-none absolute top-1/2 z-[3] block h-[clamp(2.1rem,82%,4.15rem)] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none transition-opacity duration-300 ease-linear"

/**
 * @param {"board" | "closeup"} [embeddedLayout]
 */
export function getEmbeddedChatTimerLayout(embeddedLayout = "board") {
  if (embeddedLayout === "closeup") {
    return {
      stackInset: mapFrameInsetToLayoutBox(EMBEDDED_TIMER_STACK_INSET_FRAME_CLOSEUP),
      wrapClass: EMBEDDED_TIMER_WRAP_CLASS_CLOSEUP,
      phaseHeaderWrapClass: EMBEDDED_PHASE_HEADER_WRAP_CLOSEUP,
      phaseHeaderTitleClass: EMBEDDED_PHASE_HEADER_TITLE_CLOSEUP,
      timerBodyClass: EMBEDDED_TIMER_BODY_CLOSEUP,
      timerDigitsClass: EMBEDDED_TIMER_DIGITS_CLASS_CLOSEUP,
      timerMarkerClass: EMBEDDED_TIMER_MARKER_CLASS_CLOSEUP,
      phaseHeaderPlateSrc: INGAME_TIMEBAR_ASSETS.phaseHeaderPlateChatCloseup,
    }
  }

  return {
    stackInset: mapFrameInsetToLayoutBox(EMBEDDED_TIMER_STACK_INSET_FRAME_BOARD),
    wrapClass: EMBEDDED_TIMER_WRAP_CLASS,
    phaseHeaderWrapClass: EMBEDDED_PHASE_HEADER_WRAP_BOARD,
    phaseHeaderTitleClass: null,
    phaseHeaderPlateSrc: INGAME_TIMEBAR_ASSETS.phaseHeaderPlate,
    timerBodyClass: EMBEDDED_TIMER_BODY_BOARD,
    timerDigitsClass: null,
    timerMarkerClass: null,
  }
}
