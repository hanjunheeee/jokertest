// 상태 한 줄 부품 파일, 불러오는 중 · 빈 목록 · 오류(코드별 쉬운 문구 + 다시 불러오기)
// 관리자 화면 전부가 목록·상세를 그리기 전에 씀
import { adminErrorText } from '@/admin/shared/api/errorText'

// state: 'loading' | 'empty' | 'error'
// code: 오류 코드(또는 error 통째로 넘김), children: 빈 목록·오류에 덧붙일 문구, onRetry 있으면 다시 버튼
export default function StatusNote({ state, code, error, children, onRetry }) {
  if (state === 'loading') {
    return (
      <p role="status" className="py-6 text-sm text-muted">
        {children ?? '불러오는 중…'}
      </p>
    )
  }
  if (state === 'empty') {
    return <p className="rounded border border-dashed border-line px-4 py-6 text-sm text-muted">{children}</p>
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-danger/40 px-4 py-3 text-sm">
      <span className="text-danger">{children ?? adminErrorText(error ?? code)}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="min-h-11 rounded border border-line px-3 hover:bg-page">
          다시 불러오기
        </button>
      ) : null}
    </div>
  )
}
