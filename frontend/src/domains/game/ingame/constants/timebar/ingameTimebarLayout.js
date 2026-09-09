/**
 * 인게임 시간흐름 바 레이아웃 상수.
 *
 * InGameTimebar에서 프레임·일차 라벨·노드·지시화살표 배치에 사용합니다.
 */

/** 우측 상단 — 플레이어 보드와 right 정렬 맞춤 */
export const INGAME_TIMEBAR_POSITION_CLASS =
  "absolute top-[clamp(0.45rem,1.8vh,1.1rem)] right-[clamp(0.35rem,1.2cqw,0.85rem)] z-10 w-[clamp(18rem,38cqw,30rem)] [container-type:inline-size]"

/** 시간바와 선택적 투표 현황 버튼을 세로로 쌓는 래퍼 */
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

/** 활성 단계 위 — 지시화살표.png */
export const INGAME_TIMEBAR_ARROW_SIZE_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+0.1em)] left-1/2 block h-auto w-[clamp(0.58rem,3cqi,0.92rem)] -translate-x-1/2 select-none"

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
  "pointer-events-none self-end truncate text-right font-subheading text-[clamp(0.62rem,3.1cqi,0.86rem)] font-bold leading-none tracking-wide text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 좌측 일차 라벨 텍스트 스타일 */
export const INGAME_TIMEBAR_DAY_LABEL_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.62rem,3.35cqi,0.9rem)] font-bold leading-none tracking-wide text-[#2a1810] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"
