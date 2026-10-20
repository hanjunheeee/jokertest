import {
  INGAME_VOTE_SCROLL_WRAP_CLASS,
  INGAME_VOTE_STATUS_ROW_CLASS,
  INGAME_VOTE_STATUS_SECTION_CLASS,
  INGAME_VOTE_STATUS_TERM_CLASS,
  INGAME_VOTE_STATUS_UNRESOLVED_CLASS,
  INGAME_VOTE_STATUS_UNRESOLVED_WRAP_CLASS,
  INGAME_VOTE_STATUS_VALUE_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import { useInGameStore } from "../../store/ingameStore.js"

/**
 * 투표 현황 창 본문.
 *
 * V-2(AC-04): 더 이상 더미 득표 수를 보여주지 않는다. 예전에는 DUMMY_VOTE_COUNTS를 세션
 * 참가자 수만큼 잘라 개인별 득표 행을 그렸는데, 그 숫자는 서버가 말한 적이 없는 값이라
 * 화면이 사실이 아닌 집계를 단언하고 있었다(제출 버튼도 no-op이었다).
 *
 * 서버가 실제로 주는 낮 투표 집계는 **개인별 득표가 아니라** 라운드 단위 결과 하나다
 * (state.dayVoteResolution: 총 득표·총 기권·결과·재판 대상). 그래서 이 화면도 그것만
 * 그린다 — 아직 집계되지 않았으면 "집계 전"이라고 말할 뿐, 없는 숫자를 만들어 내지 않는다.
 */

const OUTCOME_LABELS = Object.freeze({
  TRIBUNAL: "재판 회부",
  TIE: "동점",
  ABSTAINED: "기권 다수",
  REVOTE: "재투표",
})

/** 아직 어떤 라운드도 집계되지 않았음을 말하는 문구. 숫자 0과 구별되어야 한다. */
export const INGAME_VOTE_STATUS_UNRESOLVED_LABEL = "집계 전"

export default function InGameVoteStatusContent() {
  const dayVoteResolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)

  if (!dayVoteResolution) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={INGAME_VOTE_STATUS_UNRESOLVED_WRAP_CLASS}>
          <p className={INGAME_VOTE_STATUS_UNRESOLVED_CLASS} data-testid="vote-status-unresolved">
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
      <div className={INGAME_VOTE_SCROLL_WRAP_CLASS}>
        <dl className={INGAME_VOTE_STATUS_SECTION_CLASS} aria-label="낮 투표 집계">
          <div className={INGAME_VOTE_STATUS_ROW_CLASS}>
            <dt className={INGAME_VOTE_STATUS_TERM_CLASS}>득표</dt>
            <dd className={INGAME_VOTE_STATUS_VALUE_CLASS} data-testid="vote-status-public-vote-count">
              {publicVoteCount ?? "-"}
            </dd>
          </div>
          <div className={INGAME_VOTE_STATUS_ROW_CLASS}>
            <dt className={INGAME_VOTE_STATUS_TERM_CLASS}>기권</dt>
            <dd className={INGAME_VOTE_STATUS_VALUE_CLASS} data-testid="vote-status-public-abstain-count">
              {publicAbstainCount ?? "-"}
            </dd>
          </div>
          <div className={INGAME_VOTE_STATUS_ROW_CLASS}>
            <dt className={INGAME_VOTE_STATUS_TERM_CLASS}>결과</dt>
            <dd className={INGAME_VOTE_STATUS_VALUE_CLASS} data-testid="vote-status-outcome">
              {/* 서버가 아직 모르는 결과 이름이 와도 그 값을 그대로 보여준다 — 화면이 임의로
                  다른 결과로 바꿔 말하지 않는다. */}
              {outcome === null ? "-" : (OUTCOME_LABELS[outcome] ?? outcome)}
            </dd>
          </div>
          <div className={INGAME_VOTE_STATUS_ROW_CLASS}>
            <dt className={INGAME_VOTE_STATUS_TERM_CLASS}>재판 대상</dt>
            <dd className={INGAME_VOTE_STATUS_VALUE_CLASS} data-testid="vote-status-tribunal-target">
              {tribunalTargetUuid ?? "없음"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
