const INVITED_GUESTS_TABLE_TEXT =
  "font-subheading text-[clamp(0.76rem,0.98vw,0.88rem)] leading-snug text-[#1a1008]"

export const INVITED_GUESTS_TABLE_CLASS = "w-full border-collapse"

export const INVITED_GUESTS_STATS_TABLE_CLASS = `${INVITED_GUESTS_TABLE_CLASS} table-fixed`

const INVITED_GUESTS_STATS_TABLE_HEAD_CELL_BASE =
  "whitespace-nowrap px-[0.35rem] pb-[0.38rem] pt-[0.15rem] align-bottom first:pl-0"

const INVITED_GUESTS_STATS_TABLE_CELL_BASE =
  "px-[0.35rem] py-[0.38rem] align-middle first:pl-0"

export const INVITED_GUESTS_TABLE_HEAD_CLASS =
  `${INVITED_GUESTS_TABLE_TEXT} border-b border-[#2a1810]/22 text-[clamp(0.8rem,1.05vw,0.92rem)] font-black text-[#120a06]`

export const INVITED_GUESTS_TABLE_HEAD_CELL_CLASS =
  "whitespace-nowrap px-[0.35rem] pb-[0.38rem] pt-[0.15rem] text-left align-bottom first:pl-0 last:pr-0"

export const INVITED_GUESTS_TABLE_HEAD_NUM_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} w-[2.65rem] text-right`

export const INVITED_GUESTS_TABLE_HEAD_WINRATE_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} w-[2.35rem] text-right pr-0`

export const INVITED_GUESTS_TABLE_HEAD_REWARD_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} text-right pr-0`

export const INVITED_GUESTS_TABLE_BODY_CLASS = INVITED_GUESTS_TABLE_TEXT

export const INVITED_GUESTS_TABLE_ROW_CLASS = "border-b border-[#2a1810]/10 last:border-b-0"

export const INVITED_GUESTS_TABLE_CELL_CLASS =
  "px-[0.35rem] py-[0.38rem] align-middle first:pl-0 last:pr-0"

const INVITED_GUESTS_RANK_CELL_BASE_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} w-[2rem] text-center font-display tabular-nums leading-none antialiased`

export const INVITED_GUESTS_TABLE_RANK_CELL_TIER_CLASS = {
  1: `${INVITED_GUESTS_RANK_CELL_BASE_CLASS} text-[clamp(0.92rem,1.12vw,1rem)] font-bold text-[#6b3a2a]`,
  2: `${INVITED_GUESTS_RANK_CELL_BASE_CLASS} text-[clamp(0.88rem,1.06vw,0.96rem)] font-bold text-[#3d2a1c]`,
  3: `${INVITED_GUESTS_RANK_CELL_BASE_CLASS} text-[clamp(0.88rem,1.06vw,0.96rem)] font-bold text-[#3d2a1c]`,
  default: `${INVITED_GUESTS_RANK_CELL_BASE_CLASS} text-[clamp(0.82rem,1vw,0.9rem)] font-semibold text-[#1a1008]/85`,
}

export function getInvitedGuestsRankCellClass(rank) {
  return INVITED_GUESTS_TABLE_RANK_CELL_TIER_CLASS[rank] ?? INVITED_GUESTS_TABLE_RANK_CELL_TIER_CLASS.default
}

export const INVITED_GUESTS_TABLE_PROFILE_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} w-[clamp(2.85rem,3.85vw,3.25rem)]`

export const INVITED_GUESTS_TABLE_PROFILE_WRAP_CLASS =
  "relative mx-auto h-[clamp(2.25rem,3.35vw,2.9rem)] w-[clamp(2.25rem,3.35vw,2.9rem)]"

export const INVITED_GUESTS_TABLE_PROFILE_PHOTO_CLASS =
  "absolute left-1/2 top-1/2 block h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover"

export const INVITED_GUESTS_TABLE_PROFILE_BORDER_CLASS =
  "pointer-events-none absolute inset-0 block h-full w-full select-none object-contain"

export const INVITED_GUESTS_TABLE_NICKNAME_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} min-w-0 font-semibold text-[#3d2a1c]/88`

export const INVITED_GUESTS_TABLE_NUM_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} w-[2.65rem] text-right`

export const INVITED_GUESTS_TABLE_WINRATE_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} w-[2.35rem] pr-0 text-right`

export const INVITED_GUESTS_STAT_NUMBER_CLASS =
  "font-display text-[clamp(0.92rem,1.15vw,1.04rem)] font-bold tabular-nums leading-none text-[#120a06] antialiased"

export const INVITED_GUESTS_STAT_PERCENT_SUFFIX_CLASS =
  "font-display text-[clamp(0.72rem,0.92vw,0.82rem)] font-semibold tabular-nums leading-none text-[#3d2a1c]/70"

export const INVITED_GUESTS_STAT_CHIP_CLASS =
  "inline-flex min-w-[2.35rem] items-baseline justify-end gap-[0.04rem] rounded-[0.35rem] border border-[#2a1810]/16 bg-[#f5f0e6]/40 px-[clamp(0.38rem,0.75vw,0.52rem)] py-[clamp(0.18rem,0.38vh,0.26rem)]"

export const INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} min-w-0 font-semibold`

export const INVITED_GUESTS_CHALLENGE_CLEARED_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} py-[0.38rem] text-center font-semibold text-[#3d2a1c]/75`

export const INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS =
  `${INVITED_GUESTS_TABLE_CELL_CLASS} pr-0 text-right`

export const INVITED_GUESTS_STATS_LABEL_CELL_CLASS =
  `${INVITED_GUESTS_STATS_TABLE_CELL_BASE} w-[1%] whitespace-nowrap font-semibold text-[#3d2a1c]/78`

export const INVITED_GUESTS_STATS_HEAD_LABEL_CELL_CLASS =
  `${INVITED_GUESTS_STATS_TABLE_HEAD_CELL_BASE} w-[1%] whitespace-nowrap text-left font-black text-[#120a06]`

export const INVITED_GUESTS_STATS_HEAD_VALUE_CELL_CLASS =
  `${INVITED_GUESTS_STATS_TABLE_HEAD_CELL_BASE} whitespace-nowrap text-right pl-[clamp(1.1rem,2.2vw,1.6rem)] pr-[clamp(1.75rem,3.6vw,2.5rem)] font-black text-[#120a06]`

export const INVITED_GUESTS_STATS_VALUE_CELL_CLASS =
  `${INVITED_GUESTS_STATS_TABLE_CELL_BASE} whitespace-nowrap text-right pl-[clamp(1.1rem,2.2vw,1.6rem)] pr-[clamp(1.75rem,3.6vw,2.5rem)]`
