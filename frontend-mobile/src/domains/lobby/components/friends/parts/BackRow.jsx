// 탭 아래 뒤로 버튼 줄 (친구 목록으로 돌아가기)
// 친구 추가·요청 수락·게임 초대·차단 탭이 맨 아래에 그림
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import { BACK_ROW_CLASS } from "../sheetStyle.js"

// 데스크톱 compact 뒤로 버튼과 같은 그림·이름, 왼쪽 아래 자리
export default function BackRow({ onBack }) {
  return (
    <div className={BACK_ROW_CLASS}>
      <BackButton label="친구 목록으로 돌아가기" onClick={onBack} />
    </div>
  )
}
