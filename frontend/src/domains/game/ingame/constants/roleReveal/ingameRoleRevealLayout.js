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
  "w-full space-y-1 border-b border-[#6b4321]/40 pb-[clamp(0.45rem,1.2vw,0.65rem)]"

export const INGAME_ROLE_REVEAL_NICKNAME_CLASS =
  "text-[clamp(1.05rem,2.65vw,1.25rem)] font-semibold tracking-wide text-[#5b3a20]"

export const INGAME_ROLE_REVEAL_ROLE_NAME_CLASS =
  "font-display text-[clamp(1.65rem,4.8vw,2.65rem)] font-medium tracking-wide text-[#3a1a0c] antialiased"

export const INGAME_ROLE_REVEAL_TEAM_BADGE_CLASS =
  "mt-1 inline-block rounded-full border border-[#6b4321]/50 bg-[#3a1a0c]/10 px-3 py-0.5 text-[0.7rem] font-semibold tracking-wide text-[#5b3a20]"

export const INGAME_ROLE_REVEAL_DESCRIPTION_CLASS =
  "text-[clamp(0.88rem,2.2vw,1.02rem)] leading-relaxed text-[#4a2c14]"

export const INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS =
  "w-full rounded border border-[#6b4321]/35 bg-black/5 p-[clamp(0.45rem,1.2vw,0.65rem)] text-[clamp(0.78rem,1.9vw,0.9rem)] text-[#4a2c14]"

export const INGAME_ROLE_REVEAL_ALLY_LIST_CLASS =
  "mt-1 flex flex-wrap justify-center gap-1.5"

export const INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS =
  "rounded-full border border-[#6b4321]/40 bg-[#3a1a0c]/10 px-[clamp(0.45rem,1.1vw,0.6rem)] py-[clamp(0.15rem,0.45vw,0.25rem)] text-[clamp(0.76rem,1.85vw,0.88rem)]"

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
