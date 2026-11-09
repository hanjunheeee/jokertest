// 운영 현황 화면 파일, 첫 화면: 가입자·오늘 총 판·진행 중 판·접속·새 신고·새 문의·점검 숫자 카드
// 메뉴 표(adminRoutes) '/dashboard'가 붙임, 30초마다 백그라운드로 다시 읽음 (게임 서버 숫자 못 받으면 그 칸만 "지금 숫자 못 받음")
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchDashboard } from '@/admin/domains/dashboard/api/dashboard.api'
import StatCard, { UNAVAILABLE_TEXT } from '@/admin/domains/dashboard/components/StatCard'

export const REFRESH_MS = 30_000

// 점검 칸 글귀: 진행 중 → 예약됨(시작 시각) → 꺼짐
const maintenanceText = (maintenance) => {
  if (maintenance?.active) return '점검 중'
  if (maintenance?.enabled) return '예약됨'
  return '꺼짐'
}

// 못 받은 Node 이름 (예: [{node:'n1',ok:true},{node:'n2',ok:false}] → ['n2'])
const missingNodes = (live) => (live?.nodes ?? []).filter((line) => !line.ok).map((line) => line.node)

// 오늘 총 판 아래 줄 (예: '끝난 판 7 · 진행 중 3')
const todayNote = ({ finished, inProgress }) => `끝난 판 ${finished} · 진행 중 ${inProgress ?? UNAVAILABLE_TEXT}`

function DashboardCards({ summary }) {
  const { todayGames, maintenance } = summary
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="새 신고" value={summary.openReports} unit="건" note="처리 안 된 신고" to="/reports" highlight={summary.openReports > 0} />
      <StatCard title="새 문의" value={summary.openInquiries} unit="건" note="답 기다리는 문의" to="/inquiries" highlight={summary.openInquiries > 0} />
      <StatCard title="전체 가입자" value={summary.totalMembers} unit="명" note="탈퇴한 사람 뺌" />
      <StatCard title="오늘 총 판 수" value={todayGames.total} unit="판" note={todayNote(todayGames)} />
      <StatCard title="지금 진행 중 판" value={summary.inProgressGames} unit="판" to="/live" />
      <StatCard title="지금 접속" value={summary.onlineCount} unit="명" />
      <StatCard
        title="점검"
        text={maintenanceText(maintenance)}
        note={maintenance?.enabled ? `시작 ${formatKst(maintenance.startsAt)}` : undefined}
        to="/maintenance"
      />
    </ul>
  )
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [readAt, setReadAt] = useState(null)
  const alive = useRef(true)

  // 받은 숫자·오류 적기 (화면이 사라진 뒤 온 답은 버림)
  const show = useCallback((next) => {
    if (!alive.current) return
    setSummary(next)
    setError(null)
    setReadAt(new Date().toISOString())
  }, [])
  const fail = useCallback((caught) => {
    if (alive.current) setError(caught)
  }, [])

  // background면 활동으로 안 셈 (가만히 있으면 자동 로그아웃 그대로)
  const load = useCallback((background = false) => fetchDashboard({ background }).then(show, fail), [show, fail])

  useEffect(() => {
    alive.current = true
    fetchDashboard().then(show, fail)
    const timer = setInterval(() => load(true), REFRESH_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [load, show, fail])

  const missing = missingNodes(summary?.live)
  return (
    <section>
      <PageHeader title="운영 현황" description={readAt ? `30초마다 새로 읽어요 · 마지막 ${formatKst(readAt)}` : '30초마다 새로 읽어요'} />
      {!summary && !error ? <StatusNote state="loading" /> : null}
      {!summary && error ? <StatusNote state="error" error={error} onRetry={() => load()} /> : null}
      {summary && error ? <p role="alert" className="mb-3 text-sm text-danger">새로 읽지 못했어요: {adminErrorText(error)} (아래는 마지막 숫자)</p> : null}
      {summary && missing.length > 0 && !summary.liveError ? (
        <p className="mb-3 text-sm text-muted">{missing.join(', ')} 서버 숫자를 못 받아 나머지 서버 숫자만 합쳤어요.</p>
      ) : null}
      {summary ? <DashboardCards summary={summary} /> : null}
    </section>
  )
}
