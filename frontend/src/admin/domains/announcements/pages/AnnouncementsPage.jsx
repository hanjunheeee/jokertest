// 공지 화면 파일, 제목·본문 → 대상(접속 중 전체 / 고른 사람) → 확인 → 보내기 → 발송 결과
// 메뉴 "공지"(/announcements), 보낸 이력은 처리 이력 화면 "공지 발송 이력" 칸
import { useRef, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import Field from '@/admin/shared/ui/Field'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import { newRequestId } from '@/admin/shared/utils/requestId'
import { sendAnnouncement } from '@/admin/domains/announcements/api/announcements.api'
import RecipientPicker from '@/admin/domains/announcements/components/RecipientPicker'
import SendResult from '@/admin/domains/announcements/components/SendResult'

const TITLE_MAX = 120
const BODY_MAX = 500
const TARGETS = Object.freeze([
  { value: 'online', label: '접속 중 전체' },
  { value: 'users', label: '고른 사람' },
])

const EMPTY_FORM = Object.freeze({ title: '', body: '', target: 'online', picked: [] })

// 공지 폼 상태·보내기 (확인 창 열림·보낸 결과 포함)
function useAnnouncementForm() {
  const [form, setForm] = useState(EMPTY_FORM)
  // 요청 번호는 폼 하나에 하나 (실패 뒤 다시 눌러도 같은 번호 → 서버가 두 번 안 보냄)
  const [requestId, setRequestId] = useState(newRequestId)
  const [confirming, setConfirming] = useState(false)
  const [sent, setSent] = useState(null)
  // 확인을 아주 빨리 두 번 눌러도 요청은 하나 (화면 다시 그리기 전 두 번째 누름 막기)
  const sendingRef = useRef(false)

  const title = form.title.trim()
  const body = form.body.trim()
  const ready = title.length > 0 && body.length > 0 && (form.target === 'online' || form.picked.length > 0)

  const send = async () => {
    if (sendingRef.current) return
    sendingRef.current = true
    try {
      const payload = { requestId, title, body, target: form.target }
      if (form.target === 'users') payload.userUuids = form.picked.map((member) => member.uuid)
      const answer = await sendAnnouncement(payload)
      setSent({ title, result: answer.result })
      setForm(EMPTY_FORM)
      setRequestId(newRequestId())
      setConfirming(false)
    } finally {
      sendingRef.current = false
    }
  }
  return { form, setForm, confirming, setConfirming, sent, title, body, ready, send }
}

// 받는 사람 고르기 칸 (접속 중 전체 / 고른 사람)
function TargetFieldset({ form, change, setForm }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">받는 사람</legend>
      <div className="flex flex-wrap gap-4">
        {TARGETS.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="target" value={option.value} checked={form.target === option.value} onChange={change('target')} />
            {option.label}
          </label>
        ))}
      </div>
      {form.target === 'online'
        ? <p className="text-sm text-muted">지금 접속한 사람에게 바로 보이고, 알림 목록에도 남아요.</p>
        : <RecipientPicker picked={form.picked} onChange={(picked) => setForm((prev) => ({ ...prev, picked }))} />}
    </fieldset>
  )
}

export default function AnnouncementsPage() {
  const { form, setForm, confirming, setConfirming, sent, title, body, ready, send } = useAnnouncementForm()
  const change = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const targetLine = form.target === 'online' ? '대상: 접속 중 전체' : `대상: 고른 사람 ${form.picked.length}명`

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="공지" description="플레이어 알림(종)으로 공지를 보내요. 보낸 기록은 처리 이력에 남아요." />
      {sent ? <SendResult result={sent.result} title={sent.title} /> : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) setConfirming(true)
        }}
      >
        <Field label="제목" value={form.title} onChange={change('title')} maxLength={TITLE_MAX} hint={`${form.title.length}/${TITLE_MAX}자`} />
        <Field as="textarea" label="본문" rows={5} value={form.body} onChange={change('body')} maxLength={BODY_MAX} hint={`${form.body.length}/${BODY_MAX}자`} />

        <TargetFieldset form={form} change={change} setForm={setForm} />

        <div>
          <button type="submit" disabled={!ready} className="min-h-11 rounded bg-accent px-5 font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50">
            보내기
          </button>
        </div>
      </form>

      {confirming ? (
        <ConfirmDialog
          title="이 공지를 보낼까요?"
          lines={[targetLine, `제목: ${title}`]}
          confirmLabel="보내기"
          onConfirm={send}
          onCancel={() => setConfirming(false)}
        >
          <p className="whitespace-pre-wrap rounded border border-line p-2 text-sm">{body}</p>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
