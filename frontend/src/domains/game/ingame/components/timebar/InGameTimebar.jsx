import {
  INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  INGAME_DAY_TIMEBAR_PHASES,
  INGAME_TIMEBAR_ASSETS,
  INGAME_TIMEBAR_PREVIEW_DAY,
} from "../../constants/timebar/ingameTimebarAssets.js"
import {
  INGAME_TIMEBAR_ARROW_SIZE_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_INSET,
  INGAME_TIMEBAR_NODE_ACTIVE_CLASS,
  INGAME_TIMEBAR_NODE_GAP_CLASS,
  INGAME_TIMEBAR_NODE_SIZE_CLASS,
  INGAME_TIMEBAR_POSITION_CLASS,
  INGAME_TIMEBAR_STACK_CLASS,
  INGAME_TIMEBAR_STATUS_CLASS,
  INGAME_TIMEBAR_TRACK_INSET,
} from "../../constants/timebar/ingameTimebarLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 시간흐름 바 위 단계 노드 하나 — 활성 단계면 위에 지시 화살표를 추가로 그림 */
function TimebarNode({
  // src: 노드에 그릴 단계 아이콘 이미지 경로
  src,
  // active: 현재 진행 중인 단계인지 여부 — true면 강조 스타일 + 화살표 표시
  active,
}) {
  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {active ? (
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.indicatorArrow}
          alt=""
          aria-hidden="true"
          className={INGAME_TIMEBAR_ARROW_SIZE_CLASS}
        />
      ) : null}
      <PublicAsset
        src={src}
        alt=""
        aria-hidden="true"
        className={`${INGAME_TIMEBAR_NODE_SIZE_CLASS}${
          active ? ` ${INGAME_TIMEBAR_NODE_ACTIVE_CLASS}` : ""
        }`}
      />
    </div>
  )
}

/**
 * 인게임 우측 상단 시간흐름 바 (낮 상태 prototype)
 * 좌측 일차·단계 노드·지시화살표 + 프레임 아래 현재 상태 문구 한 줄
 *
 * 이 컴포넌트는 문구를 직접 파생하지 않는다 — 호출부가 canonical state에서
 * selectInGameTimebarStatusMessage로 계산해 넘긴다(스토어·소켓을 여기서 읽지 않는다).
 * @param {number} day 현재 게임 일차 — 좌측 "제 N일" 라벨
 * @param {string} activePhaseId 강조할 단계 노드 id
 * @param {string|null} statusMessage 프레임 아래에 띄울 현재 상태 문구(없으면 줄 자체를 그리지 않음)
 * @param {string} className 배치 클래스
 * @flow statusMessage가 비어 있으면(ENDED 등) 문구 줄을 렌더하지 않아 기존 표시·레이아웃이 그대로 유지된다.
 */
export default function InGameTimebar({
  // day: 현재 게임 일차 — 좌측 "제 N일" 라벨에 표시
  day = INGAME_TIMEBAR_PREVIEW_DAY,
  // activePhaseId: 현재 활성화된 단계(낮/투표 등)의 id — 해당 노드만 강조 표시
  activePhaseId = INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  // statusMessage: 현재 phase·밤 역할 턴 상태 문구 — 기본값 null이면 지금까지와 완전히 동일한 화면
  statusMessage = null,
  className = INGAME_TIMEBAR_POSITION_CLASS,
}) {
  const dayLabel = `제 ${day}일`

  return (
    <div
      className={`${className} ${INGAME_TIMEBAR_STACK_CLASS}`.trim()}
      aria-label={`${dayLabel} 시간 흐름`}
    >
      <div className="relative w-full leading-none">
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.frame}
          alt=""
          className="block h-auto w-full select-none"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={INGAME_TIMEBAR_DAY_LABEL_INSET}
        >
          <span className={INGAME_TIMEBAR_DAY_LABEL_CLASS}>{dayLabel}</span>
        </div>

        <div
          className={`absolute flex items-center justify-between ${INGAME_TIMEBAR_NODE_GAP_CLASS}`}
          style={INGAME_TIMEBAR_TRACK_INSET}
          aria-hidden="true"
        >
          {INGAME_DAY_TIMEBAR_PHASES.map((phase) => (
            <TimebarNode
              key={phase.id}
              src={phase.src}
              active={phase.id === activePhaseId}
            />
          ))}
        </div>
      </div>

      {typeof statusMessage === "string" && statusMessage.length > 0 ? (
        <p className={INGAME_TIMEBAR_STATUS_CLASS}>{statusMessage}</p>
      ) : null}
    </div>
  )
}