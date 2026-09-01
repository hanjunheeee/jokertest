/**
 * 역할 공개 오버레이 — 본문(닉네임·역할·설명·동료) 타이포그래피만 담는다.
 * 셸·확인 버튼·z-index는 constants/parchment/ingameParchmentModalVariants.js가 담당한다.
 */

export const INGAME_ROLE_REVEAL_HEADER_CLASS =
  "w-full space-y-1 border-b border-[#6b4321]/40 pb-[clamp(0.45rem,1.2vw,0.65rem)]"

export const INGAME_ROLE_REVEAL_NICKNAME_CLASS =
  "text-[clamp(1.05rem,2.65vw,1.25rem)] font-semibold tracking-wide text-[#5b3a20]"

export const INGAME_ROLE_REVEAL_ROLE_NAME_CLASS =
  "font-display text-[clamp(1.65rem,4.8vw,2.65rem)] font-medium tracking-wide text-[#3a1a0c] antialiased"

export const INGAME_ROLE_REVEAL_DESCRIPTION_CLASS =
  "text-[clamp(0.88rem,2.2vw,1.02rem)] leading-relaxed text-[#4a2c14]"

export const INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS =
  "w-full rounded border border-[#6b4321]/35 bg-black/5 p-[clamp(0.45rem,1.2vw,0.65rem)] text-[clamp(0.78rem,1.9vw,0.9rem)] text-[#4a2c14]"

export const INGAME_ROLE_REVEAL_ALLY_LIST_CLASS =
  "mt-1 flex flex-wrap justify-center gap-1.5"

export const INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS =
  "rounded-full border border-[#6b4321]/40 bg-[#3a1a0c]/10 px-[clamp(0.45rem,1.1vw,0.6rem)] py-[clamp(0.15rem,0.45vw,0.25rem)] text-[clamp(0.76rem,1.85vw,0.88rem)]"
