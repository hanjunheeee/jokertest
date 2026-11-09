// 목록 부품 파일, 넓은 화면(768px 이상)은 표, 휴대폰은 카드로 같은 줄을 보여 줌
// 관리자 목록 화면(회원·신고·문의·결제 등)이 씀
import { useWideScreen } from '@/admin/shared/hooks/useWideScreen'
import StatusNote from '@/admin/shared/ui/StatusNote'

// 칸 값: render 있으면 그걸로, 없으면 row[key], 비면 '—'
const cellOf = (column, row) => {
  if (column.render) return column.render(row)
  const value = row[column.key]
  return value === null || value === undefined || value === '' ? '—' : value
}

function Table({ columns, rows, keyOf, caption }) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-panel">
      <table className="w-full border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-muted">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyOf(row)} className="border-b border-line last:border-b-0">
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2 align-top break-words">{cellOf(column, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 기본 카드: 칸마다 "이름표 값" 한 줄
function DefaultCard({ columns, row }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
      {columns.map((column) => (
        <div key={column.key} className="contents">
          <dt className="text-muted">{column.label}</dt>
          <dd className="min-w-0 break-words">{cellOf(column, row)}</dd>
        </div>
      ))}
    </dl>
  )
}

function Cards({ columns, rows, keyOf, renderCard, caption }) {
  return (
    <ul className="flex flex-col gap-2" aria-label={caption}>
      {rows.map((row) => (
        <li key={keyOf(row)} className="rounded border border-line bg-panel p-3">
          {renderCard ? renderCard(row) : <DefaultCard columns={columns} row={row} />}
        </li>
      ))}
    </ul>
  )
}

// columns: [{ key, label, render? }], rows: 줄 배열, empty: 빈 목록 문구(할 일 알려 주기)
// rowKey: 줄 구별 칸 이름(기본 id), caption: 화면 읽기용 목록 이름
export default function DataList({ columns, rows, renderCard, empty = '아직 보여 줄 줄이 없어요.', rowKey = 'id', caption }) {
  const wide = useWideScreen()
  if (!rows || rows.length === 0) return <StatusNote state="empty">{empty}</StatusNote>
  const keyOf = (row) => row[rowKey]
  return wide
    ? <Table columns={columns} rows={rows} keyOf={keyOf} caption={caption} />
    : <Cards columns={columns} rows={rows} keyOf={keyOf} renderCard={renderCard} caption={caption} />
}
