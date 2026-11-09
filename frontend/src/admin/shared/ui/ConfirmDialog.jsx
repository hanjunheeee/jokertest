// 큰일 확인 창 부품 파일, 대상·기간·금액·사유를 한 번 더 보여 주고 누르면 처리 (처리 중·실패 문구까지)
// 정지·강제 종료·환불·뺏기·점검 켜기처럼 되돌리기 어려운 버튼 뒤에 씀
import { useEffect, useId, useRef, useState } from 'react'
import { adminErrorText } from '@/admin/shared/api/errorText'

const BUTTON = 'min-h-11 rounded px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50'

// title: 창 제목, lines: 다시 보여 줄 줄들(예: ['대상: 가면1', '기간: 7일']), danger: 빨간 버튼
// onConfirm: 누르면 부름(약속 돌려주면 끝날 때까지 처리 중), onCancel: 닫기
// children: 사유 칸 같은 입력 자리, confirmDisabled: 사유 비었을 때 등 버튼 끄기
export default function ConfirmDialog({ title, lines = [], danger = false, confirmLabel = '확인', onConfirm, onCancel, confirmDisabled = false, children }) {
  const titleId = useId()
  const cancelRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // 열리면 취소 버튼에 초점 (실수로 Enter 눌러도 처리 안 되게), Esc는 닫기
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm?.()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  const confirmColor = danger ? 'bg-danger text-danger-ink' : 'bg-accent text-accent-ink'
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded border border-line bg-panel p-4 text-ink">
        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        {lines.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        {children ? <div className="mt-3">{children}</div> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{adminErrorText(error)}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={`${BUTTON} border border-line`}>
            취소
          </button>
          <button type="button" onClick={confirm} disabled={busy || confirmDisabled} className={`${BUTTON} ${confirmColor}`}>
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
