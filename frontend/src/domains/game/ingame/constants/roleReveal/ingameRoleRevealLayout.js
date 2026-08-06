/**
 * 파치먼트 역할 공개 오버레이 레이아웃.
 *
 * InGameRoleRevealOverlay에서 사용합니다. InGameChatCloseupOverlay의 dim 배경 + 중앙 패널
 * 관례를 그대로 따르고, 패널 배경은 공용 파치먼트 셸(InGameParchmentPanel)에 위임합니다 —
 * 배경 이미지·가로세로비·안쪽 여백은 constants/parchment/ingameParchmentLayout.js가 담당하고
 * 이 파일에는 역할 공개 화면 고유의 타이포그래피만 남깁니다.
 */

export const INGAME_ROLE_REVEAL_BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-black/65 p-0"

export const INGAME_ROLE_REVEAL_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

// 패널 자체의 배경/크기는 InGameParchmentPanel이 담당한다 — 여기서는 오버레이 내부 위치와
// 클릭 대상만 정의한다(dim 배경 위에 떠 있는 파치먼트 한 장).
export const INGAME_ROLE_REVEAL_PANEL_CLASS = "pointer-events-auto relative"

export const INGAME_ROLE_REVEAL_HEADER_CLASS =
  "w-full space-y-0.5 border-b border-[#6b4321]/40 pb-2"

export const INGAME_ROLE_REVEAL_NICKNAME_CLASS =
  "text-xs font-semibold tracking-wide text-[#5b3a20]"

export const INGAME_ROLE_REVEAL_ROLE_NAME_CLASS =
  "font-subheading text-xl font-bold tracking-wide text-[#3a1a0c]"

export const INGAME_ROLE_REVEAL_TEAM_BADGE_CLASS =
  "mt-1 inline-block rounded-full border border-[#6b4321]/50 bg-[#3a1a0c]/10 px-3 py-0.5 text-[0.7rem] font-semibold tracking-wide text-[#5b3a20]"

export const INGAME_ROLE_REVEAL_DESCRIPTION_CLASS =
  "text-[0.8rem] leading-relaxed text-[#4a2c14]"

export const INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS =
  "w-full rounded border border-[#6b4321]/35 bg-black/5 p-1.5 text-xs text-[#4a2c14]"

export const INGAME_ROLE_REVEAL_ALLY_LIST_CLASS =
  "mt-1 flex flex-wrap justify-center gap-1.5"

export const INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS =
  "rounded-full border border-[#6b4321]/40 bg-[#3a1a0c]/10 px-2 py-0.5"

export const INGAME_ROLE_REVEAL_PRIMARY_BUTTON_CLASS =
  "mt-1 min-h-9 w-[min(14rem,100%)] rounded border border-[#6b4321] bg-[#3a1a0c] px-4 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:bg-[#5b3a20]"

/** 패널이 파치먼트처럼 펼쳐지는 기본 애니메이션 트랜지션 */
export const INGAME_ROLE_REVEAL_PANEL_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
}

/** prefers-reduced-motion일 때의 대체 트랜지션 — scale/이동 없이 아주 짧게 opacity만 */
export const INGAME_ROLE_REVEAL_PANEL_REDUCED_TRANSITION = {
  duration: 0.01,
}
