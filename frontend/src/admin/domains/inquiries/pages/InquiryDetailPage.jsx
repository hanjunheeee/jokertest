// 문의 하나 화면 파일, 쓴 사람·본문·지난 답 + 답 달기(빈 칸이면 못 보냄, 두 번 눌러도 하나)
// InquiriesPage가 /inquiries/:id에 붙임, 답을 달면 플레이어에게 알림(종)이 감
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { newRequestId } from '@/admin/shared/utils/requestId'
import { CATEGORY_TEXT, STATUS_TEXT, fetchInquiry, sendInquiryReply } from '@/admin/domains/inquiries/api/inquiries.api'

const BODY_MAX = 2000

function ReplyList({ replies }) {
  if (replies.length === 0) return <StatusNote state="empty">아직 단 답이 없어요. 아래에 답을 적어 주세요.</StatusNote>
  return (
    <ol className="flex flex-col gap-2" aria-label="단 답">
      {replies.map((reply) => (
        <li key={reply.id} className="rounded border border-line bg-panel p-3">
          <p className="text-sm text-muted">{reply.admin.loginId ?? '(지운 관리자)'} · {formatKst(reply.createdAt)}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{reply.body}</p>
        </li>
      ))}
    </ol>
  )
}

// 답 칸: 요청 번호는 적는 답 하나에 하나 (실패 뒤 다시 눌러도 같은 번호 → 답 줄 하나)
function ReplyForm({ inquiryId, onSent }) {
  const [text, setText] = useState('')
  const [requestId, setRequestId] = useState(newRequestId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // 화면 다시 그리기 전 두 번째 누름 막기
  const sendingRef = useRef(false)
  const body = text.trim()
  const ready = body.length > 0 && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready || sendingRef.current) return
    sendingRef.current = true
    setBusy(true)
    setError(null)
    try {
      const answer = await sendInquiryReply(inquiryId, { requestId, body })
      setText('')
      setRequestId(newRequestId())
      onSent(answer)
    } catch (caught) {
      setError(caught)
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded border border-line bg-panel p-3">
      <Field as="textarea" label="답" name="reply" rows={5} maxLength={BODY_MAX} value={text}
        onChange={(event) => setText(event.target.value)}
        hint={`플레이어에겐 "운영팀"으로 보여요. ${text.length}/${BODY_MAX}자`}
        error={error ? adminErrorText(error) : undefined} />
      <div>
        <button type="submit" disabled={!ready}
          className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? '보내는 중…' : '답 보내기'}
        </button>
      </div>
    </form>
  )
}

export default function InquiryDetailPage() {
  const { id } = useParams()
  const [view, setView] = useState({ state: 'loading', data: null, error: null })
  const [sentNote, setSentNote] = useState(null)
  // 올리면 다시 읽음 (답 단 뒤·다시 불러오기)
  const [version, setVersion] = useState(0)
  const load = () => setVersion((old) => old + 1)

  // 화면이 바뀐 뒤 늦게 온 응답은 버림
  useEffect(() => {
    let alive = true
    fetchInquiry(id).then(
      (data) => { if (alive) setView({ state: 'ready', data, error: null }) },
      (error) => { if (alive) setView({ state: 'error', data: null, error }) },
    )
    return () => { alive = false }
  }, [id, version])

  const afterSent = (answer) => {
    setSentNote(answer.notified
      ? '답을 달았어요. 플레이어에게 알림을 보냈어요.'
      : '답을 달았어요. 알림은 못 보냈지만 플레이어가 문의 창을 열면 답이 보여요.')
    load()
  }

  const back = <Link to="/inquiries" className="inline-flex min-h-11 items-center rounded border border-line px-3">목록으로</Link>
  if (view.state === 'loading') return <StatusNote state="loading" />
  if (view.state === 'error') {
    return (
      <section className="flex flex-col gap-3">
        <StatusNote state="error" error={view.error} onRetry={view.error?.code === 'INQUIRY_NOT_FOUND' ? undefined : load} />
        <div>{back}</div>
      </section>
    )
  }

  const { inquiry, user, replies } = view.data
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={inquiry.title} actions={back}
        description={`${CATEGORY_TEXT[inquiry.category] ?? inquiry.category} · ${STATUS_TEXT[inquiry.status] ?? inquiry.status} · 받은 시각 ${formatKst(inquiry.createdAt)}`} />
      <p className="text-sm">
        쓴 사람 <Link to={`/members/${user.uuid}`} className="font-semibold underline">{user.nickname ?? '(탈퇴)'}</Link>
      </p>
      <p className="whitespace-pre-wrap break-words rounded border border-line bg-panel p-3">{inquiry.body}</p>
      <h2 className="text-lg font-bold">답</h2>
      <ReplyList replies={replies} />
      {sentNote ? <p role="status" className="rounded border border-line bg-panel px-3 py-2 text-sm">{sentNote}</p> : null}
      <ReplyForm inquiryId={inquiry.id} onSent={afterSent} />
    </section>
  )
}
