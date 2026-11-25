// 고객센터(문의) 팝업 모바일 모양: 탭·폼·목록 글자·칸 크기, 보내기 버튼(그림 비율 유지)
import { ERROR_CLASS, NOTE_CLASS } from "@m/domains/game/matching/constants/voteFrameStyle.js"

// 로비 고객센터 열 때 뒤 배경 (기본 Modal bg-black/45보다 어둡게)
export const INQUIRY_SHEET_BACKDROP_CLASS = "bg-black/88"

export const INQUIRY_TAB_CLASS =
  "min-h-10 cursor-pointer rounded-sm border px-1 font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold leading-none text-white"
export const INQUIRY_TAB_ON = "border-[#f3d28d] bg-[#3a1410]/80 text-[#f5e8c8]"
export const INQUIRY_TAB_OFF = "border-[#3a2818]/75 bg-[#120a06]/55"

export const INQUIRY_CATEGORY_CLASS =
  "min-h-10 cursor-pointer rounded-sm border px-1 font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold leading-none text-white disabled:cursor-default disabled:opacity-70"
export const INQUIRY_CATEGORY_ON = INQUIRY_TAB_ON
export const INQUIRY_CATEGORY_OFF = INQUIRY_TAB_OFF

export const INQUIRY_LABEL_CLASS =
  "mb-0.5 block font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold text-[#f5e8c8]"

// 폰 입력 확대 방지용 16px 유지, 패딩·칸만 축소
export const INQUIRY_FIELD_CLASS =
  "w-full rounded-sm border border-[#3a2818]/75 bg-[#120a06]/70 p-1.5 font-subheading text-base leading-snug text-white outline-none placeholder:text-white/40 focus-visible:border-[#f3d28d]"
export const INQUIRY_BODY_MIN_H = "min-h-[6rem]"
export const INQUIRY_COUNT_CLASS = "mb-0.5 text-right font-subheading text-[0.7rem] tabular-nums text-white/55"

export const INQUIRY_MESSAGE_CLASS = `mb-1.5 text-center ${ERROR_CLASS} [--app-text-size:0.8rem]`

export const INQUIRY_SMALL_BTN_CLASS =
  "min-h-10 cursor-pointer rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-2.5 font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold text-white"
export const INQUIRY_ROW_CLASS =
  "flex min-h-[2.85rem] w-full cursor-pointer flex-col gap-0.5 rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-2 py-1.5 text-left active:border-[#f3d28d]/70"
export const INQUIRY_TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:0.8rem] leading-tight"
export const INQUIRY_SUB_CLASS = "font-subheading app-text-scaled [--app-text-size:0.72rem] leading-tight text-white/65"
export const INQUIRY_BODY_TEXT_CLASS =
  "whitespace-pre-wrap break-words font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug text-white"
export const INQUIRY_BOX_CLASS = "rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 p-2"
export const INQUIRY_NOTE_CLASS = `${NOTE_CLASS} [--app-text-size:0.78rem]`
export const INQUIRY_LIST_GAP = "gap-1.5"

export const INQUIRY_DETAIL_ROOT_CLASS = "flex min-h-0 flex-1 flex-col"

export const INQUIRY_DETAIL_SCROLL_CLASS =
  `flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${INQUIRY_LIST_GAP}`

export const INQUIRY_BACK_BTN_CLASS = `${INQUIRY_SMALL_BTN_CLASS} mt-1 shrink-0 self-end`

// 데스크톱 신고 창 버튼 그림 비율 유지, 가로만 꽉 채우지 않음
export const INQUIRY_SUBMIT_BUTTON_LOOK = {
  button:
    "relative mx-auto mt-0.5 flex h-9 w-[7.75rem] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97] disabled:cursor-default disabled:opacity-90 disabled:active:scale-100",
  img: "pointer-events-none block h-full w-full select-none object-contain",
  label:
    "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] text-center font-subheading app-text-scaled [--app-text-size:0.75rem] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
  labelAsName: true,
}
