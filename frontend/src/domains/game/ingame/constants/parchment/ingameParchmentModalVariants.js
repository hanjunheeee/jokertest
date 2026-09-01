import {
  INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS,
  INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
} from "./ingameParchmentConfirmButton.js"
import {
  INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
  INGAME_PARCHMENT_FRAME_CLASS,
} from "./ingameParchmentLayout.js"

const ROLE_REVEAL_PARCHMENT_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(48rem,96vw,158svh)] select-none"

const ROLE_REVEAL_PARCHMENT_FALLBACK_FRAME_CLASS =
  "pointer-events-auto relative w-[min(48rem,96vw)] rounded-lg border border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

/**
 * 인게임 파치먼트 모달 variant表.
 *
 * 역할 공개·밤 턴 안내·DAY/NIGHT 진입·밤 조사 결과가 같은 셸을 공유한다.
 * 각 feature overlay는 variant 키만 넘기고 본문(children)만 채운다.
 */
export const INGAME_PARCHMENT_MODAL_VARIANTS = Object.freeze({
  roleReveal: Object.freeze({
    animation: "parchment-unfold",
    backdropClass:
      "fixed inset-0 z-[55] cursor-default border-0 bg-black/65 p-0",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]",
    panelClass: "pointer-events-auto relative",
    dialogLabel: "내 역할 보기",
    backdropLabel: "내 역할 보기 닫기",
    parchmentFrameClass: ROLE_REVEAL_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: ROLE_REVEAL_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentClass: "gap-[clamp(0.625rem,1.6vw,0.875rem)]",
    confirmButtonClass: INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
    focusConfirmOnMount: false,
  }),
  phaseEntrance: Object.freeze({
    animation: "none",
    backdropClass: "fixed inset-0 z-[60] w-full cursor-default bg-black/70",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]",
    panelClass: "pointer-events-auto max-w-full",
    dialogLabel: "단계 전환 안내",
    backdropLabel: "단계 전환 안내 닫기",
    parchmentFrameClass: INGAME_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentClass: "",
    confirmButtonClass: INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS,
    focusConfirmOnMount: true,
  }),
  nightTurn: Object.freeze({
    animation: "scale",
    backdropClass:
      "fixed inset-0 z-[60] cursor-default border-0 bg-black/70 p-0",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]",
    panelClass: "pointer-events-auto relative",
    dialogLabel: "밤 역할 안내",
    backdropLabel: "밤 안내 닫기",
    parchmentFrameClass: INGAME_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentClass: "",
    confirmButtonClass: INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
    focusConfirmOnMount: false,
  }),
  nightPrivateResult: Object.freeze({
    animation: "none",
    backdropClass: "fixed inset-0 z-[65] w-full cursor-default bg-black/70",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]",
    panelClass: "pointer-events-auto max-w-full",
    dialogLabel: "밤 조사 결과",
    backdropLabel: "밤 조사 결과 닫기",
    parchmentFrameClass: INGAME_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentClass: "",
    confirmButtonClass: INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS,
    focusConfirmOnMount: true,
  }),
})

/** @param {keyof typeof INGAME_PARCHMENT_MODAL_VARIANTS} variantKey */
export function getInGameParchmentModalVariant(variantKey) {
  const variant = INGAME_PARCHMENT_MODAL_VARIANTS[variantKey]
  if (!variant) {
    throw new Error(`Unknown ingame parchment modal variant: ${variantKey}`)
  }
  return variant
}
