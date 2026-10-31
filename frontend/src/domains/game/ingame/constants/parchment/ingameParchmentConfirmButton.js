export const INGAME_PARCHMENT_CONFIRM_BUTTON_ASSET =
  "/button/버튼(수락 및 긍정).png".normalize("NFD")

export const INGAME_PARCHMENT_CONFIRM_LABEL = "확인"

export const INGAME_PARCHMENT_CONFIRM_BUTTON_IMG_CLASS =
  "block h-auto w-full select-none"

export const INGAME_PARCHMENT_CONFIRM_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center pb-[2%] pt-[clamp(0.07rem,0.23vw,0.12rem)] font-subheading text-[clamp(0.78rem,1.85vw,0.92rem)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const INGAME_PARCHMENT_CONFIRM_BUTTON_BASE_CLASS =
  "interactive-scale relative block w-[clamp(6rem,14.7vw,9.3rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT =
  `${INGAME_PARCHMENT_CONFIRM_BUTTON_BASE_CLASS} -mt-[clamp(0.15rem,0.45vw,0.3rem)]`

export const INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS =
  `${INGAME_PARCHMENT_CONFIRM_BUTTON_BASE_CLASS} mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]`
