import {
  INGAME_KILL_ANIMATION_VIDEO_URL,
  INGAME_KILL_REVEAL_BACKDROP_CLASS,
  INGAME_KILL_REVEAL_CANVAS_CLASS,
  INGAME_KILL_REVEAL_MESSAGE_CLASS,
  INGAME_KILL_REVEAL_PANEL_WRAP_CLASS,
} from "../../constants/killReveal/ingameKillReveal.js"
import InGameStackedAlphaVideo from "../video/InGameStackedAlphaVideo.jsx"

/**
 * 사망 공개 연출 — stacked MP4를 canvas에 합성해 전체 화면 검정 배경 위에 띄운다(F-27d).
 *
 * 파치먼트 셸을 쓰는 다른 오버레이들과 달리 이 화면은 영상 한 장이 전부라, 공용 셸 대신
 * 자기 backdrop을 직접 그린다(z-[70]/[71] — 파치먼트 계열보다 위).
 *
 * 표시 전용이다: 어떤 소켓 emit도, canonical store 변경도 하지 않는다. 완료(consume)는 오직
 * 아래 세 경로로만 호출부(onConsume)에 알린다 — 어느 경로든 로컬 상태 전이일 뿐이다:
 *
 *   1. 영상이 실제로 끝남(ended) — 정상 완료.
 *   2. 재생 자체가 막힘(media error) — "건너뛰기"로 명시적 계속.
 *   3. 워치독 시간(INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)이 지나도 재생이 안 끝남 —
 *      "건너뛰기"로 명시적 계속. 절대 자동으로(조용히) 다음으로 넘어가지 않는다.
 *
 * play() 호출 자체가 reject되면(자동재생 정책 등) 오버레이는 그대로 떠 있고 "다시 재생"만
 * 노출한다 — 이 경우는 consume하지 않는다(사용자가 다시 시도해야 한다).
 */
export default function InGameKillRevealOverlay({ open, revealId, message, onConsume }) {
  const active = Boolean(open) && typeof revealId === "string" && revealId.length > 0

  if (!active) return null

  return (
    <div className={INGAME_KILL_REVEAL_BACKDROP_CLASS} data-ingame-kill-reveal={revealId}>
      <div className={INGAME_KILL_REVEAL_PANEL_WRAP_CLASS}>
        <InGameStackedAlphaVideo
          playbackKey={revealId}
          src={INGAME_KILL_ANIMATION_VIDEO_URL}
          canvasClassName={INGAME_KILL_REVEAL_CANVAS_CLASS}
          sourceVideoDataAttr="data-ingame-kill-reveal-source-video"
          onFinished={() => onConsume?.(revealId)}
        />
        {message ? <p className={INGAME_KILL_REVEAL_MESSAGE_CLASS}>{message}</p> : null}
      </div>
    </div>
  )
}
