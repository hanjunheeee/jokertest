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
 * 인게임 파치먼트 모달 variant 표.
 *
 * 역할 공개·밤 턴 안내·DAY/NIGHT 진입이 같은 셸을 공유한다.
 * 각 feature overlay는 variant 키만 넘기고 본문(children)만 채운다.
 *
 * nightPrivateResult는 원격 UI가 밤 개인 조사 결과를 전용 오버레이로 뽑아낼 때 쓰는 키다 —
 * 이 저장소에서는 개인 결과를 아직 컨트롤 패널 안에서 보여주므로 참조하는 오버레이가 없다.
 * 원격 표와 어긋나지 않도록 값만 그대로 남겨둔다(표시되는 화면은 없다).
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
  // F-17(AC-06): 알림 모달. 인게임 전용 연출이 아니라 로비에서 열리지만, "양피지 셸 +
  // 닫기 + 긍정 버튼"이라는 기존 리소스를 그대로 쓰기 위해 같은 variant 표를 공유한다 —
  // 확인하지 않은 별도 알림 자산(벨 아이콘 등)을 있다고 가정하지 않는다.
  // 목록이 길 수 있으므로 내용 영역은 위에서부터 채우고(justify-start) 안쪽에서만
  // 스크롤한다(INGAME_PARCHMENT_CONTENT_CLASS가 이미 overflow-y-auto를 갖는다).
  notifications: Object.freeze({
    animation: "none",
    backdropClass: "fixed inset-0 z-[70] w-full cursor-default border-0 bg-black/70 p-0",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[71] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]",
    panelClass: "pointer-events-auto max-w-full",
    dialogLabel: "알림",
    backdropLabel: "알림 닫기",
    parchmentFrameClass: INGAME_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentClass: "justify-start",
    confirmButtonClass: INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS,
    focusConfirmOnMount: true,
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
