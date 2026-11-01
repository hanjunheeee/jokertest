// 위쪽 진행 바 모양: 자리·날짜 칸·단계 길·화살표·상태 글
// 진행 바(InGameTimebar)가 사용

// 바 자리(오른쪽 위)와 세로 쌓기
export const POSITION_CLASS =
  "absolute top-[clamp(0.45rem,1.8vh,1.1rem)] right-[clamp(0.35rem,1.2cqw,0.85rem)] z-10 w-[clamp(18rem,38cqw,30rem)] [container-type:inline-size]"

export const STACK_CLASS =
  "flex flex-col items-stretch gap-[clamp(0.3rem,1.2cqi,0.55rem)]"

// 틀 그림 기준 날짜 칸·단계 길 자리
export const DAY_LABEL_INSET = {
  top: "23%",
  bottom: "23%",
  left: "2.8%",
  width: "19%",
}

export const TRACK_INSET = {
  top: "21%",
  bottom: "21%",
  left: "25%",
  right: "3.5%",
}

// 단계 그림 크기·간격·화살표·지금 단계 빛남
export const NODE_SIZE_CLASS =
  "block h-auto w-[clamp(1.9rem,9.8cqi,3.1rem)] shrink-0 select-none"

export const NODE_GAP_CLASS =
  "gap-[clamp(1rem,7.5cqi,2.4rem)]"

export const ARROW_SIZE_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+0.1em)] left-1/2 block h-auto w-[clamp(0.58rem,3cqi,0.92rem)] -translate-x-1/2 select-none"

export const NODE_ACTIVE_CLASS =
  "brightness-110 drop-shadow-[0_0_10px_rgba(212,168,67,0.85)]"

// 상태 글·날짜 글
export const INGAME_TIMEBAR_STATUS_CLASS =
  "pointer-events-none self-end truncate text-right font-subheading text-[clamp(0.82rem,4.1cqi,1.05rem)] font-bold leading-none tracking-wide text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const DAY_LABEL_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.62rem,3.35cqi,0.9rem)] font-bold leading-none tracking-wide text-[#2a1810] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"
