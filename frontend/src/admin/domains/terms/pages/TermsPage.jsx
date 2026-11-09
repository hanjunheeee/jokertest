// 약관 화면 파일, 버전 목록(종류별·지금 시행 중·동의 수) + 새 버전 넣기(본문·주소·시행일, 확인 창 한 번 더)
// 메뉴 표(adminRoutes) '/terms'가 붙임, 시행일이 지나면 플레이어가 다음 접속 때 다시 동의 (기존 플레이어 경로)
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import DataList from '@/admin/shared/ui/DataList'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import { formatKst } from '@/admin/shared/utils/time'
import { createTerms, fetchTerms, kstInputToIso, toTermsInput } from '@/admin/domains/terms/api/terms.api'

const KIND_TEXT = { TERMS: '이용약관', PRIVACY: '개인정보 처리방침' }
const EMPTY_FORM = { kind: 'TERMS', version: '', title: '', body: '', url: '', effectiveAt: '', isRequired: true }

// 넣기 버튼 켜기 조건: 버전·제목·시행일 + 본문이나 주소
const isReady = (form) => Boolean(form.version.trim() && form.title.trim() && form.effectiveAt && (form.body.trim() || form.url.trim()))

const COLUMNS = [
  { key: 'kind', label: '종류', render: (row) => KIND_TEXT[row.kind] ?? row.kind },
  { key: 'version', label: '버전', render: (row) => (row.isCurrent ? `${row.version} (지금 시행 중)` : row.version) },
  { key: 'title', label: '제목' },
  { key: 'effectiveAt', label: '시행일', render: (row) => formatKst(row.effectiveAt) },
  { key: 'isRequired', label: '필수', render: (row) => (row.isRequired ? '필수' : '선택') },
  { key: 'agreedCount', label: '동의한 사람', render: (row) => `${row.agreedCount.toLocaleString('ko-KR')}명` },
]

function TermsForm({ form, onChange, fieldError, onSubmit }) {
  const set = (key) => (event) => onChange({ ...form, [key]: event.target.value })
  const errorOf = (key) => (fieldError === key ? '이 칸을 다시 확인해 주세요.' : undefined)
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit() }} className="flex flex-col gap-3 rounded border border-line bg-panel p-3">
      <h2 className="text-base font-semibold">새 버전 넣기</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field as="select" label="종류" value={form.kind} onChange={set('kind')} error={errorOf('kind')}>
          <option value="TERMS">이용약관</option>
          <option value="PRIVACY">개인정보 처리방침</option>
        </Field>
        <Field label="버전" value={form.version} onChange={set('version')} hint="영문·숫자·점·-·_ (예: 1.1)" maxLength={40} error={errorOf('version')} />
        <Field label="제목" value={form.title} onChange={set('title')} maxLength={100} error={errorOf('title')} />
        <Field label="시행일 (한국 시각)" type="datetime-local" value={form.effectiveAt} onChange={set('effectiveAt')} hint="지금보다 뒤로" error={errorOf('effectiveAt')} />
      </div>
      <Field as="textarea" label="본문" rows={6} value={form.body} onChange={set('body')} hint="본문이나 전문 주소 중 하나는 넣어 주세요" error={errorOf('body')} />
      <Field label="전문 주소 (https://…)" type="url" value={form.url} onChange={set('url')} maxLength={500} error={errorOf('url')} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isRequired} onChange={(event) => onChange({ ...form, isRequired: event.target.checked })} />
        필수 동의 (끄면 선택 동의)
      </label>
      <button type="submit" disabled={!isReady(form)} className="min-h-11 self-start rounded bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
        새 버전 넣기
      </button>
    </form>
  )
}

export default function TermsPage() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [confirming, setConfirming] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [done, setDone] = useState(null)

  const load = useCallback(() => {
    setError(null)
    fetchTerms().then((result) => setItems(result.items), setError)
  }, [])

  // 처음 한 번 (상태는 답 온 뒤에만 바꿈)
  useEffect(() => {
    fetchTerms().then((result) => setItems(result.items), setError)
  }, [])

  // 확인 창에서 누름: 실패는 창이 보여 주고, 칸 틀림이면 그 칸 표시
  const save = async () => {
    try {
      const { terms } = await createTerms(toTermsInput(form))
      setConfirming(false)
      setForm(EMPTY_FORM)
      setFieldError(null)
      setDone(`${KIND_TEXT[terms.kind]} ${terms.version}을 넣었어요. ${formatKst(terms.effectiveAt)}부터 플레이어가 다음 접속 때 다시 동의해요.`)
      load()
    } catch (caught) {
      setFieldError(caught.details?.field ?? null)
      throw caught
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <PageHeader title="약관" description="새 버전은 시행일이 지나면 플레이어가 다음 접속 때 다시 동의해요. 넣은 버전은 고치거나 지울 수 없어요" />
      {done ? <p role="status" className="rounded border border-line px-3 py-2 text-sm">{done}</p> : null}
      <TermsForm form={form} onChange={setForm} fieldError={fieldError} onSubmit={() => { setDone(null); setConfirming(true) }} />
      <h2 className="text-base font-semibold">버전 목록</h2>
      {error ? <StatusNote state="error" error={error} onRetry={load} /> : null}
      {!items && !error ? <StatusNote state="loading" /> : null}
      {items ? <DataList columns={COLUMNS} rows={items} caption="약관 버전 목록" empty="아직 약관 버전이 없어요. 위에서 넣어 주세요." /> : null}
      {confirming ? (
        <ConfirmDialog
          title="약관 새 버전을 넣을까요?"
          lines={[
            `종류: ${KIND_TEXT[form.kind]}`,
            `버전: ${form.version.trim()}`,
            `시행일: ${formatKst(kstInputToIso(form.effectiveAt))}`,
            form.isRequired ? '필수 동의' : '선택 동의',
            '넣은 뒤에는 고치거나 지울 수 없어요.',
          ]}
          confirmLabel="넣기"
          onConfirm={save}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  )
}
