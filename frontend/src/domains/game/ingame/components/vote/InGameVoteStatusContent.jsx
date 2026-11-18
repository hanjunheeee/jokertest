// 투표 현황 목록 내용 (판정 전엔 "집계 전" + 투표 중 낸 사람 수, 판정 뒤엔 결과)
// InGameVoteStatusPanel이 씀
import {
  SCROLL_WRAP_CLASS,
  STATUS_PROGRESS_CLASS,
  STATUS_ROW_CLASS,
  STATUS_SECTION_CLASS,
  STATUS_TERM_CLASS,
  STATUS_UNRESOLVED_CLASS,
  STATUS_UNRESOLVED_STACK_CLASS,
  STATUS_UNRESOLVED_WRAP_CLASS,
  STATUS_VALUE_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import { DAY_VOTE_OUTCOME_TEXTS } from "../../constants/vote/ingameVoteOutcomes.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { isPublicProgress } from "../../utils/store/gamePayload.js"

export const INGAME_VOTE_STATUS_UNRESOLVED_LABEL = "집계 전"

// 재판 대상 이름 모를 때 쓰는 이름
const UNKNOWN_TARGET_LABEL = "알 수 없는 플레이어"

// 지금 낮 투표 중이고 서버가 준 낮 투표 진행 수가 있을 때만 그 칸({ kind, doneCount, requiredCount }), 아니면 null
// 토론 중·밤엔 안 보임 (지난 날 숫자가 남아 있어도 안 그림)
function selectDayVoteProgress(state) {
  if (state?.phase !== "DAY" || state.dayPhase !== "DAY_VOTE") return null
  const progress = state.progress
  if (!isPublicProgress(progress) || progress.kind !== "DAY_VOTE") return null
  return progress
}

export default function InGameVoteStatusContent() {
  const dayVoteResolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)
  // 숫자 둘만 골라 비교 (객체를 새로 만들면 그릴 때마다 바뀐 것으로 봄)
  const progressDone = useInGameStore((s) => selectDayVoteProgress(s.state)?.doneCount ?? null)
  const progressRequired = useInGameStore((s) => selectDayVoteProgress(s.state)?.requiredCount ?? null)
  // 재판 대상은 id 대신 판 명단의 닉네임으로 보여 줌
  const tribunalTargetNickname = useInGameStore((s) => {
    const targetUuid = s.state?.dayVoteResolution?.tribunalTargetUuid ?? null
    if (!targetUuid) return null
    const found = (s.state?.players ?? []).find((player) => player?.uuid === targetUuid)
    return typeof found?.nickname === "string" && found.nickname.length > 0 ? found.nickname : UNKNOWN_TARGET_LABEL
  })

  if (!dayVoteResolution) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={STATUS_UNRESOLVED_WRAP_CLASS}>
          <div className={STATUS_UNRESOLVED_STACK_CLASS}>
            <p className={STATUS_UNRESOLVED_CLASS} data-testid="vote-status-unresolved">
              {INGAME_VOTE_STATUS_UNRESOLVED_LABEL}
            </p>
            {/* 투표 중 진행 수 글: 낸 사람 수 / 산 사람 수 (누가 냈는지·누구를 찍었는지는 안 보임, 사용자 결정 2026-11-18) */}
            {progressDone !== null && progressRequired !== null ? (
              <p className={STATUS_PROGRESS_CLASS} data-testid="vote-status-progress">
                {`${progressDone} / ${progressRequired}명 투표함`}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const {
    publicVoteCount = null,
    publicAbstainCount = null,
    outcome = null,
    tribunalTargetUuid = null,
  } = dayVoteResolution

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={SCROLL_WRAP_CLASS}>
        <dl className={STATUS_SECTION_CLASS} aria-label="낮 투표 집계">
          <div className={STATUS_ROW_CLASS}>
            {/* 값이 산 사람 수(기권 포함)라 "득표" 대신 "투표 가능"으로 씀 (사용자 결정 2026-11-17) */}
            <dt className={STATUS_TERM_CLASS}>투표 가능</dt>
            <dd className={STATUS_VALUE_CLASS} data-testid="vote-status-public-vote-count">
              {publicVoteCount ?? "-"}
            </dd>
          </div>
          <div className={STATUS_ROW_CLASS}>
            <dt className={STATUS_TERM_CLASS}>기권</dt>
            <dd className={STATUS_VALUE_CLASS} data-testid="vote-status-public-abstain-count">
              {publicAbstainCount ?? "-"}
            </dd>
          </div>
          <div className={STATUS_ROW_CLASS}>
            <dt className={STATUS_TERM_CLASS}>결과</dt>
            <dd className={STATUS_VALUE_CLASS} data-testid="vote-status-outcome">
              {outcome === null ? "-" : (DAY_VOTE_OUTCOME_TEXTS[outcome]?.label ?? outcome)}
            </dd>
          </div>
          <div className={STATUS_ROW_CLASS}>
            <dt className={STATUS_TERM_CLASS}>재판 대상</dt>
            <dd className={STATUS_VALUE_CLASS} data-testid="vote-status-tribunal-target">
              {tribunalTargetUuid ? tribunalTargetNickname : "없음"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
