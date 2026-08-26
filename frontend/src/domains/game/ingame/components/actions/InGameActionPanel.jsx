// 파일 역할: InGameActionPanel.jsx - 화면을 구성하는 컴포넌트입니다.
import { useEffect, useState } from "react"
import {
  formatInGameEvent,
  getInGameWinResultLabel,
  INGAME_ACTION_BUTTON_CLASS,
  INGAME_ACTION_BUTTON_ROW_CLASS,
  INGAME_ACTION_CAPTION_CLASS,
  INGAME_ACTION_ERROR_BANNER_CLASS,
  INGAME_ACTION_ERROR_TEXT_CLASS,
  INGAME_ACTION_HEADER_CLASS,
  INGAME_ACTION_META_CLASS,
  INGAME_ACTION_SECTION_CLASS,
  INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS,
  INGAME_ACTION_STATUS_TEXT_CLASS,
  INGAME_ACTION_TITLE_CLASS,
  TRIBUNAL_VOTE_GUILTY_LABEL,
  TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
  TRIBUNAL_VOTE_SUBMIT_LABEL,
  TRIBUNAL_VOTE_SUBMITTING_LABEL,
  TRIBUNAL_DEFENDANT_NOTICE,
  TRIBUNAL_DEAD_NOTICE,
} from "../../constants/actions/ingameActionPanel.js"
import { buildInGameControlPanelE2eAttrs } from "../../constants/e2e/ingameE2eHooks.js"
import { useInGameActionPanel } from "../../hooks/useInGameActionPanel.js"
import { useInGameControlPanelLayout } from "../../hooks/useInGameControlPanelLayout.js"
import InGameTargetPicker from "./InGameTargetPicker.jsx"
import { INGAME_VOTE_ASSETS } from "../../constants/vote/ingameVoteAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 인게임 화면 우측 하단에 상시 떠 있는 단일 컨트롤 패널의 배치 클래스.
// bottom/right로 앵커링해두면 expanded일 때 폭·높이가 늘어나도 항상 우측 하단에 붙은 채
// 위/왼쪽으로만 자라난다.
const CONTROL_PANEL_BASE_CLASS =
  "absolute bottom-[clamp(0.75rem,2vh,1.25rem)] right-[clamp(0.75rem,2vw,1.25rem)] z-30"

// 컨트롤 패널의 실제 프레임/크로마는 "/frame/투표현황창 프레임.png"(INGAME_VOTE_ASSETS.panelFrame)
// 원본 에셋이다. 폭만 compact/expanded로 바꾸고, 높이는 그 PNG의 실제 가로세로 비율을 눈대중
// 추정한 aspect-[734/601]을 따라간다 — CSS로 만든 대체 프레임이 아니라 실제 이미지를 그대로
// 쓰기 위함이다. 추정치가 실제 원본과 살짝 어긋나거나 max-h가 세로 공간이 부족한 뷰포트에서
// 개입하더라도, 이미지 자체는 object-contain이라 늘어나거나 잘리지 않고 여백으로 흡수된다.
const CONTROL_PANEL_COMPACT_SIZE_CLASS =
  "w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(48vh,26rem)] aspect-[734/601]"

const CONTROL_PANEL_EXPANDED_SIZE_CLASS =
  "w-[min(27rem,calc(100vw-1.5rem))] max-h-[min(70vh,40rem)] aspect-[734/601]"

const CONTROL_PANEL_FRAME_WRAP_CLASS =
  "relative overflow-hidden text-[#f8ead2] drop-shadow-[0_18px_46px_rgba(0,0,0,0.55)]"

const CONTROL_PANEL_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-contain"

// 프레임 PNG 내부 콘텐츠 inset — 상단 장식판/박쥐날개, 좌우 기둥, 하단 모서리 장식을 피해
// 실제 조작 UI를 그 안쪽에 배치한다. top/bottom은 컨테이닝 블록의 높이, left/right는 폭을
// 기준으로 계산되므로(절대배치 inset의 표준 동작) 패널 폭이 바뀌어도 비율이 그대로 유지된다.
const CONTROL_PANEL_CONTENT_INSET_STYLE = {
  top: "17%",
  right: "8%",
  bottom: "6%",
  left: "8%",
}

const CONTROL_PANEL_CONTENT_WRAP_CLASS = "absolute z-[2] flex min-h-0 flex-col gap-2"

const CONTROL_PANEL_TOGGLE_BUTTON_CLASS =
  "shrink-0 rounded-full border border-[#d8b982]/35 bg-[#1c0f08]/70 px-2.5 py-1 text-[0.62rem] font-semibold tracking-wide text-[#e9d3ac] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#f3d28d] hover:bg-[#3a2417]/80 hover:text-[#ffe2ad]"

const CONTROL_PANEL_CONTENT_CLASS = "min-h-0 flex-1 overflow-y-auto pr-1"

const CONTROL_PANEL_CONTENT_ID = "ingame-control-panel-content"

// 헤더 상단 줄 — phase 배지와 "제 N일" 타이틀을 한 줄로 묶는다.
const CONTROL_PANEL_HEADER_META_ROW_CLASS = "flex flex-wrap items-center gap-x-1.5 gap-y-0.5"

const CONTROL_PANEL_PHASE_BADGE_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-[#f3d28d]/45 bg-gradient-to-b from-[#3a2417]/85 to-[#1d1108]/85 px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-[#ffe2ad] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"

const CONTROL_PANEL_WIN_BADGE_CLASS =
  "shrink-0 rounded-full border border-[#f3d28d]/60 bg-[#3a2417]/70 px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide text-[#ffe2ad] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"

// 각 섹션 캡션(투표 대상 선택/유무죄 판단/밤 행동/이벤트 로그) 앞에 붙는 작은 금색 악센트
// 바 — 절제된 층위감(요청: 각지고 밋밋한 박스 느낌은 피할 것)을 캡션 레벨에서도 이어간다.
const CONTROL_PANEL_SECTION_HEADER_ROW_CLASS = "flex items-center gap-1.5"

const CONTROL_PANEL_SECTION_ACCENT_CLASS =
  "h-3 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-[#f3d28d] to-[#caa565]/10"

const CONTROL_PANEL_EVENT_COUNT_BADGE_CLASS =
  "ml-auto shrink-0 rounded-full bg-[#1c0f08]/70 px-1.5 py-0.5 text-[0.6rem] font-semibold tabular-nums text-[#caa565]"

// 제출/집계/판정처럼 "앞으로 나아가는" 주요 액션 버튼에 얹는 추가 아웃라인 — box-shadow를 쓰는
// INGAME_ACTION_BUTTON_CLASS의 배경/테두리와 CSS 프로퍼티가 겹치지 않는 outline을 써서, 두
// 클래스 문자열을 합쳐도 서로 덮어쓰지 않는다.
const CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS = "outline outline-1 outline-offset-2 outline-[#f3d28d]/45"

/**
 * 인게임 화면 우측 하단의 상시 노출 컨트롤 패널.
 * TODO: 실제 기획 UI가 들어오면 이 패널은 정식 투표/스킬 UI로 교체합니다.
 *
 * ROLE_REVEAL 단계에서 사용자가 직접 눌러야 진행되던 "역할 확인" 게이트는 파치먼트 역할
 * 공개 오버레이(자동 표시)로 대체됐다 — acknowledge_role_reveal은 이제 useInGameRoleReveal이
 * 화면 표시와 무관하게 배경에서 자동으로 처리하므로, 이 패널은 그 흐름을 막지 않는다.
 * 대신 언제든 오버레이를 다시 볼 수 있는 상시 버튼(onOpenRoleReveal)만 노출한다.
 *
 * interactionBlocked는 DAY/NIGHT 진입 연출처럼 화면을 덮는 표시 전용 오버레이가 떠 있다는
 * 뜻이다 — 그동안에는 투표·재판·밤 행동은 물론 집계/판정 같은 결과 컨트롤까지 전부 잠근다.
 *
 * compact/expanded는 useInGameControlPanelLayout이 관리하는 순수 로컬 UI 상태다 — 이 상태를
 * 접고 펴는 동작 자체는 서버로 아무것도 보내지 않으며, useInGameActionPanel이 들고 있는 선택값·
 * 제출 상태·에러는 접고 펼 때도 전혀 초기화되지 않는다(두 상태가 서로 독립이기 때문).
 *
 * gameState가 있을 때의 aside에는 buildInGameControlPanelE2eAttrs가 만든 data 훅(phase·
 * dayIndex·본인 역할)을 얹는다 — 헤더가 이미 텍스트로 보여주는 값과 같은 값이며, 표시에는
 * 아무 영향이 없다. gameState가 없는 초기 분기의 aside에는 붙이지 않는다(속성의 부재 자체가
 * "아직 세션이 없다"는 신호다).
 *
 * @param {Function} onOpenRoleReveal 역할 공개 오버레이를 다시 여는 콜백
 * @param {boolean} roleRevealAvailable 역할 정보가 갖춰져 "내 역할 보기"를 눌러도 되는가
 * @param {boolean} interactionBlocked 화면을 덮는 오버레이가 떠 있어 조작을 잠가야 하는가
 * @flow gameState가 없으면 대기 패널만 그리고 끝낸다. 있으면 phase(DAY/TRIBUNAL/NIGHT)별
 *   섹션을 조건부로 그리고, 이벤트 로그는 expanded일 때만 붙인다.
 */
export default function InGameActionPanel({
  onOpenRoleReveal,
  roleRevealAvailable = false,
  interactionBlocked = false,
}) {
  const {
    gameState,
    error,
    selectedNightTargetId,
    setSelectedNightTargetId,
    nightActionTargets,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    nightActionStatus,
    nightActionError,
    selectedDayVoteTargetId,
    setSelectedDayVoteTargetId,
    dayVoteTargets,
    dayVoteControlsEnabled,
    submitDayVote,
    abstainDayVote,
    dayVoteStatus,
    dayVoteError,
    dayVoteHasSubmitted,
    dayVoteLastSubmittedTargetId,
    resolveDayVote,
    dayVoteResolveStatus,
    dayVoteResolveError,
    dayVoteResolution,
    submitTribunalVote,
    tribunalVoteStatus,
    tribunalVoteError,
    tribunalVoteSubmittedVote,
    tribunalVoteIsDefendant,
    tribunalVoteAlive,
    tribunalVoteControlsEnabled,
    resolveTribunalVote,
    tribunalResolveError,
    tribunalResolveControlsEnabled,
    tribunalResolveLocked,
    submitNightAction,
    skipNightAction,
    nightActionsLocked,
    nightActionControlsEnabled,
  } = useInGameActionPanel({ interactionBlocked })
  const { expanded, toggle: toggleExpanded } = useInGameControlPanelLayout()
  const [selectedTribunalVote, setSelectedTribunalVote] = useState(null)

  useEffect(() => {
    setSelectedTribunalVote(null)
  }, [
    gameState?.phase,
    gameState?.dayIndex,
    gameState?.tribunal?.defendantUuid,
    gameState?.tribunal?.resolved,
  ])

  if (!gameState) {
    return (
      <aside className={CONTROL_PANEL_BASE_CLASS} aria-label="게임 조작">
        <div className={`${CONTROL_PANEL_FRAME_WRAP_CLASS} ${CONTROL_PANEL_COMPACT_SIZE_CLASS}`}>
          <PublicAsset
            src={INGAME_VOTE_ASSETS.panelFrame}
            alt=""
            className={CONTROL_PANEL_FRAME_IMAGE_CLASS}
          />
          <div className={CONTROL_PANEL_CONTENT_WRAP_CLASS} style={CONTROL_PANEL_CONTENT_INSET_STYLE}>
            <p className={INGAME_ACTION_TITLE_CLASS}>게임 상태 대기</p>
            <p className={INGAME_ACTION_META_CLASS}>매칭에서 게임을 시작하거나 방 코드로 참가하세요.</p>
          </div>
        </div>
      </aside>
    )
  }

  const sizeClass = expanded ? CONTROL_PANEL_EXPANDED_SIZE_CLASS : CONTROL_PANEL_COMPACT_SIZE_CLASS

  return (
    <aside
      className={CONTROL_PANEL_BASE_CLASS}
      aria-label="게임 조작"
      {...buildInGameControlPanelE2eAttrs(gameState)}
    >
      <div className={`${CONTROL_PANEL_FRAME_WRAP_CLASS} ${sizeClass}`}>
        <PublicAsset
          src={INGAME_VOTE_ASSETS.panelFrame}
          alt=""
          className={CONTROL_PANEL_FRAME_IMAGE_CLASS}
        />
        <div className={CONTROL_PANEL_CONTENT_WRAP_CLASS} style={CONTROL_PANEL_CONTENT_INSET_STYLE}>
      <div className={INGAME_ACTION_HEADER_CLASS}>
        <div className="min-w-0 flex-1 space-y-1">
          <div className={CONTROL_PANEL_HEADER_META_ROW_CLASS}>
            <span className={CONTROL_PANEL_PHASE_BADGE_CLASS}>{gameState.phase}</span>
            <p className={INGAME_ACTION_TITLE_CLASS}>제 {gameState.dayIndex}일</p>
          </div>
          <p className={INGAME_ACTION_META_CLASS}>
            역할 {gameState.self?.role ?? "미정"} · 참가자 {gameState.players?.length ?? 0}명
          </p>
        </div>
        {getInGameWinResultLabel(gameState.winResult) ? (
          <p className={CONTROL_PANEL_WIN_BADGE_CLASS}>
            {getInGameWinResultLabel(gameState.winResult)}
          </p>
        ) : null}
        <button
          type="button"
          className={CONTROL_PANEL_TOGGLE_BUTTON_CLASS}
          aria-expanded={expanded}
          aria-controls={CONTROL_PANEL_CONTENT_ID}
          aria-label={expanded ? "컨트롤 패널 접기" : "컨트롤 패널 펼치기"}
          onClick={toggleExpanded}
        >
          {expanded ? "접기 ▾" : "펼치기 ▴"}
        </button>
      </div>

      <div id={CONTROL_PANEL_CONTENT_ID} className={CONTROL_PANEL_CONTENT_CLASS}>
      {error ? (
        <p className={INGAME_ACTION_ERROR_BANNER_CLASS}>
          <span aria-hidden="true" className="mr-1">⚠</span>
          {error}
        </p>
      ) : null}

      <div className={INGAME_ACTION_SECTION_CLASS}>
        <button
          type="button"
          className={`${INGAME_ACTION_BUTTON_CLASS} flex w-full items-center justify-center gap-1.5`}
          disabled={!roleRevealAvailable || interactionBlocked}
          onClick={onOpenRoleReveal}
        >
          <span aria-hidden="true" className="text-[#caa565]">◆</span>
          내 역할 보기
        </button>
      </div>

      {gameState.phase === "DAY" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <div className={CONTROL_PANEL_SECTION_HEADER_ROW_CLASS}>
            <span aria-hidden="true" className={CONTROL_PANEL_SECTION_ACCENT_CLASS} />
            <p className={INGAME_ACTION_CAPTION_CLASS}>투표 대상 선택</p>
          </div>
          <InGameTargetPicker
            players={dayVoteTargets}
            selectedTargetId={selectedDayVoteTargetId}
            onSelect={setSelectedDayVoteTargetId}
            disabled={!dayVoteControlsEnabled || dayVoteStatus === "submitting"}
          />
          <div className={INGAME_ACTION_BUTTON_ROW_CLASS}>
            <button
              type="button"
              className={`${INGAME_ACTION_BUTTON_CLASS} ${CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS}`}
              disabled={!selectedDayVoteTargetId || !dayVoteControlsEnabled || dayVoteStatus === "submitting"}
              onClick={submitDayVote}
            >
              투표
            </button>
            <button
              type="button"
              className={INGAME_ACTION_BUTTON_CLASS}
              disabled={!dayVoteControlsEnabled || dayVoteStatus === "submitting"}
              onClick={abstainDayVote}
            >
              기권
            </button>
            <button
              type="button"
              className={`${INGAME_ACTION_BUTTON_CLASS} ${CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS}`}
              disabled={interactionBlocked || dayVoteResolveStatus !== "idle"}
              onClick={resolveDayVote}
            >
              {dayVoteResolveStatus === "resolving"
                ? "집계 중..."
                : dayVoteResolveStatus === "resolved"
                  ? "집계 완료"
                  : "낮 집계"}
            </button>
          </div>
          {dayVoteError ? (
            <p className={INGAME_ACTION_ERROR_TEXT_CLASS}>{dayVoteError.message}</p>
          ) : dayVoteHasSubmitted ? (
            <p className={INGAME_ACTION_STATUS_TEXT_CLASS}>
              {dayVoteLastSubmittedTargetId === null
                ? "기권함"
                : `투표: ${dayVoteTargets.find((p) => p.id === dayVoteLastSubmittedTargetId)?.name ?? dayVoteLastSubmittedTargetId}`}
            </p>
          ) : null}
          {dayVoteResolveError ? (
            <p className={INGAME_ACTION_ERROR_TEXT_CLASS}>{dayVoteResolveError}</p>
          ) : null}
          {dayVoteResolution ? (
            <p className={INGAME_ACTION_STATUS_TEXT_CLASS}>
              낮 집계 결과: {dayVoteResolution.outcome}
              {dayVoteResolution.outcome === "TRIBUNAL"
                ? ` · 대상 ${dayVoteTargets.find((p) => p.id === dayVoteResolution.tribunalTargetUuid)?.name ?? dayVoteResolution.tribunalTargetUuid}`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {gameState.phase === "TRIBUNAL" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <div className={CONTROL_PANEL_SECTION_HEADER_ROW_CLASS}>
            <span aria-hidden="true" className={CONTROL_PANEL_SECTION_ACCENT_CLASS} />
            <p className={INGAME_ACTION_CAPTION_CLASS}>유무죄 판단</p>
          </div>
          <p className={INGAME_ACTION_META_CLASS}>피고인: {gameState.tribunal?.defendantUuid ?? "없음"}</p>
          {tribunalVoteIsDefendant ? (
            <p className={INGAME_ACTION_META_CLASS}>{TRIBUNAL_DEFENDANT_NOTICE}</p>
          ) : !tribunalVoteAlive ? (
            <p className={INGAME_ACTION_META_CLASS}>{TRIBUNAL_DEAD_NOTICE}</p>
          ) : null}
          <div className={INGAME_ACTION_BUTTON_ROW_CLASS}>
            <button
              type="button"
              className={
                selectedTribunalVote === "GUILTY" ? INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS : INGAME_ACTION_BUTTON_CLASS
              }
              disabled={!tribunalVoteControlsEnabled}
              onClick={() => setSelectedTribunalVote("GUILTY")}
            >
              {TRIBUNAL_VOTE_GUILTY_LABEL}
            </button>
            <button
              type="button"
              className={
                selectedTribunalVote === "NOT_GUILTY"
                  ? INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS
                  : INGAME_ACTION_BUTTON_CLASS
              }
              disabled={!tribunalVoteControlsEnabled}
              onClick={() => setSelectedTribunalVote("NOT_GUILTY")}
            >
              {TRIBUNAL_VOTE_NOT_GUILTY_LABEL}
            </button>
            <button
              type="button"
              className={`${INGAME_ACTION_BUTTON_CLASS} ${CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS}`}
              disabled={!selectedTribunalVote || !tribunalVoteControlsEnabled}
              onClick={() => submitTribunalVote(selectedTribunalVote)}
            >
              {tribunalVoteStatus === "submitting" ? TRIBUNAL_VOTE_SUBMITTING_LABEL : TRIBUNAL_VOTE_SUBMIT_LABEL}
            </button>
            <button
              type="button"
              className={`${INGAME_ACTION_BUTTON_CLASS} ${CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS}`}
              disabled={!tribunalResolveControlsEnabled}
              onClick={resolveTribunalVote}
            >
              {gameState.tribunal?.resolved === true
                ? "판정 완료"
                : tribunalResolveLocked
                  ? "판정 중..."
                  : "재판 판정"}
            </button>
          </div>
          {tribunalVoteError ? (
            <p className={INGAME_ACTION_ERROR_TEXT_CLASS}>{tribunalVoteError}</p>
          ) : tribunalVoteStatus === "submitted" ? (
            <p className={INGAME_ACTION_STATUS_TEXT_CLASS}>
              제출함: {tribunalVoteSubmittedVote === "GUILTY" ? TRIBUNAL_VOTE_GUILTY_LABEL : TRIBUNAL_VOTE_NOT_GUILTY_LABEL}
            </p>
          ) : null}
          {tribunalResolveError ? (
            <p className={INGAME_ACTION_ERROR_TEXT_CLASS}>{tribunalResolveError}</p>
          ) : null}
        </div>
      ) : null}

      {gameState.phase === "NIGHT" ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <div className={CONTROL_PANEL_SECTION_HEADER_ROW_CLASS}>
            <span aria-hidden="true" className={CONTROL_PANEL_SECTION_ACCENT_CLASS} />
            <p className={INGAME_ACTION_CAPTION_CLASS}>밤 행동</p>
          </div>
          {nightActionType === null ? (
            <p className={INGAME_ACTION_META_CLASS}>이 밤에는 행동할 수 없습니다.</p>
          ) : (
            <>
              <InGameTargetPicker
                players={nightActionTargets}
                selectedTargetId={selectedNightTargetId}
                onSelect={setSelectedNightTargetId}
                disabled={!nightActionControlsEnabled || nightActionStatus !== "idle"}
              />
              <div className={INGAME_ACTION_BUTTON_ROW_CLASS}>
                <button
                  type="button"
                  className={`${INGAME_ACTION_BUTTON_CLASS} ${CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS}`}
                  disabled={!nightActionControlsEnabled || nightActionStatus !== "idle" || !hasTarget || nightActionsLocked}
                  onClick={submitNightAction}
                >
                  {nightActionStatus === "submitting"
                    ? "제출 중..."
                    : nightActionLabel
                      ? `${nightActionLabel} 확정`
                      : "행동 확정"}
                </button>
                <button
                  type="button"
                  className={INGAME_ACTION_BUTTON_CLASS}
                  disabled={!nightActionControlsEnabled || nightActionStatus !== "idle" || nightActionsLocked}
                  onClick={skipNightAction}
                >
                  건너뛰기
                </button>
              </div>
              {nightActionError ? (
                <p className={INGAME_ACTION_ERROR_TEXT_CLASS}>{nightActionError}</p>
              ) : nightActionStatus === "submitted" ? (
                <p className={INGAME_ACTION_STATUS_TEXT_CLASS}>제출 완료 · 다음 역할을 기다리는 중</p>
              ) : null}
            </>
          )}
          {/* 개인 조사 결과(GUARD·WITCH_HUNTER)는 이 패널이 아니라 전용 파치먼트 오버레이
              (InGameNightPrivateResultOverlay)가 보여준다 — 여기 있던 디버그용 JSON 표시는
              그 정식 표시 경로로 대체됐다. */}
        </div>
      ) : null}

      {expanded ? (
        <div className={INGAME_ACTION_SECTION_CLASS}>
          <div className={CONTROL_PANEL_SECTION_HEADER_ROW_CLASS}>
            <span aria-hidden="true" className={CONTROL_PANEL_SECTION_ACCENT_CLASS} />
            <p className={INGAME_ACTION_CAPTION_CLASS}>이벤트 로그</p>
            {latestEvents.length ? (
              <span className={CONTROL_PANEL_EVENT_COUNT_BADGE_CLASS}>{latestEvents.length}</span>
            ) : null}
          </div>
          <ul className="mt-1 space-y-1 border-t border-[#d8b982]/15 pt-1.5 text-[0.68rem] leading-tight text-[#e9d6ba]">
            {latestEvents.length ? (
              latestEvents.map((event) => (
                <li
                  key={event.id}
                  className="truncate before:mr-1 before:text-[#caa565]/70 before:content-['·']"
                >
                  {formatInGameEvent(event)}
                </li>
              ))
            ) : (
              <li className="text-[#cdbb9e]/70">이벤트 없음</li>
            )}
          </ul>
        </div>
      ) : null}
      </div>
        </div>
      </div>
    </aside>
  )
}
