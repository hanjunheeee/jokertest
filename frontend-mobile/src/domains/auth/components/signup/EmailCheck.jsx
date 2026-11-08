// 이메일 중복확인 버튼 + 결과 문구 한 줄
// signup/SignupFields.jsx가 이메일 칸 아래에 씀, 상태는 SignupFields가 데스크톱 useEmailCheck로 들고 있음
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import EmailCheckMessage from "@m/domains/auth/components/signup/EmailCheckMessage.jsx"
import {
  EMAIL_CHECK_BUTTON_CLASS,
  SIGNUP_AUX_BUTTON_LABEL_CLASS,
  SIGNUP_AUX_BUTTON_LOOK,
} from "@m/domains/auth/components/signup/signupAuxButtonLook.js"

// 문구는 왼쪽, 중복확인 버튼은 오른쪽 고정 폭
export default function EmailCheck({ status, onCheck }) {
  return (
    <div className="mx-auto flex w-[88%] items-center justify-between gap-1.5">
      <EmailCheckMessage status={status} />
      <ImageButton
        look={SIGNUP_AUX_BUTTON_LOOK}
        onClick={onCheck}
        src={LOGIN_ASSETS.emailCheckButton}
        ariaLabel="이메일 중복확인"
        label="이메일 중복확인"
        labelClassName={SIGNUP_AUX_BUTTON_LABEL_CLASS}
        className={`${EMAIL_CHECK_BUTTON_CLASS} ml-auto`}
      />
    </div>
  )
}
