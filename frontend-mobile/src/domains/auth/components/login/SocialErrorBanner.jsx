// 소셜 로그인 실패로 돌아왔을 때 액자 위쪽 실패 문구
// pages/LoginPage.jsx가 주소에 socialError만 있을 때 씀

// 문구는 데스크톱 resolveSocialLoginView가 고른 것 그대로, 색·크기도 데스크톱 LoginPage 실패 줄과 같음
export default function SocialErrorBanner({ message }) {
  return (
    <p role="alert" className="shrink-0 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
      {message}
    </p>
  )
}
