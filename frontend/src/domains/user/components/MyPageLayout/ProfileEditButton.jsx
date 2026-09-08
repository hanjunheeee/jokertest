import MyPageFramedButton from "./MyPageFramedButton.jsx"

export default function ProfileEditButton({ onClick = () => {} }) {
  return <MyPageFramedButton label="프로필 수정" onClick={onClick} />
}
