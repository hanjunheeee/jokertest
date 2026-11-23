// 모바일 설정 줄·글자 모양 class (데스크톱 설정 색 그대로, 크기만 폰에 맞춤)
// rows/·tabs/ 아래 설정 줄 컴포넌트가 씀

export const ROW_CLASS =
  "flex min-h-10 items-center justify-between gap-2 border-b border-[#c4a574]/40 py-1.5 land:min-h-11 land:py-1.5"

export const STACK_ROW_CLASS =
  "flex flex-col gap-0.5 border-b border-[#c4a574]/40 pt-1.5 pb-1 land:pt-2 land:pb-1"

export const SECTION_TITLE_CLASS =
  "pt-2.5 pb-0.5 font-subheading app-text-scaled [--app-text-size:0.74rem] land:[--app-text-size:0.82rem] font-black tracking-wide text-[#3d2a1c]/75 first:pt-0.5 land:pt-3 land:first:pt-0.5"

export const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:0.84rem] land:[--app-text-size:0.95rem] font-bold leading-snug text-[#140c08] break-keep"

export const VALUE_CLASS =
  "shrink-0 font-subheading app-text-scaled [--app-text-size:0.86rem] land:[--app-text-size:1.05rem] font-bold tabular-nums text-[#140c08]"

export const IMAGE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-1 text-center font-subheading font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const ACTION_BUTTON_LOOK = {
  button:
    "relative block min-h-9 w-[6.25rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95 land:min-h-11 land:w-32",
  img: "block h-auto w-full select-none",
  label: IMAGE_LABEL_CLASS,
  labelSize: "app-text-scaled [--app-text-size:0.7rem] land:[--app-text-size:0.85rem]",
}
