// 투표 현황 창 모양: 덮개·틀·제목·현황 줄·투표 목록·버튼
// 투표 현황 창·내용·버튼과 추방 창·친구 초대 창 모양이 사용
// 열고 닫을 때 움직임과 덮개·가운데 정렬
export const PANEL_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
}

export const BACKDROP_CLASS =
  "fixed inset-0 z-[45] cursor-default border-0 bg-black/45 p-0"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[46] flex items-center justify-center px-[clamp(0.5rem,2vw,1rem)] py-[clamp(0.75rem,3vh,1.5rem)]"

// 창 폭
export function getVotePanelStyle() {
  return {
    width: "clamp(28rem, 52vw, 42rem)",
  }
}

// 창 안쪽·틀 그림·안쪽 여백
export const VOTE_PANEL_INNER_CLASS =
  "pointer-events-auto relative w-full [container-type:inline-size]"

export const VOTE_FRAME_IMG_CLASS =
  "pointer-events-none relative z-[1] block h-auto w-full select-none"

export const INGAME_VOTE_PANEL_INSET = {
  paddingTop: "clamp(5.2rem, 16.2cqi, 6.55rem)",
  paddingBottom: "clamp(1.95rem, 6.2cqi, 2.55rem)",
  paddingLeft: "clamp(1.35rem, 5.2cqi, 2rem)",
  paddingRight: "clamp(1.35rem, 5.2cqi, 2rem)",
}

// 닫기 버튼·제목·부제
export const VOTE_CLOSE_BTN_CLASS =
  "interactive-scale absolute top-[clamp(3rem,3.8cqi,4rem)] right-[clamp(0.5rem,-0.35cqi,2rem)] z-20 border-0 bg-transparent p-0 leading-none"

export const VOTE_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(3rem,9.5cqi,3.9rem)] select-none"

export const INGAME_VOTE_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[clamp(2.15rem,6.2cqi,2.65rem)] z-[2] w-[clamp(9rem,36cqi,12rem)] -translate-x-1/2 text-center font-display text-[clamp(1.32rem,4.95cqi,1.72rem)] font-medium leading-none tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const SUBTITLE_CLASS =
  "mb-[clamp(0.55rem,1.6cqi,0.75rem)] shrink-0 text-center font-subheading text-[clamp(0.95rem,3.2cqi,1.2rem)] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 현황 칸과 줄 (결과 모를 때 글 포함)
export const SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const STATUS_SECTION_CLASS =
  "flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 text-[clamp(1.2rem,4.2cqi,1.5rem)] text-[#f8ead2]"

export const STATUS_ROW_CLASS = "flex items-center justify-between gap-3"

export const STATUS_TERM_CLASS =
  "text-[clamp(1.08rem,3.75cqi,1.32rem)] tracking-wide text-[#e0c9a3]"

export const STATUS_VALUE_CLASS = "font-semibold"

export const STATUS_UNRESOLVED_WRAP_CLASS =
  `${SCROLL_WRAP_CLASS} flex items-center justify-center`

export const STATUS_UNRESOLVED_CLASS =
  "text-center font-subheading text-[clamp(1.2rem,4.2cqi,1.5rem)] font-bold text-[#e0c9a3] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 투표 목록 줄 안쪽·프로필 칸
export const ROW_INNER_CLASS =
  "flex min-w-0 items-center gap-[clamp(0.27rem,1.12cqi,0.42rem)] rounded-sm border border-[#3a2818]/70 bg-[#120a06]/45 px-[clamp(0.27rem,1.12cqi,0.42rem)] py-[clamp(0.24rem,0.82cqi,0.36rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const PROFILE_WRAP_CLASS =
  "relative size-[clamp(2.78rem,9.75cqi,3.52rem)] shrink-0 overflow-hidden rounded-[2px] border border-[#5a4030]/70 bg-[#1a1008]/80"

// 체크 칸·체크 표시
export const CHECKBOX_CLASS =
  "interactive-scale relative block w-[clamp(1.42rem,4.8cqi,1.72rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

// 아래 제출 버튼
export const FOOTER_CLASS =
  "mt-[clamp(0.55rem,1.6cqi,0.75rem)] flex shrink-0 justify-center"

export const SUBMIT_BTN_CLASS =
  "interactive-scale relative block w-[clamp(7.5rem,28cqi,9.5rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

// 투표 현황 열기 버튼
export const TOGGLE_BTN_WRAP_CLASS = "relative shrink-0 self-end"

export const TOGGLE_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(5.65rem,36cqi,7.3rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const TOGGLE_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.96]"

export const TOGGLE_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] pb-[4%] text-center font-subheading text-[clamp(0.66rem,3.2cqi,0.82rem)] font-bold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"