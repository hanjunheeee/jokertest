// 소셜 로그인 실패로 돌아왔을 때 액자 위쪽 실패 문구
// pages/LoginPage.jsx가 주소에 socialError만 있을 때 씀

// 양피지 액자 위에서 대비 4.5 이상이 되도록 불투명도 높은 밝은 받침과 짙은 적갈색 글자 사용
export default function SocialErrorBanner({ message }) {
  return (
    <p
      role="alert"
      className="mx-auto w-[88%] shrink-0 rounded border border-[#7a1c14]/45 bg-[#fce8e6]/95 px-3 py-2 text-center font-subheading text-xs font-bold leading-snug text-[#3b0808]"
    >
      {message}
    </p>
  )
}
