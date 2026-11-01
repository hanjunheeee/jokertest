// 재설정 화면 상태 안내 문구 한 덩어리 (버튼은 페이지가 바닥 줄에 둠)
// pages/PasswordResetPage.jsx가 확인 중·확인 실패·잘못된 링크·소셜 계정·완료 화면에 씀

// className은 데스크톱 noticeFor가 고른 모양(알림 상자 또는 글자만) 그대로
export default function ResetNotice({ role, className, text }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <p role={role} className={`break-keep ${className}`}>
        {text}
      </p>
    </div>
  )
}
