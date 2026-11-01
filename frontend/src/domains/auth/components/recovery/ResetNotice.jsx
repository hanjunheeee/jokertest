// 재설정 화면 상태 안내 한 덩어리 (문구 + 버튼 하나)
// pages/passwordReset/ResetPage.jsx가 확인 중·확인 실패·잘못된 링크·소셜 계정·완료 화면에 씀

// actionLabel이 없으면 버튼 없이 문구만 (확인 중 화면)
export default function ResetNotice({ role, className, text, actionLabel, onAction }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p role={role} className={className}>
        {text}
      </p>
      {actionLabel && (
        <button type="button" onClick={onAction} className="auth-text-link">{actionLabel}</button>
      )}
    </div>
  )
}
