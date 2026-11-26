// 투표 현황 내용: 판정 전엔 "집계 전" + 투표 진행 수, 판정 뒤엔 낮 투표 집계(투표 가능·기권·결과·재판 대상)
// 투표 현황 창(VoteStatusPanel)이 씀, 값은 데스크톱 스토어 dayVoteResolution·progress, 모양은 데스크톱 상수
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { isPublicProgress } from "@/domains/game/ingame/utils/store/gamePayload.js"
import {
  SCROLL_WRAP_CLASS,
  STATUS_PROGRESS_CLASS,
  STATUS_SECTION_CLASS,
  STATUS_UNRESOLVED_CLASS,
  STATUS_UNRESOLVED_STACK_CLASS,
  STATUS_UNRESOLVED_WRAP_CLASS,
} from "@/domains/game/ingame/constants/vote/ingameVoteLayout.js"
import { DAY_VOTE_OUTCOME_TEXTS } from "@/domains/game/ingame/constants/vote/ingameVoteOutcomes.js"
import Row from "./VoteStatusRow.jsx"

const UNRESOLVED_LABEL = "집계 전"
const UNKNOWN_TARGET_LABEL = "알 수 없는 플레이어"

// 낮 투표 중이고 서버가 준 진행 수가 있을 때만 반환 (토론·밤엔 안 보임)
function selectDayVoteProgress(state) {
  if (state?.phase !== "DAY" || state.dayPhase !== "DAY_VOTE") return null
  const progress = state.progress
  if (!isPublicProgress(progress) || progress.kind !== "DAY_VOTE") return null
  return progress
}

// 재판 대상 별명 찾기: 스토어 명단 우선, 없으면 nameOf, 그래도 없거나 생 uuid면 안내 이름
function resolveTargetName(targetUuid, players, nameOf) {
  if (!targetUuid) return "없음"
  const found = (players ?? []).find((player) => player?.uuid === targetUuid)
  if (typeof found?.nickname === "string" && found.nickname.length > 0) return found.nickname
  const mapped = typeof nameOf === "function" ? nameOf(targetUuid) : null
  if (typeof mapped === "string" && mapped.length > 0 && mapped !== targetUuid) return mapped
  return UNKNOWN_TARGET_LABEL
}

// 판정 전엔 진행 수, 판정 뒤엔 집계 표 표시
export default function VoteStatusContent({ nameOf }) {
  const resolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)
  const progressDone = useInGameStore((s) => selectDayVoteProgress(s.state)?.doneCount ?? null)
  const progressRequired = useInGameStore((s) => selectDayVoteProgress(s.state)?.requiredCount ?? null)
  const targetName = useInGameStore((s) =>
    resolveTargetName(s.state?.dayVoteResolution?.tribunalTargetUuid ?? null, s.state?.players, nameOf),
  )

  if (!resolution) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={STATUS_UNRESOLVED_WRAP_CLASS}>
          <div className={STATUS_UNRESOLVED_STACK_CLASS}>
            <p className={STATUS_UNRESOLVED_CLASS} data-testid="vote-status-unresolved">{UNRESOLVED_LABEL}</p>
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
  } = resolution

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={SCROLL_WRAP_CLASS}>
        <dl className={STATUS_SECTION_CLASS} aria-label="낮 투표 집계">
          <Row term="투표 가능" value={publicVoteCount ?? "-"} testId="vote-status-public-vote-count" />
          <Row term="기권" value={publicAbstainCount ?? "-"} testId="vote-status-public-abstain-count" />
          <Row term="결과" value={outcome === null ? "-" : (DAY_VOTE_OUTCOME_TEXTS[outcome]?.label ?? outcome)} testId="vote-status-outcome" />
          <Row term="재판 대상" value={targetName} testId="vote-status-tribunal-target" />
        </dl>
      </div>
    </div>
  )
}
