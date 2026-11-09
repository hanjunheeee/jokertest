// 회원 상세 안 제재 칸 파일, 강제 접속 종료 · 기간 정지 · 영구 정지 · 기간 바꾸기 · 제재 해제 버튼과 확인 창
// 1-1 회원 상세 화면이 <SanctionPanel member bans onChanged /> 로 붙임 (처리 끝나면 onChanged로 상세 다시 읽음)
import { useState } from 'react'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import Field from '@/admin/shared/ui/Field'
import { formatKst } from '@/admin/shared/utils/time'
import { forceDisconnect, unbanMember } from '@/admin/domains/sanctions/api/sanctions.api'
import BanDialog from '@/admin/domains/sanctions/components/BanDialog'

const BUTTON = 'min-h-11 rounded px-4 font-semibold'
const DANGER = `${BUTTON} bg-danger text-danger-ink`
const PLAIN = `${BUTTON} border border-line`
const REASON_MAX = 200

// 끊은 결과 문구 (예: { disconnected:2, partial:false } → '접속 2곳을 바로 끊었어요.')
const disconnectText = ({ disconnected, partial }) => {
  const head = disconnected > 0 ? `접속 ${disconnected}곳을 바로 끊었어요.` : '지금 접속 중이 아니라 끊을 접속이 없었어요.'
  return partial ? `${head} 닿지 않은 서버가 있어 몇 초 안에 마저 끊어요.` : head
}

// 사유만 받는 확인 창 (강제 접속 종료·제재 해제)
function ReasonDialog({ title, lines, danger, confirmLabel, reasonLabel, onSubmit, onCancel }) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <ConfirmDialog
      title={title}
      lines={[...lines, `사유: ${trimmed || '아직 비어 있어요'}`]}
      danger={danger}
      confirmLabel={confirmLabel}
      confirmDisabled={!trimmed}
      onConfirm={() => onSubmit(trimmed)}
      onCancel={onCancel}
    >
      <Field label={reasonLabel} as="textarea" rows={3} maxLength={REASON_MAX} value={reason} onChange={(event) => setReason(event.target.value)} />
    </ConfirmDialog>
  )
}

// 지금 걸린 정지 한 줄 안내 (예: '정지 중 — 2026-11-17 12:00까지 · 사유: 욕설')
function ActiveBanNote({ ban }) {
  const until = ban.isPermanent ? '영구' : `${formatKst(ban.endAt)}까지`
  return (
    <p className="rounded border border-danger/40 px-3 py-2 text-sm">
      <strong className="text-danger">정지 중</strong> — {until} · 사유: {ban.reason ?? '—'}
    </p>
  )
}

// 강제 접속 종료 확인 창 (정지 아님)
function KickDialog({ member, finish, close }) {
  const target = `대상: ${member.nickname}`
  return (
    <ReasonDialog
      title="강제 접속 종료"
      lines={[target, '정지는 아니라서 바로 다시 들어올 수 있어요.']}
      danger
      confirmLabel="접속 끊기"
      reasonLabel="끊는 사유 (관리자 기록에만 남아요)"
      onSubmit={async (reason) => finish(disconnectText(await forceDisconnect(member.uuid, reason)))}
      onCancel={close}
    />
  )
}

// 제재 해제 확인 창
function UnbanDialog({ member, finish, close }) {
  const target = `대상: ${member.nickname}`
  return (
    <ReasonDialog
      title="제재 해제"
      lines={[target, '해제하면 바로 다시 로그인할 수 있어요.']}
      confirmLabel="해제하기"
      reasonLabel="해제 사유"
      onSubmit={async (reason) => {
        const { liftedCount } = await unbanMember(member.uuid, reason)
        finish(`정지 ${liftedCount}건을 풀었어요.`)
      }}
      onCancel={close}
    />
  )
}

// 지금 연 확인 창 하나 (open: 'kick' | 'unban' | 'PERIOD' | 'PERMANENT' | 'update' | null)
function OpenDialog({ open, member, activeBan, finish, close }) {
  if (open === 'kick') return <KickDialog member={member} finish={finish} close={close} />
  if (open === 'unban') return <UnbanDialog member={member} finish={finish} close={close} />
  if (open === 'PERIOD' || open === 'PERMANENT') {
    return (
      <BanDialog
        member={member}
        initialKind={open}
        onDone={(answer) => finish(`정지했어요. ${disconnectText(answer.disconnect)}`)}
        onCancel={close}
      />
    )
  }
  if (open === 'update' && activeBan) {
    return (
      <BanDialog
        mode="update"
        member={member}
        ban={activeBan}
        initialKind={activeBan.isPermanent ? 'PERMANENT' : 'PERIOD'}
        onDone={() => finish('정지 기간을 바꿨어요.')}
        onCancel={close}
      />
    )
  }
  return null
}

export default function SanctionPanel({ member, bans = [], onChanged }) {
  const [open, setOpen] = useState(null)
  const [notice, setNotice] = useState('')
  if (!member) return null
  const activeBan = bans.find((ban) => ban.active) ?? null
  const close = () => setOpen(null)
  const finish = (text) => {
    setOpen(null)
    setNotice(text)
    onChanged?.()
  }

  if (member.withdrawn) {
    return (
      <section className="mt-6" aria-label="제재">
        <h2 className="mb-2 text-lg font-bold">제재</h2>
        <p className="text-sm text-muted">탈퇴한 회원이라 제재할 수 없어요.</p>
      </section>
    )
  }

  return (
    <section className="mt-6" aria-label="제재">
      <h2 className="mb-2 text-lg font-bold">제재</h2>
      {activeBan ? <ActiveBanNote ban={activeBan} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={DANGER} onClick={() => setOpen('kick')}>강제 접속 종료</button>
        {activeBan ? (
          <>
            <button type="button" className={PLAIN} onClick={() => setOpen('update')}>기간 바꾸기</button>
            <button type="button" className={PLAIN} onClick={() => setOpen('unban')}>제재 해제</button>
          </>
        ) : (
          <>
            <button type="button" className={DANGER} onClick={() => setOpen('PERIOD')}>기간 정지</button>
            <button type="button" className={DANGER} onClick={() => setOpen('PERMANENT')}>영구 정지</button>
          </>
        )}
      </div>
      {notice ? <p role="status" className="mt-3 text-sm">{notice}</p> : null}
      <OpenDialog open={open} member={member} activeBan={activeBan} finish={finish} close={close} />
    </section>
  )
}
