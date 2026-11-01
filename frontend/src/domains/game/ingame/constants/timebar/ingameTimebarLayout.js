/**
 * 인게임 시간흐름 바 레이아웃 상수.
 *
 * InGameTimebar에서 프레임·일차 라벨·노드·지시화살표 배치에 사용합니다.
 */

/**
 * 우측 상단 — 플레이어 보드·사이드 패널(z-30)·재판 연출(z-55)보다 위, 전면 오버레이(z-60+)보다 아래.
 */
export const INGAME_TIMEBAR_POSITION_CLASS =
  "pointer-events-auto absolute top-[clamp(0.45rem,1.8vh,1.1rem)] right-[clamp(0.35rem,1.2cqw,0.85rem)] z-[58] w-[clamp(18rem,38cqw,30rem)] [container-type:inline-size]"

/** 시간바와 단계 행동 줄을 세로로 쌓는 래퍼 */
export const INGAME_TIMEBAR_STACK_CLASS =
  "flex flex-col items-stretch gap-[clamp(0.3rem,1.2cqi,0.55rem)]"

/** 진행바 프레임.png — 좌측 일차 프레임 영역 ("제 N일") */
export const INGAME_TIMEBAR_DAY_LABEL_INSET = {
  top: "23%",
  bottom: "23%",
  left: "2.8%",
  width: "19%",
}

/** 진행바 프레임.png — 좌측 일차 프레임 제외 트랙 위 노드 배치 영역 */
export const INGAME_TIMEBAR_TRACK_INSET = {
  top: "21%",
  bottom: "21%",
  left: "25%",
  right: "3.5%",
}

/** 단계 노드 PNG 크기 — 바 너비(cqi)에 비례 */
export const INGAME_TIMEBAR_NODE_SIZE_CLASS =
  "block h-auto w-[clamp(1.9rem,9.8cqi,3.1rem)] shrink-0 select-none"

/** 노드 간 가로 간격 */
export const INGAME_TIMEBAR_NODE_GAP_CLASS =
  "gap-[clamp(1rem,7.5cqi,2.4rem)]"

/** 단계 노드·지시화살표 행 — phase 헤더(z-[2])·타이머(z-[4])보다 위 */
export const INGAME_TIMEBAR_TRACK_NODES_LAYER_CLASS = "z-[5]"

/** 활성 단계 위 — 지시화살표.png (시간바 내부 레이어 최상단 — 타이머 MM:SS z-[4]보다 위) */
export const INGAME_TIMEBAR_ARROW_SIZE_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+0.1rem)] left-1/2 z-[5] block h-auto w-[clamp(0.92rem,5.2cqi,1.42rem)] -translate-x-1/2 select-none"

/**
 * 확대 프레임 — 지시화살표.png
 * (접힘과 동일한 바 가로폭 cqi 기준이라 clamp max가 낮으면 키워도 px가 안 늘어남 → 상한·cqi 크게)
 */
export const INGAME_TIMEBAR_EXPANDED_ARROW_SIZE_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+0.08rem)] left-1/2 z-[5] block h-auto w-[clamp(0.88rem,4.6cqi,1.38rem)] -translate-x-1/2 select-none"

/** 활성 단계 노드 — 밝기·금색 glow */
export const INGAME_TIMEBAR_NODE_ACTIVE_CLASS =
  "brightness-110 drop-shadow-[0_0_10px_rgba(212,168,67,0.85)]"

/**
 * 프레임 아래 한 줄 — 현재 phase·밤 역할 턴 상태 문구.
 * 프레임 밖(어두운 게임 배경) 위에 놓이므로 "제 N일"의 다크 브라운이 아니라 이 저장소의
 * 어두운-배경 텍스트 관례(크림색 + 그림자)를 따른다. z-10 절대배치 래퍼 안이라
 * pointer-events-none으로 아래 보드의 클릭을 가로채지 않게 한다.
 */
export const INGAME_TIMEBAR_STATUS_CLASS =
  "pointer-events-none self-end truncate text-right font-subheading text-[clamp(0.82rem,4.1cqi,1.05rem)] font-bold leading-none tracking-wide text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 좌측 일차 라벨 텍스트 스타일 */
export const INGAME_TIMEBAR_DAY_LABEL_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.62rem,3.35cqi,0.9rem)] font-bold leading-none tracking-wide text-[#2a1810] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"

/** 확대 프레임 — 「제 N일」 (접힘보다 약간 크게) */
export const INGAME_TIMEBAR_EXPANDED_DAY_LABEL_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.68rem,3.62cqi,0.96rem)] font-bold leading-none tracking-wide text-[#2a1810] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"

/** 진행바 프레임 우측 상단 — 확대 버튼(타이머 확장 연출은 후속 슬라이스) */
export const INGAME_TIMEBAR_EXPAND_BTN_CLASS =
  "group pointer-events-auto absolute top-0 right-0 z-[6] block w-[clamp(1.58rem,7.6cqi,2.4rem)] translate-x-[14%] -translate-y-[16%] cursor-pointer border-0 bg-transparent p-0 leading-none"

/** 확대 버튼 PNG — hover 시 살짝 확대·밝기·금색 glow (interactive-scale 1.02보다 잘 보이게) */
export const INGAME_TIMEBAR_EXPAND_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-[transform,filter] duration-200 ease-out group-hover:scale-[1.1] group-hover:brightness-110 group-hover:drop-shadow-[0_0_7px_rgba(212,168,67,0.6)] group-active:scale-[0.96]"

export const INGAME_TIMEBAR_EXPAND_BTN_LABEL = "시간흐름바 확대"
export const INGAME_TIMEBAR_COLLAPSE_BTN_LABEL = "시간흐름바 접기"

/** 진행바(확대) 프레임 — 일차·노드 트랙 (타이머바 위 상단 구간, 접힘 프레임보다 아래) */
export const INGAME_TIMEBAR_EXPANDED_DAY_LABEL_INSET = {
  top: "28.5%",
  bottom: "41.5%",
  left: "2.1%",
  width: "19%",
}

export const INGAME_TIMEBAR_EXPANDED_TRACK_INSET = {
  top: "26%",
  bottom: "41%",
  left: "25%",
  right: "3.5%",
}

/** 확대 프레임 하단 — 타이머바 영역 */
export const INGAME_TIMEBAR_EXPANDED_TIMER_WRAP_INSET = {
  left: "3.2%",
  right: "3.2%",
  bottom: "10.5%",
  height: "24%",
}

/** 타이머바 프레임 내부 — 게이지 클립 */
export const INGAME_TIMEBAR_TIMER_GAUGE_INSET = {
  top: "28%",
  bottom: "23%",
  left: "4.5%",
  right: "22%",
}

/** 게이지는 프레임 PNG(z-[2]) 아래 — 트랙 안만 채운다 */
export const INGAME_TIMEBAR_TIMER_GAUGE_WRAP_CLASS =
  "pointer-events-none absolute z-[1] overflow-hidden"

/** 타이머바 장식 프레임 — 게이지 위 */
export const INGAME_TIMEBAR_TIMER_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] block h-full w-full select-none object-fill"

/** 마커가 남은 초 기준으로 서서히 사라지기 시작하는 구간(초) */
export const INGAME_TIMEBAR_TIMER_MARKER_FADE_START_SEC = 8

/** 타이머바 — 게이지 진행 끝(다이아몬드). left는 JS로 게이지 비율에 맞춘다 */
export const INGAME_TIMEBAR_TIMER_MARKER_CLASS =
  "pointer-events-none absolute top-1/2 z-[3] block h-auto w-[clamp(0.68rem,3.35cqi,1rem)] -translate-x-1/2 -translate-y-1/2 select-none transition-opacity duration-300 ease-linear"

/** 타이머바 프레임 — MM:SS */
export const INGAME_TIMEBAR_TIMER_DIGITS_CLASS =
  "pointer-events-none absolute right-[6.5%] top-1/2 z-[4] -translate-y-1/2 font-display text-[clamp(0.78rem,3.85cqi,1.05rem)] font-bold tabular-nums leading-none tracking-wide text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

/** 확대 프레임 위 중앙 — phase 상태 문구(탑레벨 프레임) */
export const INGAME_TIMEBAR_PHASE_HEADER_WRAP_CLASS =
  "pointer-events-none absolute left-1/2 top-[1.5%] z-[2] w-[clamp(10.8rem,52cqi,15rem)] -translate-x-1/2 -translate-y-[36%]"

export const INGAME_TIMEBAR_PHASE_HEADER_PLATE_CLASS =
  "block h-auto w-full select-none"

export const INGAME_TIMEBAR_PHASE_HEADER_TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-start justify-center px-[9%] pt-[3.2%] text-center font-subheading text-[clamp(0.72rem,3.55cqi,0.98rem)] font-bold leading-tight tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
