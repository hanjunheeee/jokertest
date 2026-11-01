// 아이디 찾기 화면: 닉네임·생년월일로 가입 이메일을 가려서 보여 줌
// app/routes/index.jsx가 /find-id에 붙임, 상태는 hooks/recovery/useFindId.js, 입력 칸은 components/recovery/FindIdForm.jsx
import { useNavigate } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthFrameBackButton from "@/domains/auth/components/AuthFrameBackButton.jsx"
import FindIdForm from "@/domains/auth/components/recovery/FindIdForm.jsx"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import { useFindId } from "@/domains/auth/hooks/recovery/useFindId.js"

// 찾았으면 가린 이메일, 아니면 입력 칸
export default function FindIdPage() {
  const navigate = useNavigate()
  const find = useFindId()

  const handleBack = () => navigate("/login")

  return (
    <AuthScene onSubmit={find.handleSubmit}>
      <header className="text-center">
        <p className="mt-[64px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          가입할 때 입력한 닉네임과 생년월일로 계정을 찾아드려요
        </p>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-2">
        {find.status === "found" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">
              가입하신 이메일은 아래와 같아요
            </p>
            <p role="status" className={`${AUTH_RECOVERY_ALERT_CLASS} text-center`}>
              {find.maskedEmail}
            </p>
            <button type="button" onClick={find.backToIdle} className="auth-text-link">다시 찾기</button>
          </div>
        ) : (
          <FindIdForm
            status={find.status}
            nickname={find.nickname}
            setNickname={find.setNickname}
            birthDate={find.birthDate}
            setBirthDate={find.setBirthDate}
            formError={find.formError}
            onRetry={find.backToIdle}
          />
        )}
      </div>

      <AuthFrameBackButton onClick={handleBack} />
    </AuthScene>
  )
}
