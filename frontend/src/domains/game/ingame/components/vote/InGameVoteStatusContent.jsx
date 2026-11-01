import {
  SCROLL_WRAP_CLASS,
  STATUS_ROW_CLASS,
  STATUS_SECTION_CLASS,
  STATUS_TERM_CLASS,
  STATUS_UNRESOLVED_CLASS,
  STATUS_UNRESOLVED_WRAP_CLASS,
  STATUS_VALUE_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import { useInGameStore } from "../../store/ingameStore.js"

const OUTCOME_LABELS = Object.freeze({
  TRIBUNAL: "재판 회부",
  TIE: "동점",
  ABSTAINED: "기권 다수",
  REVOTE: "재투표",
})

export const INGAME_VOTE_STATUS_UNRESOLVED_LABEL = "집계 전"

export default function InGameVoteStatusContent() {
  const dayVoteResolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)

  if (!dayVoteResolution) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={STATUS_UNRESOLVED_WRAP_CLASS}>
          <p className={STATUS_UNRESOLVED_CLASS} data-testid="vote-status-unresolved">
            {INGAME_VOTE_STATUS_UNRESOLVED_LABEL}
          </p>
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
            <dt className={STATUS_TERM_CLASS}>득표</dt>
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
              {outcome === null ? "-" : (OUTCOME_LABELS[outcome] ?? outcome)}
            </dd>
          </div>
          <div className={STATUS_ROW_CLASS}>
            <dt className={STATUS_TERM_CLASS}>재판 대상</dt>
            <dd className={STATUS_VALUE_CLASS} data-testid="vote-status-tribunal-target">
              {tribunalTargetUuid ?? "없음"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
