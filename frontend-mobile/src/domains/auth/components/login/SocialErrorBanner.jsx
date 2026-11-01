// 소셜 로그인 실패로 돌아왔을 때 액자 위쪽 실패 문구
// pages/LoginPage.jsx가 주소에 socialError만 있을 때 씀

// 문구는 데스크톱 resolveSocialLoginView가 고른 것 그대로
export default function SocialErrorBanner({ message }) {
  return (
    <p role="alert" className="rounded bg-red-900/15 px-3 py-2 text-center font-subheading font-bold text-red-800 app-text-scaled [--app-text-size:13px]">
      {message}
    </p>
  )
}
