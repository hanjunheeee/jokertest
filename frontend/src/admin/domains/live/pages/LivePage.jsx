// 열린 방·판 화면 파일, 지금 대기방·진행 판(서버 전부 합침) 목록 + 서버별 줄, 못 받은 서버는 "n2 못 받음"
// 메뉴 표(adminRoutes) '/live'가 붙임, 30초마다 백그라운드로 다시 읽음 (활동으로 안 셈)
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import DataList from '@/admin/shared/ui/DataList'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchLive } from '@/admin/domains/live/api/live.api'

export const REFRESH_MS = 30_000

const PHASE_TEXT = { NIGHT: '밤', DAY: '낮', VOTE: '투표', TRIAL: '재판', ENDED: '결과 화면' }
const ACCESS_TEXT = { PUBLIC: '공개', PRIVATE: '비공개' }

// 못 받은 서버 이름 (예: [{node:'n1',ok:true},{node:'n2',ok:false}] → ['n2'])
const missingNodes = (live) => (live?.nodes ?? []).filter((line) => !line.ok).map((line) => line.node)

const nodeColumn = { key: 'node', label: '서버', render: (row) => row.node ?? '이 서버' }

const ROOM_COLUMNS = [
  { key: 'code', label: '방 코드' },
  { key: 'accessType', label: '공개', render: (row) => ACCESS_TEXT[row.accessType] ?? row.accessType ?? '—' },
  { key: 'playerCount', label: '인원', render: (row) => `${row.playerCount}${row.maxPlayers ? ` / ${row.maxPlayers}` : ''}명` },
  nodeColumn,
]

const GAME_COLUMNS = [
  { key: 'roomCode', label: '방 코드' },
  { key: 'phase', label: '단계', render: (row) => `${row.dayIndex ?? '—'}일째 ${PHASE_TEXT[row.phase] ?? row.phase ?? ''}` },
  { key: 'aliveCount', label: '산 사람', render: (row) => `${row.aliveCount ?? '—'} / ${row.playerCount}명` },
  { key: 'startedAt', label: '시작', render: (row) => formatKst(row.startedAt) },
  nodeColumn,
]

const NODE_COLUMNS = [
  { key: 'node', label: '서버' },
  { key: 'ok', label: '상태', render: (row) => (row.ok ? '받음' : `못 받음 (${row.code ?? '응답 없음'})`) },
  { key: 'onlineCount', label: '접속' },
  { key: 'roomCount', label: '대기방' },
  { key: 'gameCount', label: '진행 판' },
]

function Summary({ live }) {
  const maintenance = live.maintenance
  return (
    <p className="mb-3 text-sm">
      접속 {live.onlineCount}명 · 대기방 {live.roomCount}개 · 진행 판 {live.gameCount}개
      {maintenance?.enabled ? ` · 점검 ${maintenance.active ? '중' : `예약 (${formatKst(maintenance.startsAt)})`}` : ''}
    </p>
  )
}

function LiveLists({ live }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">진행 판</h2>
      <DataList columns={GAME_COLUMNS} rows={live.games} rowKey="gameId" caption="진행 판" empty="지금 진행 중인 판이 없어요." />
      <h2 className="text-base font-semibold">대기방</h2>
      <DataList columns={ROOM_COLUMNS} rows={live.rooms} rowKey="roomId" caption="대기방" empty="지금 열린 대기방이 없어요." />
      {live.nodes ? (
        <>
          <h2 className="text-base font-semibold">서버별</h2>
          <DataList columns={NODE_COLUMNS} rows={live.nodes} rowKey="node" caption="서버별 숫자" />
        </>
      ) : null}
    </div>
  )
}

export default function LivePage() {
  const [live, setLive] = useState(null)
  const [error, setError] = useState(null)
  const [readAt, setReadAt] = useState(null)
  const alive = useRef(true)

  // 화면이 사라진 뒤 온 답은 버림
  const show = useCallback((next) => {
    if (!alive.current) return
    setLive(next)
    setError(null)
    setReadAt(new Date().toISOString())
  }, [])
  const fail = useCallback((caught) => {
    if (alive.current) setError(caught)
  }, [])
  const load = useCallback((background = false) => fetchLive({ background }).then(show, fail), [show, fail])

  useEffect(() => {
    alive.current = true
    load()
    const timer = setInterval(() => load(true), REFRESH_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [load])

  const missing = missingNodes(live)
  return (
    <section className="min-w-0">
      <PageHeader
        title="열린 방·판"
        description={readAt ? `서버 전부 합침 · 30초마다 새로 읽어요 · 마지막 ${formatKst(readAt)}` : '서버 전부 합침 · 30초마다 새로 읽어요'}
        actions={<button type="button" onClick={() => load()} className="min-h-11 rounded border border-line px-3">지금 새로 읽기</button>}
      />
      {!live && !error ? <StatusNote state="loading" /> : null}
      {!live && error ? <StatusNote state="error" error={error} onRetry={() => load()} /> : null}
      {live && error ? <p role="alert" className="mb-3 text-sm text-danger">새로 읽지 못했어요: {adminErrorText(error)} (아래는 마지막 목록)</p> : null}
      {missing.length > 0 ? (
        <p role="alert" className="mb-3 rounded border border-danger/40 px-3 py-2 text-sm text-danger">
          {missing.map((node) => `${node} 못 받음`).join(', ')} — 그 서버의 방·판은 목록에 없어요.
        </p>
      ) : null}
      {live ? <Summary live={live} /> : null}
      {live ? <LiveLists live={live} /> : null}
    </section>
  )
}
