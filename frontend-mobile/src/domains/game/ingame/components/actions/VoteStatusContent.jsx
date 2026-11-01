// 투표 현황 내용: 낮 투표 집계(득표·기권·결과·재판 대상), 집계 전이면 안내 글
// 투표 현황 시트(VoteStatusSheet)가 씀, 값은 데스크톱 스토어 dayVoteResolution
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import Row from "./VoteStatusRow.jsx"

// 결과 값 → 화면 글 (데스크톱 투표 현황과 같음)
const OUTCOME_LABELS = Object.freeze({
  TRIBUNAL: "재판 회부",
  TIE: "동점",
  ABSTAINED: "기권 다수",
  REVOTE: "재투표",
})

const UNRESOLVED_LABEL = "집계 전"

// 재판 대상은 uuid 대신 별명으로 보여 줌 (명단에 없으면 uuid 그대로)
export default function VoteStatusContent({ nameOf }) {
  const resolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)

  if (!resolution) {
    return (
      <p className="py-8 text-center font-subheading app-text-scaled [--app-text-size:1.1rem] font-bold text-[#e0c9a3]" data-testid="vote-status-unresolved">
        {UNRESOLVED_LABEL}
      </p>
    )
  }

  const {
    publicVoteCount = null,
    publicAbstainCount = null,
    outcome = null,
    tribunalTargetUuid = null,
  } = resolution
  const targetName = tribunalTargetUuid ? (nameOf?.(tribunalTargetUuid) ?? tribunalTargetUuid) : "없음"

  return (
    <dl className="flex flex-col app-text-scaled [--app-text-size:1rem]" aria-label="낮 투표 집계">
      <Row term="득표" value={publicVoteCount ?? "-"} testId="vote-status-public-vote-count" />
      <Row term="기권" value={publicAbstainCount ?? "-"} testId="vote-status-public-abstain-count" />
      <Row term="결과" value={outcome === null ? "-" : (OUTCOME_LABELS[outcome] ?? outcome)} testId="vote-status-outcome" />
      <Row term="재판 대상" value={targetName} testId="vote-status-tribunal-target" />
    </dl>
  )
}
