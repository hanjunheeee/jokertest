/** 매칭 검색 오버레이 전체 배경입니다. */
export const MATCHING_SEARCH_OVERLAY_CLASS =
  "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-black/70"

/** 매칭 중 안내 문구입니다. */
export const MATCHING_SEARCH_OVERLAY_MESSAGE_CLASS =
  "font-subheading text-[clamp(1.4rem,2.2vw,1.8rem)] font-bold text-[#f5f0e6] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"

/** 매칭 취소 버튼입니다. */
export const MATCHING_SEARCH_OVERLAY_CANCEL_CLASS =
  "relative z-[1] inline-flex min-h-11 min-w-24 items-center justify-center rounded-md border border-[#c4a87a] bg-black/60 px-6 py-2 transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2c792]"

/** Chrome의 버튼 기본/확장 스타일과 분리한 취소 문구 스타일입니다. */
export const MATCHING_SEARCH_OVERLAY_CANCEL_TEXT_CLASS =
  "relative block font-subheading text-[clamp(1rem,1.4vw,1.15rem)] font-bold !text-[#e2c792] [-webkit-text-fill-color:#e2c792] opacity-100"

/** 별도 문구를 넘기지 않았을 때 보여줄 기본 메시지입니다. */
export const MATCHING_SEARCH_OVERLAY_DEFAULT_MESSAGE = "매칭 중입니다..."
