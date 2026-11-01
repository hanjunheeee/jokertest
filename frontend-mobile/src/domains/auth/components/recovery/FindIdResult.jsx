// 아이디 찾기 결과: 가린 가입 이메일 보여 주기 (다시 찾기 버튼은 페이지가 바닥 줄에 둠)
// pages/FindIdPage.jsx가 찾았을 때 씀
import CardIntro from "./CardIntro.jsx"
import RecoveryAlert from "./RecoveryAlert.jsx"

// 이메일은 가린 값만 받음 (서버가 가려서 줌), 위 안내 문구는 데스크톱처럼 그대로 둠
export default function FindIdResult({ maskedEmail }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-center">
      <CardIntro>가입할 때 입력한 닉네임과 생년월일로 계정을 찾아드려요</CardIntro>
      <p className="app-text-scaled font-subheading font-bold text-text-body [--app-text-size:14px]">
        가입하신 이메일은 아래와 같아요
      </p>
      <RecoveryAlert role="status" className="w-full break-all">{maskedEmail}</RecoveryAlert>
    </div>
  )
}
