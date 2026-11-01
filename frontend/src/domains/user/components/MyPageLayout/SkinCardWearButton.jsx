// 마이페이지 스킨&카드 착용 버튼
// MyPageLayout이 씀
import MyPageFramedButton from "./MyPageFramedButton.jsx"

// 누르면 스킨·카드 장착 창을 엶
export default function SkinCardWearButton({ onClick = () => {} }) {
  return <MyPageFramedButton label="스킨&카드 착용" onClick={onClick} />
}
