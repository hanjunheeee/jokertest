// 지난 판 하나 화면 파일, 판 정보(시작·끝·시간·이긴 쪽·끝난 이유) + 참가자(직업·진영·승패·살았나·죽은 이유)
// GamesPage 안 경로 '/games/:gameId'가 붙임, 참가자 이름 누르면 회원 상세로
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import DataList from '@/admin/shared/ui/DataList'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchGame } from '@/admin/domains/games/api/games.api'
import { deathText, durationText, roleText, teamText, winReasonText, wonText } from '@/admin/domains/games/labels'

const PLAYER_COLUMNS = [
  { key: 'nickname', label: '닉네임(그 판 때)', render: (row) => <Link className="text-accent underline" to={`/members/${row.uuid}`}>{row.nickname}</Link> },
  { key: 'role', label: '직업', render: (row) => roleText(row.role) },
  { key: 'team', label: '진영', render: (row) => teamText(row.team) },
  { key: 'won', label: '승패', render: (row) => wonText(row.won) },
  { key: 'alive', label: '끝날 때', render: (row) => (row.alive ? '살아 있음' : `죽음 (${deathText(row.deathReason)})`) },
]

function GameFacts({ game }) {
  const facts = [
    ['시작', formatKst(game.startedAt)],
    ['끝', formatKst(game.endedAt)],
    ['판 시간', durationText(game.durationSec)],
    ['이긴 쪽', teamText(game.winner)],
    ['끝난 이유', winReasonText(game.winReason)],
    ['날짜 수', `${game.dayIndex}일째`],
    ['인원', `${game.playerCount}명`],
  ]
  return (
    <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded border border-line bg-panel p-3 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function GameDetailPage() {
  const { gameId } = useParams()
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    fetchGame(gameId).then(setDetail, setError)
  }, [gameId])

  // 판 번호 바뀔 때마다 (상태는 답 온 뒤에만 바꿈)
  useEffect(() => {
    fetchGame(gameId).then(setDetail, setError)
  }, [gameId])

  return (
    <section className="min-w-0">
      <PageHeader title="판 하나" description={`판 번호 ${gameId}`} actions={<Link to="/games" className="inline-flex min-h-11 items-center rounded border border-line px-3">목록으로</Link>} />
      {error ? <StatusNote state="error" error={error} onRetry={error.code === 'GAME_NOT_FOUND' ? undefined : load} /> : null}
      {!detail && !error ? <StatusNote state="loading" /> : null}
      {detail ? (
        <>
          {detail.game.winReason === 'MAINTENANCE' ? (
            <p className="mb-3 rounded border border-line px-3 py-2 text-sm">점검으로 끝난 판이라 승패·보상·벌점이 없어요.</p>
          ) : null}
          <GameFacts game={detail.game} />
          <h2 className="mb-2 text-base font-semibold">참가자</h2>
          <DataList columns={PLAYER_COLUMNS} rows={detail.players} rowKey="uuid" caption="참가자" empty="참가자 기록이 없어요." />
        </>
      ) : null}
    </section>
  )
}
