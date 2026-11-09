// 서버별 결과 부품 파일, 저장 뒤 서버마다 반영 됨/안 됨 + 시작 시각 강제 종료 결과(끝낸 판·닫은 방)
// 점검 화면(MaintenancePage)이 저장 응답 nodes·보기 응답 forceEnds로 그림
import { formatKst } from '@/admin/shared/utils/time'

// 반영 결과 한 줄 글귀, 예: { node:'n2', ok:false, code:'RPC_TIMEOUT' } → 'n2 반영 안 됨 (RPC_TIMEOUT)'
const nodeLineText = ({ node, ok, code }) => (ok ? `${node} 반영됨` : `${node} 반영 안 됨${code ? ` (${code})` : ''}`)

// 저장 뒤 반영 결과 (nodes 없으면 안 그림)
export function ReloadResults({ nodes, partial }) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null
  return (
    <section aria-labelledby="reload-results-title" className="rounded border border-line bg-panel p-4">
      <h2 id="reload-results-title" className="text-base font-bold">서버별 반영</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {nodes.map((line) => (
          <li key={line.node} className={line.ok ? '' : 'font-semibold text-danger'}>{nodeLineText(line)}</li>
        ))}
      </ul>
      {partial ? <p className="mt-2 text-sm text-muted">반영 안 된 서버는 60초 안에 스스로 다시 읽어요. 그래도 안 되면 그 서버를 살펴봐 주세요.</p> : null}
    </section>
  )
}

// 시작 시각 강제 종료 결과 (서버마다 한 줄)
export function ForceEndResults({ forceEnds }) {
  if (!Array.isArray(forceEnds) || forceEnds.length === 0) return null
  return (
    <section aria-labelledby="force-end-title" className="rounded border border-line bg-panel p-4">
      <h2 id="force-end-title" className="text-base font-bold">시작 시각 강제 종료</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {forceEnds.map((line) => (
          <li key={`${line.node}-${line.at}`}>{line.node}: 판 {line.games}개 끝냄 · 방 {line.rooms}개 닫음 <span className="text-muted">({formatKst(line.at)})</span></li>
        ))}
      </ul>
    </section>
  )
}
