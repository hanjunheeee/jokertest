// 이메일 인증 안내 줄 자리 (완료·에러·남은 시간)
// components/SignupEmailVerification.jsx가 ref로 이 자리를 받아 스크롤 칸 안에 보이게 굴림
import {
  EMAIL_VERIFICATION_NOTICE_SLOT_CLASS,
  EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"

// 번호 입력 중엔 문구가 없어도 높이를 잡아 둬서 문구가 생길 때 칸이 안 밀림
export default function NoticeSlot({ ref, notice, reserveSpace }) {
  return (
    <div
      ref={ref}
      className={`${EMAIL_VERIFICATION_NOTICE_SLOT_CLASS} ${reserveSpace ? EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS : ""}`}
      aria-live="polite"
    >
      {notice ? (
        <p data-testid="signup-email-verification-notice" className={notice.className}>
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
