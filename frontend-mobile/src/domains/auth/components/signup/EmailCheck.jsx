// 이메일 중복확인 버튼 + 결과 문구 한 줄
// signup/SignupFields.jsx가 이메일 칸 아래에 씀, 상태는 SignupFields가 데스크톱 useEmailCheck로 들고 있음
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import EmailCheckMessage from "@m/domains/auth/components/signup/EmailCheckMessage.jsx"

// 버튼은 왼쪽 고정 폭, 문구는 남은 폭
export default function EmailCheck({ status, onCheck }) {
  return (
    <div className="flex items-center gap-2">
      <ImageButton
        onClick={onCheck}
        src={LOGIN_ASSETS.emailCheckButton}
        ariaLabel="이메일 중복확인"
        label="이메일 중복확인"
        labelClassName="whitespace-nowrap app-text-scaled [--app-text-size:13px]"
        className="w-[8.5rem] shrink-0"
      />
      <EmailCheckMessage status={status} />
    </div>
  )
}
