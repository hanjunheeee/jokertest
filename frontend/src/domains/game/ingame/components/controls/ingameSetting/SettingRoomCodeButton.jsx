// 설정 창 아래 방 코드 보기 버튼
// 설정 창 내용(SettingPanelContent)이 사용, 누르면 방 코드 창을 엶
import SettingFooterImageButton from "./SettingFooterImageButton.jsx"

export default function SettingRoomCodeButton({ onClick }) {
  return (
    <SettingFooterImageButton
      ariaLabel="방 코드 보기"
      label="방 코드 보기"
      onClick={onClick}
    />
  )
}
