// 이메일 인증 안내 줄 자리 (완료·에러·남은 시간)
// signup/verification/EmailVerification.jsx가 ref로 받아 화면 안에 보이게 굴림

// 번호 입력 중엔 문구가 없어도 높이를 잡아 둬서 문구가 생길 때 칸이 안 밀림
export default function Notice({ ref, notice, reserveSpace }) {
  return (
    <div ref={ref} className={`shrink-0 px-1 ${reserveSpace ? "min-h-[1.4rem]" : ""}`} aria-live="polite">
      {notice ? (
        <p data-testid="signup-email-verification-notice" className={notice.className}>
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
