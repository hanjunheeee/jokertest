// 투표 창 틀 안 줄 모양: 추방·친구 줄 판·줄 버튼·오류 글 (틀·제목·안내 글은 공용 shared/ui/modal/voteFrameStyle.js)
// 대기방 추방 창·친구 초대 창 줄이 씀

// 대상 한 줄 판 (데스크톱 추방 ROW_INNER_CLASS)
export const KICK_ROW_CLASS =
  "flex min-h-[3.5rem] min-w-0 list-none items-center gap-2.5 rounded-sm border border-[#3a2818]/70 bg-[#120a06]/45 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

// 친구 한 줄 (데스크톱 FRIEND_INVITE_ROW_CLASS: 줄 사이 선만)
export const FRIEND_ROW_CLASS =
  "flex min-h-[3.75rem] min-w-0 list-none items-center gap-2.5 border-b border-[#3a2818]/70 py-1.5 last:border-b-0"

// 줄 안 그림 버튼 (그림 깔고 글자 한 줄, 데스크톱 줄 버튼 글자), 폭만 줄 버튼·확인 칸 버튼이 다름
const rowButton = (width) => ({
  button:
    `relative flex h-11 ${width} min-w-0 shrink-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97] disabled:cursor-default disabled:opacity-90 disabled:active:scale-100`,
  img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
  label:
    "relative z-[1] whitespace-nowrap px-[8%] font-subheading app-text-scaled [--app-text-size:0.78rem] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
  labelAsName: true,
})
export const ROW_BUTTON_LOOK = rowButton("w-[5.75rem]")
export const CONFIRM_BUTTON_LOOK = rowButton("w-full")

// 오류·안내 작은 글 (어두운 틀 위)
export const NOTE_CLASS = "font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug"
export const ERROR_CLASS = `${NOTE_CLASS} font-semibold text-[#ffb3a7]`
