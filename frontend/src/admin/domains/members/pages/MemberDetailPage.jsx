// 회원 상세 화면(/members/:uuid) 파일, 가입일·상태·접속 중 + 정지 기록(해제 사유)·받은 신고·최근 로그인 + 제재·지갑 칸
// 경로 표(adminDetailRoutes)가 붙임, 제재 칸은 SanctionPanel(1-2), 골드·다이아 칸은 WalletPanel(2-8)이 채움
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import DataList from '@/admin/shared/ui/DataList'
import { formatKst } from '@/admin/shared/utils/time'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { fetchMember, revealMemberEmail } from '@/admin/domains/members/api/members.api'
import MemberStatus from '@/admin/domains/members/components/MemberStatus'
import SanctionPanel from '@/admin/domains/sanctions/components/SanctionPanel'
import WalletPanel from '@/admin/domains/wallet/components/WalletPanel'

const banPeriodText = (ban) => (ban.isPermanent ? '영구' : `${formatKst(ban.startAt)} ~ ${formatKst(ban.endAt)}`)
const banStateText = (ban) => {
  if (ban.active) return '정지 중'
  return ban.liftedAt ? `해제 (${formatKst(ban.liftedAt)})` : '기간 끝남'
}

const BAN_COLUMNS = [
  { key: 'state', label: '상태', render: banStateText },
  { key: 'period', label: '기간', render: banPeriodText },
  { key: 'reason', label: '정지 사유' },
  { key: 'bannedByLoginId', label: '정지한 관리자' },
  { key: 'liftReason', label: '해제 사유' },
  { key: 'liftedByLoginId', label: '해제한 관리자' },
]
const REPORT_COLUMNS = [
  { key: 'createdAt', label: '신고 시각', render: (row) => formatKst(row.createdAt) },
  { key: 'reasonCode', label: '사유' },
  { key: 'status', label: '처리 상태' },
]
const LOGIN_COLUMNS = [
  { key: 'at', label: '시각', render: (row) => formatKst(row.at) },
  { key: 'ipMasked', label: 'IP(가림)' },
  { key: 'success', label: '결과', render: (row) => (row.success ? '성공' : '실패') },
]

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

// 이메일: 처음엔 가린 것, "이메일 보기" 누르면 전체 (서버가 본 기록을 남김)
function EmailRow({ uuid, masked }) {
  const [email, setEmail] = useState(null)
  const [error, setError] = useState(null)
  const reveal = async () => {
    setError(null)
    try {
      setEmail((await revealMemberEmail(uuid)).email)
    } catch (caught) {
      setError(caught)
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="break-all">{email ?? masked}</span>
      {email ? null : (
        <button type="button" onClick={reveal} className="min-h-11 rounded border border-line px-3 text-sm">이메일 보기</button>
      )}
      {error ? <span role="alert" className="text-sm text-danger">{adminErrorText(error)}</span> : null}
    </span>
  )
}

function Summary({ member }) {
  const rows = [
    ['상태', <MemberStatus key="s" member={member} />],
    ['접속한 서버', member.online ? member.onlineNode ?? '—' : '—'],
    ['가입일', formatKst(member.createdAt)],
    ['마지막 로그인', formatKst(member.lastLoginAt)],
    ['이메일', <EmailRow key="e" uuid={member.uuid} masked={member.emailMasked} />],
    ['UUID', <code key="u" className="text-xs break-all">{member.uuid}</code>],
  ]
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 rounded border border-line bg-panel p-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// 회원 상세 불러오기, reload()로 다시 읽음
function useMemberDetail(uuid) {
  // 받은 상세는 어느 회원 것인지와 같이 둠 (다른 회원으로 옮기면 옛 것은 안 그림)
  const [loaded, setLoaded] = useState(null)
  const [version, setVersion] = useState(0)
  const key = uuid.toLowerCase()

  // 회원이 바뀌거나 처리 뒤(version) 다시 읽음, 늦게 온 옛 답은 버림
  useEffect(() => {
    let live = true
    fetchMember(key).then(
      (detail) => { if (live) setLoaded({ key, detail, error: null }) },
      (caught) => { if (live) setLoaded({ key, detail: null, error: caught }) },
    )
    return () => { live = false }
  }, [key, version])

  const reload = () => setVersion((count) => count + 1)
  const current = loaded?.key === key ? loaded : null
  const detail = current?.detail ?? null
  const error = current?.error ?? null
  return { detail, error, reload }
}

export default function MemberDetailPage() {
  const { uuid } = useParams()
  const { detail, error, reload } = useMemberDetail(uuid)

  const back = <Link to="/members" className="inline-flex min-h-11 items-center rounded border border-line px-3">회원 찾기로</Link>
  if (error?.code === 'MEMBER_NOT_FOUND') {
    return (
      <section className="min-w-0">
        <PageHeader title="회원 상세" actions={back} />
        <StatusNote state="empty">없음 — 그런 회원이 없어요. UUID를 다시 확인해 주세요.</StatusNote>
      </section>
    )
  }
  if (error) return <section className="min-w-0"><PageHeader title="회원 상세" actions={back} /><StatusNote state="error" error={error} onRetry={reload} /></section>
  if (!detail) return <section className="min-w-0"><PageHeader title="회원 상세" actions={back} /><StatusNote state="loading" /></section>

  const { member, bans, reportsReceived, logins } = detail
  const banned = bans.some((ban) => ban.active)
  return (
    <section className="min-w-0">
      <PageHeader title={member.nickname} description={member.withdrawn ? '탈퇴한 회원이에요.' : '회원 상세'} actions={back} />
      <Summary member={{ ...member, banned }} />
      <SanctionPanel member={member} bans={bans} onChanged={reload} />
      <WalletPanel uuid={member.uuid} />
      <Section title="정지 기록">
        <DataList columns={BAN_COLUMNS} rows={bans} caption="정지 기록" empty="정지 기록이 없어요." />
      </Section>
      <Section title="받은 신고">
        <DataList columns={REPORT_COLUMNS} rows={reportsReceived} caption="받은 신고" empty="받은 신고가 없어요." />
      </Section>
      <Section title="최근 로그인">
        {/* 같은 시각 줄이 있을 수 있어 순번을 줄 구별 값으로 */}
        <DataList columns={LOGIN_COLUMNS} rows={logins.map((row, index) => ({ ...row, id: index }))} caption="최근 로그인" empty="로그인 기록이 없어요." />
      </Section>
    </section>
  )
}
