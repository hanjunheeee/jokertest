// 내 역할 보기 창 모양: 머리·역할 이름·설명·그림·같은 편 목록
// 내 역할 보기 창(InGameRoleRevealOverlay)이 사용

// 덮개와 가운데 판
export const BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-black/65 p-0"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const PANEL_CLASS = "pointer-events-auto relative"

// 머리·닉네임·역할 이름·진영 표·설명 (양피지 위라 글은 전부 역할 이름과 같은 짙은 갈색 — 옅은 갈색은 어두운 얼룩 자리에서 안 보임)
export const HEADER_CLASS =
  "w-full space-y-1 border-b border-[#6b4321]/40 pb-[clamp(0.45rem,1.2vw,0.65rem)]"

export const NICKNAME_CLASS =
  "text-[clamp(1.05rem,2.65vw,1.25rem)] font-semibold tracking-wide text-[#3a1a0c]"

export const ROLE_NAME_CLASS =
  "font-display text-[clamp(1.65rem,4.8vw,2.65rem)] font-medium tracking-wide text-[#3a1a0c] antialiased"

export const DESC_CLASS =
  "text-[clamp(0.88rem,2.2vw,1.02rem)] leading-relaxed text-[#3a1a0c]"

// 진영 글 ("광대 진영"·"시민 진영"), 직업 이름 아래 한 줄
export const TEAM_LABEL_CLASS =
  "text-[clamp(0.85rem,2.1vw,1rem)] font-semibold tracking-wide text-[#3a1a0c]"

// 내 그림과 머리 글을 나란히 두는 줄 (그림 왼쪽, 글 오른쪽 — 창 높이가 덜 늘게)
export const HEADER_ROW_CLASS =
  "flex w-full items-center justify-center gap-[clamp(0.6rem,2vw,1.25rem)]"

// 내 서 있는 그림 (창 높이가 정해져 있어 작게, 줄어들지 않게)
export const STANDING_IMG_CLASS =
  "h-[clamp(4.5rem,13vw,7.5rem)] w-auto shrink-0 select-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]"

// 같은 편 목록과 이름 칩
export const ALLY_SECTION_CLASS =
  "w-full rounded border border-[#6b4321]/35 bg-black/5 p-[clamp(0.45rem,1.2vw,0.65rem)] text-[clamp(0.78rem,1.9vw,0.9rem)] text-[#3a1a0c]"

export const ALLY_LIST_CLASS =
  "mt-1 flex flex-wrap justify-center gap-1.5"

export const ALLY_CHIP_CLASS =
  "rounded-full border border-[#6b4321]/40 bg-[#3a1a0c]/10 px-[clamp(0.45rem,1.1vw,0.6rem)] py-[clamp(0.15rem,0.45vw,0.25rem)] text-[clamp(0.76rem,1.85vw,0.88rem)]"

// 확인 버튼
export const PRIMARY_BTN_CLASS =
  "mt-1 min-h-9 w-[min(14rem,100%)] rounded border border-[#6b4321] bg-[#3a1a0c] px-4 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:bg-[#5b3a20]"

// 나타나는 움직임 (움직임 줄이기면 거의 바로)
export const PANEL_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
}
