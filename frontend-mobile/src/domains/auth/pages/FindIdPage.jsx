// 아이디 찾기 화면 (/find-id): 닉네임·생년월일로 가입 이메일을 가려서 보여 줌
// app/routes/index.jsx가 씀, 상태·검사·요청은 데스크톱 useFindId 그대로
import { useNavigate } from "react-router-dom"
import { useFindId } from "@/domains/auth/hooks/recovery/useFindId.js"
import RecoveryScene from "@m/domains/auth/components/recovery/scene/RecoveryScene.jsx"
import FindIdForm from "@m/domains/auth/components/recovery/FindIdForm.jsx"
import FindIdResult from "@m/domains/auth/components/recovery/FindIdResult.jsx"

// 찾았으면 가린 이메일, 아니면 입력 칸 (데스크톱과 같음)
export default function FindIdPage() {
  const navigate = useNavigate()
  const find = useFindId()

  // 뒤로 가기는 로그인 화면으로
  const handleBack = () => navigate("/login")

  return (
    <RecoveryScene
      intro="가입할 때 입력한 닉네임과 생년월일로 계정을 찾아드려요"
      onSubmit={find.handleSubmit}
      onBack={handleBack}
    >
      {find.status === "found" ? (
        <FindIdResult maskedEmail={find.maskedEmail} onRetry={find.backToIdle} />
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
  )
}
