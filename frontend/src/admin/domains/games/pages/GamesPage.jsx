// 지난 판 화면 파일, 판 찾기(회원 UUID·한국 날짜) 목록 + 더 보기, 줄 누르면 판 하나(/games/:gameId)
// 메뉴 표(adminRoutes) '/games/*'가 붙임, 찾기 칸은 주소(?userUuid=)에도 남김 → 회원·신고 화면에서 바로 열 수 있음
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useSearchParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import DataList from '@/admin/shared/ui/DataList'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchGames } from '@/admin/domains/games/api/games.api'
import { teamText, winReasonText } from '@/admin/domains/games/labels'
import GameDetailPage from '@/admin/domains/games/pages/GameDetailPage'

const FILTER_KEYS = ['userUuid', 'from', 'to']

// 주소 칸 → 찾기 값 (예: '?userUuid=abc' → { userUuid:'abc', from:'', to:'' })
const filtersOf = (params) => Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']))

const COLUMNS = [
  { key: 'endedAt', label: '끝난 시각', render: (row) => <Link className="text-accent underline" to={`/games/${row.gameId}`}>{formatKst(row.endedAt)}</Link> },
  { key: 'winner', label: '이긴 쪽', render: (row) => teamText(row.winner) },
  { key: 'winReason', label: '끝난 이유', render: (row) => winReasonText(row.winReason) },
  { key: 'playerCount', label: '인원', render: (row) => `${row.playerCount}명` },
  { key: 'dayIndex', label: '날짜 수', render: (row) => `${row.dayIndex}일째` },
]

function SearchForm({ initial, onSearch }) {
  const [draft, setDraft] = useState(initial)
  const set = (key) => (event) => setDraft({ ...draft, [key]: event.target.value.trim() })
  const submit = (event) => {
    event.preventDefault()
    onSearch(draft)
  }
  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
      <Field label="회원 UUID" value={draft.userUuid} onChange={set('userUuid')} placeholder="비우면 모든 판" autoComplete="off" />
      <Field label="시작 날짜" type="date" value={draft.from} onChange={set('from')} />
      <Field label="끝 날짜" type="date" value={draft.to} onChange={set('to')} />
      <button type="submit" className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink">찾기</button>
    </form>
  )
}

function GameList() {
  const [params, setParams] = useSearchParams()
  const filters = filtersOf(params)
  const filterKey = params.toString()
  const [items, setItems] = useState(null)
  const [nextBefore, setNextBefore] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // before 있으면 뒤에 이어 붙임
  const load = useCallback(async (picked, before) => {
    setBusy(true)
    setError(null)
    try {
      const page = await fetchGames({ ...picked, before })
      setItems((shown) => (before ? [...(shown ?? []), ...page.items] : page.items))
      setNextBefore(page.nextBefore)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }, [])

  // 주소 칸이 바뀔 때마다 처음부터 (상태는 답 온 뒤에만 바꿈)
  useEffect(() => {
    fetchGames(filtersOf(new URLSearchParams(filterKey))).then((page) => {
      setError(null)
      setItems(page.items)
      setNextBefore(page.nextBefore)
    }, setError)
  }, [filterKey])

  const search = (draft) => setParams(Object.fromEntries(Object.entries(draft).filter(([, value]) => value)))

  return (
    <section className="min-w-0">
      <PageHeader title="지난 판" description="회원 UUID나 날짜(한국 날짜)로 찾아요. 늦게 끝난 판부터 보여요" />
      <SearchForm key={filterKey} initial={filters} onSearch={search} />
      {error ? <StatusNote state="error" error={error} onRetry={() => load(filters)} /> : null}
      {!items && !error ? <StatusNote state="loading" /> : null}
      {items ? <DataList columns={COLUMNS} rows={items} rowKey="gameId" caption="지난 판 목록" empty="찾은 판이 없어요. 회원이나 날짜를 바꿔 보세요." /> : null}
      {nextBefore ? (
        <button type="button" disabled={busy} onClick={() => load(filters, nextBefore)} className="mt-3 min-h-11 rounded border border-line px-4 disabled:opacity-50">
          {busy ? '불러오는 중…' : '더 보기'}
        </button>
      ) : null}
    </section>
  )
}

export default function GamesPage() {
  return (
    <Routes>
      <Route index element={<GameList />} />
      <Route path=":gameId" element={<GameDetailPage />} />
    </Routes>
  )
}
