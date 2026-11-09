// 투표 현황 목록 내용
// InGameVoteStatusPanel이 씀
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
})

export const INGAME_VOTE_STATUS_UNRESOLVED_LABEL = "집계 전"

// 재판 대상 이름 모를 때 쓰는 이름
const UNKNOWN_TARGET_LABEL = "알 수 없는 플레이어"

export default function InGameVoteStatusContent() {
  const dayVoteResolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)
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
              {tribunalTargetUuid ? tribunalTargetNickname : "없음"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
