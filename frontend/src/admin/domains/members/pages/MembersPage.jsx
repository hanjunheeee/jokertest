// 회원 찾기 화면 파일, UUID·이메일 전체·닉네임 앞부분으로 찾아 목록(PC 표·휴대폰 카드) + 더 보기
// 메뉴 표(adminRoutes) '/members/*'가 붙임, 찾는 말은 주소(?q=)에도 남김 → 뒤로 가기·다른 화면에서 바로 열기
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import DataList from '@/admin/shared/ui/DataList'
import { formatKst } from '@/admin/shared/utils/time'
import { searchMembers } from '@/admin/domains/members/api/members.api'
import MemberStatus from '@/admin/domains/members/components/MemberStatus'

const nicknameLink = (row) => <Link className="font-semibold text-accent underline" to={`/members/${row.uuid}`}>{row.nickname}</Link>

const COLUMNS = [
  { key: 'nickname', label: '닉네임', render: nicknameLink },
  { key: 'status', label: '상태', render: (row) => <MemberStatus member={row} /> },
  { key: 'emailMasked', label: '이메일(가림)' },
  { key: 'createdAt', label: '가입일', render: (row) => formatKst(row.createdAt) },
  { key: 'uuid', label: 'UUID', render: (row) => <code className="text-xs break-all">{row.uuid}</code> },
]

// 휴대폰 카드: 닉네임·상태 한 줄 + 가입일·이메일
function MemberCard({ row }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">{nicknameLink(row)} <MemberStatus member={row} /></div>
      <div className="text-muted">가입 {formatKst(row.createdAt)} · {row.emailMasked}</div>
      <code className="text-xs break-all text-muted">{row.uuid}</code>
    </div>
  )
}

function SearchForm({ initial, onSearch }) {
  const [draft, setDraft] = useState(initial)
  const submit = (event) => {
    event.preventDefault()
    if (draft.trim()) onSearch(draft.trim())
  }
  return (
    <form onSubmit={submit} role="search" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
      <Field
        label="찾을 회원"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="UUID, 이메일 전체, 또는 닉네임 앞 2글자 이상"
        hint="닉네임은 앞부분만 맞아도 찾고, 이메일은 전체가 같아야 찾아요."
        autoComplete="off"
      />
      <button type="submit" disabled={!draft.trim()} className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">찾기</button>
    </form>
  )
}

// 찾는 말로 회원 찾기·더 보기, setAttempt로 다시 찾음
function useMemberSearch(q) {
  // 찾은 결과는 찾는 말과 같이 둠 (말이 바뀌면 옛 결과는 안 그림)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const shown = result?.q === q ? result : null

  // 찾는 말이 바뀌거나 다시 누르면 처음부터 (빈 말이면 안 부름), 늦게 온 옛 답은 버림
  useEffect(() => {
    if (!q) return undefined
    let live = true
    searchMembers({ q }).then(
      (page) => { if (live) setResult({ q, items: page.items, nextBefore: page.nextBefore, error: null }) },
      (caught) => { if (live) setResult({ q, items: null, nextBefore: null, error: caught }) },
    )
    return () => { live = false }
  }, [q, attempt])

  // 더 보기: 뒤에 이어 붙임
  const more = async () => {
    setBusy(true)
    try {
      const page = await searchMembers({ q, before: shown.nextBefore })
      setResult({ q, items: [...shown.items, ...page.items], nextBefore: page.nextBefore, error: null })
    } catch (caught) {
      setResult({ ...shown, error: caught })
    } finally {
      setBusy(false)
    }
  }
  return { shown, busy, more, setAttempt }
}

export default function MembersPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const { shown, busy, more, setAttempt } = useMemberSearch(q)
  return (
    <section className="min-w-0">
      <PageHeader title="회원" description="회원을 찾아 상태를 보고, 상세에서 접속 종료·정지·해제를 해요." />
      <SearchForm key={q} initial={q} onSearch={(word) => setParams({ q: word })} />
      {!q ? <StatusNote state="empty">위 칸에 UUID, 이메일, 또는 닉네임을 넣고 찾기를 눌러 주세요.</StatusNote> : null}
      {q && !shown ? <StatusNote state="loading">찾는 중…</StatusNote> : null}
      {shown?.error ? <StatusNote state="error" error={shown.error} onRetry={() => setAttempt((count) => count + 1)} /> : null}
      {shown?.items ? (
        <DataList
          columns={COLUMNS}
          rows={shown.items}
          rowKey="uuid"
          caption="찾은 회원 목록"
          renderCard={(row) => <MemberCard row={row} />}
          empty="없음 — 이 말로 찾은 회원이 없어요. 닉네임 앞부분이나 UUID를 다시 확인해 주세요."
        />
      ) : null}
      {shown?.nextBefore ? (
        <button type="button" disabled={busy} onClick={more} className="mt-3 min-h-11 rounded border border-line px-4 disabled:opacity-50">
          {busy ? '불러오는 중…' : '더 보기'}
        </button>
      ) : null}
    </section>
  )
}
