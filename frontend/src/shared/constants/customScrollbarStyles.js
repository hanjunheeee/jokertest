/**
 * 빈 스크롤바.png — 상·하단 장식 구간 (트랙 높이 대비 비율, 0~1).
 * 롤러는 이 안쪽 홈(groove)에서만 이동합니다.
 */
export const CUSTOM_SCROLLBAR_TRACK_INSET = {
  top: 0.05,
  bottom: 0.05,
}

/** Scrollbar — 트랙·썸 레이아웃 */
export const CUSTOM_SCROLLBAR_WRAP_CLASS =
  "pointer-events-none absolute right-0 flex h-full translate-x-[clamp(0.25rem,0.65vw,0.5rem)] flex-col leading-[0] w-[clamp(0.7rem,1.2vw,0.95rem)]"

export const CUSTOM_SCROLLBAR_TRACK_CLASS =
  "block h-full min-h-0 w-full flex-1 select-none object-fill"

export const CUSTOM_SCROLLBAR_THUMB_CLASS =
  "absolute left-1/2 h-auto w-[62%] -translate-x-1/2 touch-none select-none"

/** overflow 스크롤 컨테이너 — 네이티브 스크롤바 숨김 */
export const CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS =
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
