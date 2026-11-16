// 투표 현황 내용: 낮 투표 집계(투표 가능·기권·결과·재판 대상), 집계 전이면 안내 글
// 투표 현황 창(VoteStatusPanel)이 씀, 값은 데스크톱 스토어 dayVoteResolution, 모양은 데스크톱 상수
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
  SCROLL_WRAP_CLASS,
  STATUS_SECTION_CLASS,
  STATUS_UNRESOLVED_CLASS,
  STATUS_UNRESOLVED_WRAP_CLASS,
} from "@/domains/game/ingame/constants/vote/ingameVoteLayout.js"
import Row from "./VoteStatusRow.jsx"

// 결과 값 → 화면 글 (데스크톱 화면 파일 안 글이라 import 못 함 → 같은 글 둠)
const OUTCOME_LABELS = Object.freeze({
  TRIBUNAL: "재판 회부",
  TIE: "동점",
  // 기권이 최다 득표 이상이라 재판 없이 밤 (2026-11-16 규칙)
  ABSTAIN_MAJORITY: "기권이 많아 재판 없음",
  ABSTAINED: "전원 기권",
  // 뽑힌 사람이 그 순간 끊겨 있어 재판 없이 밤 (글이 없으면 영어 값이 그대로 보여서 넣음)
  DEFENDANT_DISCONNECTED: "재판 대상의 연결이 끊겨 재판 없음",
})

const UNRESOLVED_LABEL = "집계 전"

// 재판 대상은 uuid 대신 별명 (명단에 없으면 uuid 그대로)
export default function VoteStatusContent({ nameOf }) {
  const resolution = useInGameStore((s) => s.state?.dayVoteResolution ?? null)

  if (!resolution) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={STATUS_UNRESOLVED_WRAP_CLASS}>
          <p className={STATUS_UNRESOLVED_CLASS} data-testid="vote-status-unresolved">{UNRESOLVED_LABEL}</p>
        </div>
      </div>
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={SCROLL_WRAP_CLASS}>
        <dl className={STATUS_SECTION_CLASS} aria-label="낮 투표 집계">
          {/* 값이 산 사람 수(기권 포함)라 "득표" 대신 "투표 가능"으로 씀 (사용자 결정 2026-11-17, PC와 같은 글) */}
          <Row term="투표 가능" value={publicVoteCount ?? "-"} testId="vote-status-public-vote-count" />
          <Row term="기권" value={publicAbstainCount ?? "-"} testId="vote-status-public-abstain-count" />
          <Row term="결과" value={outcome === null ? "-" : (OUTCOME_LABELS[outcome] ?? outcome)} testId="vote-status-outcome" />
          <Row term="재판 대상" value={targetName} testId="vote-status-tribunal-target" />
        </dl>
      </div>
    </div>
  )
}
