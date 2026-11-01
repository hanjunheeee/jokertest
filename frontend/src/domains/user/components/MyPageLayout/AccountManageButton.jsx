// 마이페이지 계정 관리 버튼
// MyPageLayout이 씀
import MyPageFramedButton from "./MyPageFramedButton.jsx"

// 틀 버튼에 글자만 정함
export default function AccountManageButton({ onClick }) {
  return <MyPageFramedButton label="계정 관리" onClick={onClick} />
}
