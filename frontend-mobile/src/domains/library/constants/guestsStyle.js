// 초대받은 자들 표·탭·보상 모양 (순위 칸·숫자·프로필·직업 탭 글자·보상 아이콘)
// guests/ 컴포넌트가 씀, 데스크톱 clamp 크기를 폰 크기로 고정한 것만 둠 (같은 값은 데스크톱 상수 import)

// 직업 이름 (h2)
export const JOB_TITLE_CLASS =
  "font-display text-center app-text-scaled [--app-text-size:1.55rem] font-medium leading-snug text-[#120a06] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.1)]"

// 직업 탭 글자 (다섯 칸 균등이라 좁은 폰에서 말줄임·자간 좁힘)
export const JOB_TAB_LABEL_CLASS =
  "relative z-10 truncate font-subheading app-text-scaled [--app-text-size:0.7rem] font-bold tracking-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 순위 칸: 1위·2~3위·나머지 모양 다름
const RANK_BASE = "text-center font-display tabular-nums leading-none antialiased"
const RANK_TIER_CLASS = {
  1: `${RANK_BASE} app-text-scaled [--app-text-size:1rem] font-bold text-[#6b3a2a]`,
  2: `${RANK_BASE} app-text-scaled [--app-text-size:0.94rem] font-bold text-[#3d2a1c]`,
  3: `${RANK_BASE} app-text-scaled [--app-text-size:0.94rem] font-bold text-[#3d2a1c]`,
  default: `${RANK_BASE} app-text-scaled [--app-text-size:0.88rem] font-semibold text-[#1a1008]/85`,
}

// 순위별 칸 모양, 4위부터는 기본 모양
export function rankCellClass(rank) {
  return RANK_TIER_CLASS[rank] ?? RANK_TIER_CLASS.default
}

// 숫자 값 (% 글자는 작게)
export const STAT_NUMBER_CLASS =
  "font-display app-text-scaled [--app-text-size:1rem] font-bold tabular-nums leading-none text-[#120a06] antialiased"
export const STAT_PERCENT_CLASS =
  "font-display app-text-scaled [--app-text-size:0.78rem] font-semibold tabular-nums leading-none text-[#3d2a1c]/70"

// 도전과제 보상 아이콘·개수·테두리 이름
const INK = "font-subheading antialiased text-[#1a1008]"
export const REWARD_ICON_CLASS = "h-5 w-auto shrink-0 select-none object-contain"
export const REWARD_COUNT_CLASS = `${INK} app-text-scaled [--app-text-size:0.84rem] font-semibold tabular-nums`
export const REWARD_BORDER_ICON_CLASS = "h-6 w-6 shrink-0 select-none object-contain"
export const REWARD_BORDER_LABEL_CLASS = `${INK} app-text-scaled [--app-text-size:0.8rem] font-semibold leading-tight`
