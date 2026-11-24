// 약관 칸·창 class 모음 (동의 줄·전체 보기 본문·창 버튼)
// 데스크톱 약관 동의 칸·전체 보기 창·재동의 창이 씀
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 동의 칸 묶음 (가입 스크롤 칸 안)
export const AGREEMENT_BOX_CLASS =
  "mt-1 flex w-full min-w-0 max-w-full flex-col gap-1 rounded border border-[#8b6a3e]/40 bg-black/5 px-1.5 py-1.5"
export const AGREEMENT_ROW_CLASS = "flex min-w-0 items-center justify-between gap-1"
export const AGREEMENT_ALL_ROW_CLASS = `${AGREEMENT_ROW_CLASS} border-b border-[#8b6a3e]/30 pb-1`
export const AGREEMENT_LABEL_CLASS = "font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body"
export const AGREEMENT_REQUIRED_CLASS = "text-[#9C3D32]"
export const AGREEMENT_VIEW_BTN_CLASS =
  "shrink-0 cursor-pointer rounded border border-[#8b6a3e]/60 bg-transparent px-1.5 py-0.5 font-subheading app-text-scaled [--app-text-size:11px] text-text-body underline-offset-2 hover:underline"
export const AGREEMENT_STATUS_CLASS = "font-subheading app-text-scaled [--app-text-size:11px] text-text-body/80"

// 양피지 약관 보기 — 그림 비율 3/2, 세로는 폭에 비례해 크게(본문 스크롤 여유)
export const TERMS_PARCHMENT_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(54rem,96vw,150svh)] select-none"

/** 개인정보 처리방침 전체 보기만 양피지 조금 더 큼 */
export const TERMS_PARCHMENT_PRIVACY_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(58rem,97vw,158svh)] select-none"

export const TERMS_PARCHMENT_FALLBACK_FRAME_CLASS =
  "pointer-events-auto relative min-h-[min(38rem,78svh)] w-[min(54rem,96vw)] rounded-lg border border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

export const TERMS_PARCHMENT_PRIVACY_FALLBACK_FRAME_CLASS =
  "pointer-events-auto relative min-h-[min(40rem,82svh)] w-[min(58rem,97vw)] rounded-lg border border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

// 내용은 그림 안 글 영역(inset)에 맞춤
export const TERMS_PARCHMENT_CONTENT_CLASS =
  "absolute inset-x-[14%] inset-y-[11%] flex min-h-0 flex-col items-stretch justify-start overflow-hidden text-left text-[#3a1a0c]"

export const TERMS_PARCHMENT_FORM_BODY_CLASS =
  "flex min-h-0 flex-1 basis-0 flex-col overflow-hidden"

export const TERMS_PARCHMENT_CONTENT_COLUMN_CLASS =
  "mx-auto flex w-[min(100%,82%)] min-w-0 flex-col"

/** 약관 양피지 대제목·본문 블록 살짝 아래 */
export const TERMS_PARCHMENT_TITLE_OFFSET_CLASS = "mt-[clamp(1.85rem,4.1vh,2.4rem)]"

/** 약관 전체 보기 양피지 대제목(개인정보·이용약관 등) */
export const TERMS_PARCHMENT_VIEW_TITLE_CLASS =
  "!font-extrabold tracking-tight text-[#2a1208] app-text-scaled ![--app-text-size:clamp(1.08rem,1.85vw,1.32rem)]"
export const TERMS_PARCHMENT_BODY_BLOCK_OFFSET_CLASS = "mt-[clamp(0.95rem,2.4vh,1.35rem)]"

export const TERMS_PARCHMENT_BODY_SCROLL_CLASS =
  `min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const TERMS_PARCHMENT_FALLBACK_CONTENT_CLASS =
  "flex max-h-[80svh] min-h-0 flex-col items-stretch justify-start gap-2 overflow-hidden px-6 py-7 text-left text-[#3a1a0c]"

export const TERMS_PARCHMENT_TEXT_INSET_CLASS =
  "px-[clamp(0.35rem,0.85vw,0.65rem)]"

// 전체 보기 본문 (줄바꿈 그대로, 길면 스크롤)
export const TERMS_PARCHMENT_META_CLASS =
  `shrink-0 font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,1.1vw,0.8rem)] text-[#3a1a0c]/80 ${TERMS_PARCHMENT_TEXT_INSET_CLASS}`

export const TERMS_PARCHMENT_BODY_CLASS =
  `whitespace-pre-wrap py-0.5 font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.2vw,0.9rem)] font-semibold leading-relaxed text-[#2a1208] ${TERMS_PARCHMENT_TEXT_INSET_CLASS}`

export const TERMS_PARCHMENT_LINK_CLASS =
  "shrink-0 cursor-pointer self-start font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.1vw,0.85rem)] font-bold text-[#4a2810] underline underline-offset-2 hover:text-[#2a1208]"

export const TERMS_PARCHMENT_CLOSE_WRAP_CLASS =
  "relative z-[1] flex w-full shrink-0 -translate-y-[clamp(2.65rem,6.8vh,4.15rem)] justify-center"

export const TERMS_PARCHMENT_EMPTY_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.2vw,0.9rem)] font-semibold leading-relaxed text-[#3a1a0c]/90"

// 로비 약관 재동의 양피지 창
export const TERMS_RECONSENT_PARCHMENT_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(38rem,92vw,94svh)] select-none"

export const TERMS_RECONSENT_PARCHMENT_CONTENT_CLASS = `absolute inset-0 flex min-h-0 flex-col items-stretch justify-start gap-[clamp(0.35rem,1vh,0.55rem)] overflow-y-auto overscroll-contain px-[16%] pb-[12%] pt-[11%] text-left text-[#3a1a0c] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const TERMS_RECONSENT_BODY_CLASS =
  "mx-auto flex w-[min(100%,92%)] min-h-0 min-w-0 flex-1 flex-col gap-[clamp(0.4rem,1vh,0.65rem)]"

export const TERMS_RECONSENT_GUIDE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.15vw,0.88rem)] font-semibold leading-snug text-[#3a1a0c]/90 break-keep"

export const TERMS_RECONSENT_LIST_CLASS = "flex w-full min-w-0 flex-col gap-[clamp(0.35rem,0.8vh,0.5rem)]"

export const TERMS_RECONSENT_ROW_CLASS = "flex min-w-0 items-center justify-between gap-2"

export const TERMS_RECONSENT_ITEM_LABEL_CLASS =
  "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.85rem)] font-semibold leading-snug text-[#2a1208]"

export const TERMS_RECONSENT_VIEW_BTN_CLASS =
  "shrink-0 min-h-[1.65rem] min-w-[2.75rem] cursor-pointer rounded-sm border-2 border-[#6b4321] bg-[#f3e5bd]/95 px-2 py-0.5 font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.82rem)] font-bold text-[#2a1208] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_2px_5px_rgba(58,26,12,0.22)] underline underline-offset-2 hover:border-[#5a3a1e] hover:bg-[#ebe0b8] disabled:cursor-not-allowed disabled:opacity-60"

export const TERMS_RECONSENT_ACTIONS_CLASS =
  "mt-[clamp(1.85rem,4.6vh,2.55rem)] flex w-full shrink-0 justify-center"

export const TERMS_RECONSENT_BTN_CLASS =
  "w-[clamp(9.5rem,42%,12.5rem)] shrink-0"

// (구) CenterDialog 약관 보기 — 재동의 본문 등 다른 창용
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
