// 입력 칸 부품 파일, 이름표 + 칸 + 도움말 + 칸 옆 오류를 한 묶음으로 (화면 읽기 연결까지)
// 로그인·사유 입력·검색 같은 관리자 폼이 씀
import { useId } from 'react'

const INPUT_CLASS = 'min-h-11 w-full rounded border border-line bg-panel px-3 py-2 text-base text-ink aria-[invalid=true]:border-danger'

// as: 'input'(기본) | 'textarea' | 'select', 나머지는 칸에 그대로 넘김 (value·onChange·type·autoComplete 등)
// select면 children이 option들
export default function Field({ label, hint, error, as: Tag = 'input', id, children, className = '', ...inputProps }) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={fieldId} className="text-sm font-semibold">{label}</label>
      <Tag id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={INPUT_CLASS} {...inputProps}>
        {Tag === 'select' ? children : undefined}
      </Tag>
      {hint ? <p id={hintId} className="text-sm text-muted">{hint}</p> : null}
      {error ? <p id={errorId} className="text-sm text-danger">{error}</p> : null}
    </div>
  )
}
