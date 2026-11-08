// 약관 칸·창 class 모음 (동의 줄·전체 보기 본문·창 버튼)
// 데스크톱 약관 동의 칸·전체 보기 창·재동의 창이 씀

// 동의 칸 묶음 (가입 스크롤 칸 안)
export const AGREEMENT_BOX_CLASS = "mx-1 mt-1 flex flex-col gap-1 rounded border border-[#8b6a3e]/40 bg-black/5 px-2 py-1.5"
export const AGREEMENT_ROW_CLASS = "flex items-center justify-between gap-2"
export const AGREEMENT_ALL_ROW_CLASS = `${AGREEMENT_ROW_CLASS} border-b border-[#8b6a3e]/30 pb-1`
export const AGREEMENT_LABEL_CLASS = "font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body"
export const AGREEMENT_REQUIRED_CLASS = "text-[#9C3D32]"
export const AGREEMENT_VIEW_BTN_CLASS =
  "shrink-0 cursor-pointer rounded border border-[#8b6a3e]/60 bg-transparent px-1.5 py-0.5 font-subheading app-text-scaled [--app-text-size:11px] text-text-body underline-offset-2 hover:underline"
export const AGREEMENT_STATUS_CLASS = "font-subheading app-text-scaled [--app-text-size:11px] text-text-body/80"

// 전체 보기 본문 (줄바꿈 그대로, 길면 스크롤)
export const TERMS_META_CLASS = "font-subheading app-text-scaled [--app-text-size:11px] text-[#5a4630]"
export const TERMS_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded border border-[#8b6a3e]/40 bg-white/40 p-3 font-sans app-text-scaled [--app-text-size:13px] leading-relaxed"

// 창 버튼 줄
export const DIALOG_ACTIONS_CLASS = "flex flex-wrap justify-end gap-2"
export const DIALOG_PRIMARY_BTN_CLASS =
  "cursor-pointer rounded bg-[#5a3a1e] px-3 py-1.5 font-subheading app-text-scaled [--app-text-size:13px] font-bold text-[#f5f0e6] hover:bg-[#6d4826] disabled:cursor-not-allowed disabled:opacity-50"
export const DIALOG_SECONDARY_BTN_CLASS =
  "cursor-pointer rounded border border-[#8b6a3e] bg-transparent px-3 py-1.5 font-subheading app-text-scaled [--app-text-size:13px] font-bold text-[#2b1d10] hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
export const DIALOG_DANGER_BTN_CLASS =
  "cursor-pointer rounded bg-[#9C3D32] px-3 py-1.5 font-subheading app-text-scaled [--app-text-size:13px] font-bold text-white hover:bg-[#b24a3d] disabled:cursor-not-allowed disabled:opacity-50"
export const DIALOG_TEXT_CLASS = "font-sans app-text-scaled [--app-text-size:13px] leading-relaxed"
export const DIALOG_ERROR_CLASS = "font-subheading app-text-scaled [--app-text-size:12px] font-bold text-[#9C3D32]"
