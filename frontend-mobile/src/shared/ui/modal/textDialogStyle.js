// 글 위주 창 안쪽 class (본문·버튼 줄·버튼 셋·오류·성공·입력 칸)
// 모바일 약관·탈퇴 확인·쿠폰·새 버전 안내가 씀, 누르는 칸은 높이 44px

export const DIALOG_TEXT_CLASS = "font-subheading leading-relaxed app-text-scaled [--app-text-size:0.9rem]"
export const DIALOG_META_CLASS = "font-subheading text-[#5a4630] app-text-scaled [--app-text-size:0.78rem]"
export const DIALOG_BODY_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded border border-[#8b6a3e]/40 bg-white/50 p-3 font-subheading leading-relaxed app-text-scaled [--app-text-size:0.88rem]"
export const DIALOG_ACTIONS_CLASS = "flex flex-wrap justify-end gap-2"

const BTN_BASE = "min-h-11 cursor-pointer rounded px-4 font-subheading font-bold app-text-scaled [--app-text-size:0.9rem] disabled:cursor-not-allowed disabled:opacity-50"
export const DIALOG_PRIMARY_BTN_CLASS = `${BTN_BASE} bg-[#5a3a1e] text-[#f5f0e6] active:bg-[#6d4826]`
export const DIALOG_SECONDARY_BTN_CLASS = `${BTN_BASE} border border-[#8b6a3e] bg-transparent text-[#2b1d10] active:bg-black/5`
export const DIALOG_DANGER_BTN_CLASS = `${BTN_BASE} bg-[#9C3D32] text-white active:bg-[#b24a3d]`

export const DIALOG_ERROR_CLASS = "font-subheading font-bold text-[#9C3D32] app-text-scaled [--app-text-size:0.82rem]"
export const DIALOG_SUCCESS_CLASS = "font-subheading font-bold text-[#2E6B3A] app-text-scaled [--app-text-size:0.82rem]"
export const DIALOG_INPUT_CLASS =
  "min-h-11 w-full rounded border border-[#8b6a3e] bg-white/70 px-3 font-subheading uppercase tracking-wider text-[#2b1d10] outline-none app-text-scaled [--app-text-size:1rem] focus:border-[#5a3a1e]"

// 글자 링크 모양 버튼 (보기·다시 불러오기)
export const TEXT_BTN_CLASS =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent px-2 font-subheading font-bold text-amber-800 underline underline-offset-2 app-text-scaled [--app-text-size:0.85rem]"
