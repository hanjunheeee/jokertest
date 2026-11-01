// 재설정 화면 상태 안내 한 덩어리 (문구 + 글자 링크 하나)
// pages/PasswordResetPage.jsx가 확인 중·확인 실패·잘못된 링크·소셜 계정·완료 화면에 씀
import TextLink from "./TextLink.jsx"

// actionLabel이 없으면 링크 없이 문구만 (확인 중 화면), className은 데스크톱 noticeFor가 고른 모양
export default function ResetNotice({ role, className, text, actionLabel, onAction }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <p role={role} className={`break-keep ${className}`}>
        {text}
      </p>
      {actionLabel && <TextLink onClick={onAction}>{actionLabel}</TextLink>}
    </div>
  )
}
