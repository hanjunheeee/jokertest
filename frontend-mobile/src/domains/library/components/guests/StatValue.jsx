// 표 숫자 값 (% 붙은 값은 % 글자만 작게)
// guests/MyStats.jsx·guests/RankingTable.jsx가 씀, 모양은 데스크톱 tableStyle과 같은 값
import { STAT_NUMBER_CLASS, STAT_PERCENT_CLASS } from "@m/domains/library/constants/guestsStyle.js"

// 끝이 %면 숫자와 %를 나눠 다른 모양으로
export default function StatValue({ value }) {
  const text = String(value)
  if (!text.endsWith("%")) return <span className={STAT_NUMBER_CLASS}>{text}</span>

  return (
    <>
      <span className={STAT_NUMBER_CLASS}>{text.slice(0, -1)}</span>
      <span className={STAT_PERCENT_CLASS}>%</span>
    </>
  )
}
