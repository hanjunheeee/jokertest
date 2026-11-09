// 정지·기간 바꾸기 확인 창 파일, 종류(기간·영구)·일수·사유를 받고 대상·기간·사유를 한 번 더 보여 줌 (사유 비면 버튼 꺼짐)
// SanctionPanel이 "기간 정지"·"영구 정지"·"기간 바꾸기" 누를 때 엶
import { useState } from 'react'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import Field from '@/admin/shared/ui/Field'
import { formatKst } from '@/admin/shared/utils/time'
import { banMember, changeBan } from '@/admin/domains/sanctions/api/sanctions.api'

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_MAX = 3650
const REASON_MAX = 200

// 일수 글자 → 1~3650 정수만 (예: '7' → 7, '0'·'1.5'·'' → null)
const daysOf = (text) => {
  const days = Number(text)
  return Number.isInteger(days) && days >= 1 && days <= DAYS_MAX ? days : null
}

// 기간 줄 (예: 7일 → '기간: 7일 (2026-11-17 12:00까지)', 영구 → '기간: 영구')
const periodLine = (kind, days) => {
  if (kind === 'PERMANENT') return '기간: 영구 (해제하기 전까지 계속)'
  if (!days) return '기간: 1~3650일 사이로 넣어 주세요'
  return `기간: ${days}일 (${formatKst(new Date(Date.now() + days * DAY_MS).toISOString())}까지)`
}

// mode 'ban' = 새로 정지(사유가 플레이어에게 보임) / 'update' = 기간 바꾸기(사유는 관리자 기록에만)
// initialKind: 처음 고른 종류, ban: 바꿀 정지(update만), onDone(서버 응답): 끝나면 부름
export default function BanDialog({ mode = 'ban', member, initialKind = 'PERIOD', ban, onDone, onCancel }) {
  const [kind, setKind] = useState(initialKind)
  const [daysText, setDaysText] = useState('7')
  const [reason, setReason] = useState('')
  const days = kind === 'PERIOD' ? daysOf(daysText) : null
  const trimmed = reason.trim()
  const updating = mode === 'update'

  const submit = async () => {
    const period = kind === 'PERMANENT' ? { kind } : { kind, days }
    const answer = updating ? await changeBan(member.uuid, ban.id, period, trimmed) : await banMember(member.uuid, period, trimmed)
    onDone?.(answer)
  }

  const title = updating ? '정지 기간 바꾸기' : kind === 'PERMANENT' ? '영구 정지' : '기간 정지'
  const reasonLabel = updating ? '바꾸는 사유 (관리자 기록에만 남아요)' : '정지 사유 (플레이어에게 보이는 사유)'
  const lines = [
    `대상: ${member.nickname}`,
    periodLine(kind, days),
    `사유: ${trimmed || '아직 비어 있어요'}`,
  ]
  if (updating) lines.push('기간은 지금부터 다시 셉니다.')

  return (
    <ConfirmDialog
      title={title}
      lines={lines}
      danger
      confirmLabel={updating ? '기간 바꾸기' : '정지하기'}
      confirmDisabled={!trimmed || (kind === 'PERIOD' && !days)}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3">
        {updating ? (
          <Field label="종류" as="select" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="PERIOD">기간 정지</option>
            <option value="PERMANENT">영구 정지</option>
          </Field>
        ) : null}
        {kind === 'PERIOD' ? (
          <Field
            label="정지 일수"
            type="number"
            inputMode="numeric"
            min={1}
            max={DAYS_MAX}
            value={daysText}
            onChange={(event) => setDaysText(event.target.value)}
            error={days ? null : '1~3650일 사이로 넣어 주세요.'}
          />
        ) : null}
        <Field
          label={reasonLabel}
          as="textarea"
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint={updating ? '플레이어에게 보이는 정지 사유는 그대로예요.' : '정지된 플레이어가 로그인할 때 이 사유를 봐요.'}
        />
      </div>
    </ConfirmDialog>
  )
}
