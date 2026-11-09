// 공지 발송 결과 부품 파일, 받는 사람 수 · 새로 보냄 · 이미 받음(중복) · 실패 수를 한눈에
// AnnouncementsPage가 보낸 뒤 씀 (처리 이력의 공지 줄도 같은 이름표)
const RESULT_LABELS = Object.freeze([
  { key: 'recipientCount', label: '받는 사람' },
  { key: 'created', label: '새로 보냄' },
  { key: 'duplicated', label: '이미 받음(중복)' },
  { key: 'failed', label: '실패' },
])

// result: { recipientCount, created, duplicated, failed }, title: 보낸 공지 제목
export default function SendResult({ result, title }) {
  return (
    <section aria-label="발송 결과" role="status" className="rounded border border-line bg-panel p-4">
      <h2 className="font-bold">발송 결과{title ? ` — ${title}` : ''}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RESULT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded border border-line px-3 py-2">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={`text-2xl font-bold ${key === 'failed' && result[key] > 0 ? 'text-danger' : ''}`}>{result[key]}</dd>
          </div>
        ))}
      </dl>
      {result.failed > 0 ? <p className="mt-2 text-sm text-danger">실패는 없는 회원이거나 저장이 안 된 경우예요. 고른 사람을 다시 확인해 주세요.</p> : null}
      {result.recipientCount === 0 ? <p className="mt-2 text-sm text-muted">지금 받을 사람이 없었어요.</p> : null}
    </section>
  )
}
