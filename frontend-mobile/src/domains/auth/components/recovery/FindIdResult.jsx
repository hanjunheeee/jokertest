// 아이디 찾기 결과: 가린 가입 이메일 + 다시 찾기 링크
// pages/FindIdPage.jsx가 찾았을 때 씀
import RecoveryAlert from "./RecoveryAlert.jsx"
import TextLink from "./TextLink.jsx"

// 이메일은 가린 값만 받음 (서버가 가려서 줌)
export default function FindIdResult({ maskedEmail, onRetry }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-center">
      <p className="app-text-scaled font-subheading font-bold text-text-body [--app-text-size:14px]">
        가입하신 이메일은 아래와 같아요
      </p>
      <RecoveryAlert role="status" className="w-full break-all">{maskedEmail}</RecoveryAlert>
      <TextLink onClick={onRetry}>다시 찾기</TextLink>
    </div>
  )
}
