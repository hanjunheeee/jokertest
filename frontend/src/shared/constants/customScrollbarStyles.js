export const CUSTOM_SCROLLBAR_TRACK_INSET = {
  top: 0.05,
  bottom: 0.05,
}

export const CUSTOM_SCROLLBAR_WRAP_CLASS =
  "pointer-events-none absolute right-0 flex h-full translate-x-[clamp(0.25rem,0.65vw,0.5rem)] flex-col leading-[0] w-[clamp(0.7rem,1.2vw,0.95rem)]"

export const CUSTOM_SCROLLBAR_TRACK_CLASS =
  "block h-full min-h-0 w-full flex-1 select-none object-fill"

export const CUSTOM_SCROLLBAR_THUMB_CLASS =
  "absolute left-1/2 h-auto w-[62%] -translate-x-1/2 touch-none select-none"

export const CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS =
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
