// 파일 역할: InGameActionPanel.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  formatInGameEvent,
  INGAME_ACTION_BUTTON_CLASS,
  INGAME_ACTION_HEADER_CLASS,
  INGAME_ACTION_META_CLASS,
  INGAME_ACTION_PANEL_CLASS,
  INGAME_ACTION_SECTION_CLASS,
  INGAME_ACTION_TITLE_CLASS,
} from "../../constants/actions/ingameActionPanel.js"
import { useInGameActionPanel } from "../../hooks/useInGameActionPanel.js"
import { useInGameRoleRevealAck } from "../../hooks/useInGameRoleRevealAck.js"
import InGameTargetPicker from "./InGameTargetPicker.jsx"

/**
 * 개발용 인게임 조작 패널.
 * TODO: 실제 기획 UI가 들어오면 이 패널은 정식 투표/스킬 UI로 교체합니다.
 */
export default function InGameActionPanel() {
  const {
    gameState,
    error,
    selectedTargetId,
    setSelectedTargetId,
    nightActionTargets,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    nightActionStatus,
    nightActionError,
    submitDayVote,
    resolveDayVote,
    submitTribunalVote,
    resolveTribunalVote,
    submitNightAction,
    skipNightAction,
    nightActionsLocked,
    resolveNight,
    resolveNightStatus,
    resolveNightError,
    nightActionResult,
  } = useInGameActionPanel()
  const roleReveal = useInGameRoleRevealAck()

  if (!gameState) {
    return (
      <aside className={INGAME_ACTION_PANEL_CLASS} aria-label="게임 조작">
        <p className={INGAME_ACTION_TITLE_CLASS}>게임 상태 대기</p>
        <p className={INGAME_ACTION_META_CLASS}>매칭에서 게임을 시작하거나 방 코드로 참가하세요.</p>
      </aside>
    )
  }

  return (
    <aside className={INGAME_ACTION_PANEL_CLASS} aria-label="게임 조작">
      <div className={INGAME_ACTION_HEADER_CLASS}>
        <div>
          <p className={INGAME_ACTION_TITLE_CLASS}>
            {gameState.phase} · 제 {gameState.dayIndex}일
          </p>
          <p className={INGAME_ACTION_META_CLASS}>
            역할 {gameState.self?.role ?? "미정"} · 참가자 {gameState.players?.length ?? 0}명
          </p>
        </div>
        {gameState.winResult ? (
          <p className="rounded border border-[#f3d28d]/60 px-2 py-1 text-xs text-[#ffe2ad]">
            {gameState.winResult.winner} 승리
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded border border-red-300/40 bg-red-950/40 px-2 py-1 text-xs text-red-100">
          {error}
        </p>
      ) : null}

      {gameState.phase === "ROLE_REVEAL" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <p className={INGAME_ACTION_META_CLASS}>당신의 역할: {gameState.self?.role ?? "확인 중"}</p>
          <button
            type="button"
            className={INGAME_ACTION_BUTTON_CLASS}
            disabled={roleReveal.status !== "idle"}
            onClick={roleReveal.acknowledge}
          >
            {roleReveal.status === "acked" ? "확인 완료 · 대기 중" : "역할 확인"}
          </button>
          {roleReveal.error ? (
            <p className="text-[0.68rem] text-red-300">{roleReveal.error}</p>
          ) : null}
        </div>
      ) : null}

      {gameState.phase === "DAY" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <InGameTargetPicker
            players={gameState.players}
            selectedTargetId={selectedTargetId}
            onSelect={setSelectedTargetId}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              disabled={!hasTarget}
              onClick={submitDayVote}
            >
              투표
            </button>
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              onClick={resolveDayVote}
            >
              낮 집계
            </button>
          </div>
        </div>
      ) : null}

      {gameState.phase === "TRIBUNAL" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <p className={INGAME_ACTION_META_CLASS}>후보자: {gameState.tribunal?.candidateId ?? "없음"}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              onClick={() => submitTribunalVote("APPROVE")}
            >
              찬성
            </button>
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              onClick={() => submitTribunalVote("REJECT")}
            >
              반대
            </button>
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              onClick={resolveTribunalVote}
            >
              처형 결정
            </button>
          </div>
        </div>
      ) : null}

      {gameState.phase === "NIGHT" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          {nightActionType === null ? (
            <p className={INGAME_ACTION_META_CLASS}>이 밤에는 행동할 수 없습니다.</p>
          ) : (
            <>
              <InGameTargetPicker
                players={nightActionTargets}
                selectedTargetId={selectedTargetId}
                onSelect={setSelectedTargetId}
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={INGAME_ACTION_BUTTON_CLASS}
                  disabled={nightActionStatus === "submitting" || !hasTarget || nightActionsLocked}
                  onClick={submitNightAction}
                >
                  {nightActionLabel}
                </button>
                <button
                  type="button"
                  className={INGAME_ACTION_BUTTON_CLASS}
                  disabled={nightActionStatus === "submitting" || nightActionsLocked}
                  onClick={skipNightAction}
                >
                  건너뛰기
                </button>
              </div>
              {nightActionError ? (
                <p className="text-[0.68rem] text-red-300">{nightActionError}</p>
              ) : null}
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              disabled={resolveNightStatus !== "idle"}
              onClick={resolveNight}
            >
              {resolveNightStatus === "resolving"
                ? "판정 중..."
                : resolveNightStatus === "resolved"
                  ? "판정 완료"
                  : "밤 종료"}
            </button>
          </div>
          {resolveNightError ? (
            <p className="text-[0.68rem] text-red-300">{resolveNightError}</p>
          ) : null}
          {nightActionResult ? (
            <p className="text-[0.68rem] text-[#e9d6ba]">
              개인 결과: {JSON.stringify(
                Object.fromEntries(
                  Object.entries(nightActionResult).filter(
                    ([key]) => key !== "gameId" && key !== "dayIndex",
                  ),
                ),
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={INGAME_ACTION_SECTION_CLASS}>
        <p className={INGAME_ACTION_META_CLASS}>이벤트</p>
        <ul className="space-y-1 text-[0.68rem] leading-tight text-[#e9d6ba]">
          {latestEvents.length ? (
            latestEvents.map((event) => (
              <li key={event.id} className="truncate">
                {formatInGameEvent(event)}
              </li>
            ))
          ) : (
            <li>이벤트 없음</li>
          )}
        </ul>
      </div>
    </aside>
  )
}
