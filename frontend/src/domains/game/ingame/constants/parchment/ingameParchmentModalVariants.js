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

// ---------------------------------------------------------------------------
// F-17(AC-06) 알림 모달 전용 치수 — 실제 Chrome 1920x855 재현 결함 보수.
//
// 관측된 결함: 알림 4건이 쌓이면 공용 안쪽 영역(INGAME_PARCHMENT_CONTENT_CLASS)이
// scrollHeight 743 / clientHeight 427로 넘쳐 **내용 전체**가 하나의 스크롤 상자가 됐다.
// 그 상태에서 셸의 focusConfirmOnMount가 맨 아래 닫기 버튼으로 초점을 옮기자 브라우저가
// 그 상자를 scrollTop 270까지 끌어내려, 제목과 가장 새 알림이 화면 위로 밀려나고 행들이
// 양피지 그림 밖에 그려졌다.
//
// 여기서 고치는 것은 **알림 variant의 치수뿐**이다. 다른 모달(역할 공개·밤 턴·DAY/NIGHT·
// 밤 조사 결과)은 이 파일의 자기 항목을 그대로 쓰므로 영향을 받지 않는다.
//
// 1) 프레임을 역할 공개와 같은 48rem 급으로 키운다 — 같은 양피지 그림을 그대로 쓰되
//    목록이 들어갈 종이 면적을 넓힌다(새 자산을 만들지 않는다).
// 2) 안쪽 영역을 inset 백분율로 잡는다. 공용 py-[17%]는 **세로 여백도 프레임 가로폭의
//    17%**라(CSS 백분율 padding 규칙) 3:2 그림에서 위아래를 각각 높이의 25.5%나 먹었다.
//    inset-y는 높이 기준이라 같은 안전 영역(그림의 종이 면적은 세로 약 12%~84%)을
//    지키면서 실제로 쓸 수 있는 높이가 늘어난다.
// 3) 안쪽 영역 자체는 스크롤하지 않는다(overflow-hidden). 제목과 닫기 버튼은 고정하고
//    가운데 목록만 따로 스크롤한다(NotificationModal.js) — 초점이 닫기 버튼으로 가도
//    바깥 상자가 끌려 내려갈 여지가 없다.
const NOTIFICATIONS_PARCHMENT_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(48rem,94vw,150svh)] select-none"

const NOTIFICATIONS_PARCHMENT_FALLBACK_FRAME_CLASS =
  "pointer-events-auto relative w-[min(48rem,94vw)] rounded-lg border border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

const NOTIFICATIONS_PARCHMENT_CONTENT_CLASS =
  "absolute inset-x-[15%] inset-y-[13.5%] flex flex-col items-center gap-[clamp(0.25rem,0.8vw,0.5rem)] overflow-hidden text-center text-[#3a1a0c]"

// 이미지 로딩 실패 대체 패널도 같은 3단 구조(고정 제목 · 스크롤 목록 · 고정 닫기)를
// 유지한다. 일반 흐름 박스라 높이가 내용으로 정해지므로 최대 높이만 제한한다.
const NOTIFICATIONS_PARCHMENT_FALLBACK_CONTENT_CLASS =
  "flex max-h-[80svh] flex-col items-center gap-[clamp(0.25rem,0.8vw,0.5rem)] overflow-hidden px-6 py-7 text-center text-[#3a1a0c]"

// 닫기 버튼은 세로로 눌리지 않는 고정 요소다(shrink-0) — 줄어드는 쪽은 목록이어야 한다.
const NOTIFICATIONS_CONFIRM_BUTTON_CLASS =
  `${INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS} shrink-0`

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
  //
  // 이 항목만 안쪽 영역 기본 클래스를 바꿔 쓴다(parchmentContentBaseClass). 공용
  // INGAME_PARCHMENT_CONTENT_CLASS를 뒤에 덧붙이는 방식으로는 못 고친다 — overflow·inset·
  // padding은 Tailwind 생성 순서가 승자를 정해서 class 문자열 뒤에 쓴다고 이기지 않는다.
  // 위 NOTIFICATIONS_* 주석에 실제 재현 결함과 수치를 적어 두었다.
  notifications: Object.freeze({
    animation: "none",
    backdropClass: "fixed inset-0 z-[70] w-full cursor-default border-0 bg-black/70 p-0",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[71] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]",
    panelClass: "pointer-events-auto max-w-full",
    dialogLabel: "알림",
    backdropLabel: "알림 닫기",
    parchmentFrameClass: NOTIFICATIONS_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: NOTIFICATIONS_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentBaseClass: NOTIFICATIONS_PARCHMENT_CONTENT_CLASS,
    parchmentFallbackContentBaseClass: NOTIFICATIONS_PARCHMENT_FALLBACK_CONTENT_CLASS,
    parchmentContentClass: "",
    confirmButtonClass: NOTIFICATIONS_CONFIRM_BUTTON_CLASS,
    // 초점은 계속 모달 안(닫기 버튼)으로 들어온다 — 키보드 사용자가 Tab으로 되짚어 오지
    // 않게 하려면 필요하다. 이제 닫기 버튼이 스크롤되지 않는 고정 영역에 있으므로 초점
    // 이동이 바깥 상자를 끌어내리지 못한다.
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
  // 매칭 대기 — 게임 시작 불가 안내(양피지 모달.png + 확인 버튼(수락 및 긍정).png).
  gameStartBlocked: Object.freeze({
    animation: "none",
    backdropClass: "absolute inset-0 z-40 w-full cursor-default border-0 bg-black/70 p-0",
    wrapClass:
      "pointer-events-none absolute inset-0 z-[41] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]",
    panelClass: "pointer-events-auto max-w-full",
    dialogLabel: "게임 시작 불가",
    backdropLabel: "게임 시작 불가 안내 닫기",
    parchmentFrameClass: INGAME_PARCHMENT_FRAME_CLASS,
    parchmentFallbackFrameClass: INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
    parchmentContentClass: "",
    confirmButtonClass: INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS,
    focusConfirmOnMount: true,
  }),
  // F-33 E-2: 마이페이지 이모티콘 팔레트 저장 성공 안내 — 양피지 모달.png 공용 셸.
  emoticonPaletteSave: Object.freeze({
    animation: "none",
    backdropClass: "fixed inset-0 z-[80] w-full cursor-default border-0 bg-black/70 p-0",
    wrapClass:
      "pointer-events-none fixed inset-0 z-[81] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]",
    panelClass: "pointer-events-auto max-w-full",
    dialogLabel: "팔레트 저장",
    backdropLabel: "팔레트 저장 안내 닫기",
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
