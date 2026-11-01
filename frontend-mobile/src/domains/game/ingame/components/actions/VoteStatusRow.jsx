// 투표 현황 한 줄: 이름 칸 + 값 칸, 모양은 데스크톱 현황 줄 상수
// 투표 현황 내용(VoteStatusContent)이 씀
import {
  STATUS_ROW_CLASS,
  STATUS_TERM_CLASS,
  STATUS_VALUE_CLASS,
} from "@/domains/game/ingame/constants/vote/ingameVoteLayout.js"

// 긴 별명은 줄임표 (데스크톱은 uuid라 안 넘쳤음)
export default function VoteStatusRow({ term, value, testId }) {
  return (
    <div className={STATUS_ROW_CLASS}>
      <dt className={STATUS_TERM_CLASS}>{term}</dt>
      <dd className={`${STATUS_VALUE_CLASS} min-w-0 truncate`} data-testid={testId}>{value}</dd>
    </div>
  )
}
