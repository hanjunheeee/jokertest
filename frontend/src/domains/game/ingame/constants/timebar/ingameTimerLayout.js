// 확대 타이머 모양: 타이머 바 자리·게이지·마커·MM:SS 글·단계 머리 판
// 확대 타이머(InGameTimebarExpandedTimer)·단계 머리(InGameTimebarPhaseHeader)·마커 계산이 사용

// 확대 틀 아래쪽 타이머 바 자리
export const EXPANDED_WRAP_INSET = {
  left: "3.2%",
  right: "3.2%",
  bottom: "10.5%",
  height: "24%",
}

// 타이머 바 틀 안 게이지 자리 (마커 left 계산도 이 값 기준)
export const GAUGE_INSET = {
  top: "28%",
  bottom: "23%",
  left: "4.5%",
  right: "22%",
}

// 층 순서: 게이지(1) → 틀 그림(2) → 마커(3) → 숫자(4), 게이지가 틀 안 길만 채우게
export const GAUGE_WRAP_CLASS =
  "pointer-events-none absolute z-[1] overflow-hidden"

export const FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] block h-full w-full select-none object-fill"

// 마커가 흐려지기 시작하는 남은 초
export const MARKER_FADE_START_SEC = 8

// 게이지 끝 다이아몬드 마커 (left는 게이지 비율로 JS가 정함)
export const MARKER_CLASS =
  "pointer-events-none absolute top-1/2 z-[3] block h-auto w-[clamp(0.68rem,3.35cqi,1rem)] -translate-x-1/2 -translate-y-1/2 select-none transition-opacity duration-300 ease-linear"

export const DIGITS_CLASS =
  "pointer-events-none absolute right-[6.5%] top-1/2 z-[4] -translate-y-1/2 font-display text-[clamp(0.78rem,3.85cqi,1.05rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

// 확대 틀 위 가운데 단계 머리 판·글
export const PHASE_HEADER_WRAP_CLASS =
  "pointer-events-none absolute left-1/2 top-[1.5%] z-[2] w-[clamp(10.8rem,52cqi,15rem)] -translate-x-1/2 -translate-y-[36%]"

export const PHASE_HEADER_PLATE_CLASS =
  "block h-auto w-full select-none"

export const PHASE_HEADER_TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-start justify-center px-[9%] pt-[3.2%] text-center font-subheading text-[clamp(0.72rem,3.55cqi,0.98rem)] font-bold leading-tight tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
