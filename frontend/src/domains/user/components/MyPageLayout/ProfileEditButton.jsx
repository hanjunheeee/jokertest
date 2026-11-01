// 마이페이지 프로필 수정 버튼
// MyPageLayout이 씀
import MyPageFramedButton from "./MyPageFramedButton.jsx"

// 누르면 프로필 편집 창을 엶
export default function ProfileEditButton({ onClick = () => {} }) {
  return <MyPageFramedButton label="프로필 수정" onClick={onClick} />
}
