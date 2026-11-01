// 위쪽 진행 바 모양: 자리·날짜 칸·단계 길·화살표·확대 버튼 (접힘·확대 두 벌)·상태 글
// 진행 바(InGameTimebar)가 사용

// 바 자리(오른쪽 위)와 세로 쌓기, 보드·옆 패널·재판 연출보다 위·전면 덮개보다 아래
export const POSITION_CLASS =
  "pointer-events-auto absolute top-[clamp(0.45rem,1.8vh,1.1rem)] right-[clamp(0.35rem,1.2cqw,0.85rem)] z-[58] w-[clamp(18rem,38cqw,30rem)] [container-type:inline-size]"

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

// 단계 그림 크기·간격, 단계 줄은 단계 머리·타이머보다 위 층
export const NODE_SIZE_CLASS =
  "block h-auto w-[clamp(1.9rem,9.8cqi,3.1rem)] shrink-0 select-none"

export const NODE_GAP_CLASS =
  "gap-[clamp(1rem,7.5cqi,2.4rem)]"

export const TRACK_NODES_LAYER_CLASS = "z-[5]"

// 지금 단계 위 화살표 (접힘·확대), 타이머 숫자보다 위 층
export const ARROW_SIZE_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+0.1rem)] left-1/2 z-[5] block h-auto w-[clamp(0.92rem,5.2cqi,1.42rem)] -translate-x-1/2 select-none"

// 확대 틀도 접힘과 같은 바 폭 기준이라 최대값을 키워야 실제로 커짐
export const EXPANDED_ARROW_SIZE_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+0.08rem)] left-1/2 z-[5] block h-auto w-[clamp(0.88rem,4.6cqi,1.38rem)] -translate-x-1/2 select-none"

// 지금 단계 빛남
export const NODE_ACTIVE_CLASS =
  "brightness-110 drop-shadow-[0_0_10px_rgba(212,168,67,0.85)]"

// 상태 글·날짜 글 (확대 틀 날짜는 조금 크게)
export const INGAME_TIMEBAR_STATUS_CLASS =
  "pointer-events-none self-end truncate text-right font-subheading text-[clamp(0.82rem,4.1cqi,1.05rem)] font-bold leading-none tracking-wide text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const DAY_LABEL_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.62rem,3.35cqi,0.9rem)] font-bold leading-none tracking-wide text-[#2a1810] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"

export const EXPANDED_DAY_LABEL_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.68rem,3.62cqi,0.96rem)] font-bold leading-none tracking-wide text-[#2a1810] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"

// 틀 오른쪽 위 확대 버튼, 올리면 크게·밝게·금빛 (기본 눌림 효과보다 잘 보이게)
export const INGAME_TIMEBAR_EXPAND_BTN_CLASS =
  "group pointer-events-auto absolute top-0 right-0 z-[6] block w-[clamp(1.58rem,7.6cqi,2.4rem)] translate-x-[14%] -translate-y-[16%] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const EXPAND_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-[transform,filter] duration-200 ease-out group-hover:scale-[1.1] group-hover:brightness-110 group-hover:drop-shadow-[0_0_7px_rgba(212,168,67,0.6)] group-active:scale-[0.96]"

export const EXPAND_BTN_LABEL = "시간흐름바 확대"
export const COLLAPSE_BTN_LABEL = "시간흐름바 접기"

// 확대 틀 기준 날짜 칸·단계 길 자리 (아래쪽은 타이머 바 자리)
export const EXPANDED_DAY_LABEL_INSET = {
  top: "28.5%",
  bottom: "41.5%",
  left: "2.1%",
  width: "19%",
}

export const EXPANDED_TRACK_INSET = {
  top: "26%",
  bottom: "41%",
  left: "25%",
  right: "3.5%",
}
