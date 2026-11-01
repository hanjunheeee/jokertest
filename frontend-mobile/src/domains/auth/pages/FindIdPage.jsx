// 아이디 찾기 화면 (/find-id): 닉네임·생년월일로 가입 이메일을 가려서 보여 줌
// app/routes/index.jsx가 씀, 상태·검사·요청은 데스크톱 useFindId 그대로
import { useNavigate } from "react-router-dom"
import { useFindId } from "@/domains/auth/hooks/recovery/useFindId.js"
import RecoveryScene from "@m/domains/auth/components/recovery/scene/RecoveryScene.jsx"
import BottomAction from "@m/domains/auth/components/recovery/scene/BottomAction.jsx"
import FindIdForm from "@m/domains/auth/components/recovery/FindIdForm.jsx"
import FindIdResult from "@m/domains/auth/components/recovery/FindIdResult.jsx"

const FORM_ID = "find-id-form"

// 찾았으면 가린 이메일 + 다시 찾기, 아니면 입력 칸 + 아이디 찾기 버튼
export default function FindIdPage() {
  const navigate = useNavigate()
  const find = useFindId()
  const isFound = find.status === "found"
  const isSubmitting = find.status === "submitting"

  // 뒤로 가기는 로그인 화면으로 (데스크톱과 같음)
  const handleBack = () => navigate("/login")

  return (
    <>
      <RecoveryScene formId={FORM_ID} onSubmit={find.handleSubmit} onBack={handleBack}>
        {isFound ? (
          <FindIdResult maskedEmail={find.maskedEmail} />
        ) : (
          <FindIdForm
            status={find.status}
            nickname={find.nickname}
            setNickname={find.changeNickname}
            birthDate={find.birthDate}
            setBirthDate={find.setBirthDate}
            formError={find.formError}
            onRetry={find.backToIdle}
          />
        )}
      </RecoveryScene>

      {isFound ? (
        <BottomAction label="다시 찾기" onClick={find.backToIdle} />
      ) : (
        <BottomAction formId={FORM_ID} label={isSubmitting ? "조회 중" : "아이디 찾기"} disabled={isSubmitting} />
      )}
    </>
  )
}
