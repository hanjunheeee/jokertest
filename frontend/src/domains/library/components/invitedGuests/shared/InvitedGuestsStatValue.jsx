// 표 숫자 값 보이기 (% 붙은 값은 % 글자만 작게)
// left/InvitedGuestsMyJobStats.jsx·shared/InvitedGuestsRankingRow.jsx가 씀
import {
  STAT_CHIP_CLASS,
  STAT_NUMBER_CLASS,
  STAT_PERCENT_SUFFIX_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

// 끝이 %면 숫자와 %를 나눠 다른 모양으로
function renderStatContent(value) {
  const text = String(value)
  const isPercent = text.endsWith("%")
  const number = isPercent ? text.slice(0, -1) : text

  if (isPercent) {
    return (
      <>
        <span className={STAT_NUMBER_CLASS}>{number}</span>
        <span className={STAT_PERCENT_SUFFIX_CLASS}>%</span>
      </>
    )
  }

  return <span className={STAT_NUMBER_CLASS}>{number}</span>
}

// chip이면 테두리 칩으로 감쌈 (지금 chip 넘기는 곳 없음)
export default function InvitedGuestsStatValue({ value, chip = false }) {
  const content = renderStatContent(value)

  if (chip) {
    return <span className={STAT_CHIP_CLASS}>{content}</span>
  }

  return content
}