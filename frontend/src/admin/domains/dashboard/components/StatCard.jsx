// 숫자 카드 부품 파일, 제목 + 큰 숫자(또는 "지금 숫자 못 받음") + 아래 한 줄 + 누르면 갈 곳
// DashboardPage가 운영 현황 칸마다 씀
import { Link } from 'react-router-dom'

export const UNAVAILABLE_TEXT = '지금 숫자 못 받음'

// 숫자 → 세 자리 쉼표 (예: 12345 → '12,345'), null이면 못 받음 문구
const showValue = (value) => (value === null || value === undefined ? UNAVAILABLE_TEXT : Number(value).toLocaleString('ko-KR'))

// highlight: 처리할 게 있으면 강조색 테두리 (새 신고·새 문의)
export default function StatCard({ title, value, unit, text, note, to, highlight = false }) {
  const missing = text === undefined && (value === null || value === undefined)
  const body = (
    <>
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <p className={missing ? 'mt-2 text-base font-medium text-danger' : 'mt-1 text-3xl font-bold tabular-nums'}>
        {text ?? showValue(value)}
        {!missing && text === undefined && unit ? <span className="ml-1 text-base font-medium text-muted">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
    </>
  )
  const frame = `block min-h-28 rounded border bg-panel p-4 ${highlight ? 'border-accent' : 'border-line'}`
  return (
    <li className="list-none">
      {to ? <Link to={to} className={`${frame} hover:bg-page`}>{body}</Link> : <div className={frame}>{body}</div>}
    </li>
  )
}
