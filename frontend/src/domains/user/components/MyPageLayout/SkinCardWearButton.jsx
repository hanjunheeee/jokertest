import MyPageFramedButton from "./MyPageFramedButton.jsx"

export default function SkinCardWearButton({ onClick = () => {} }) {
  return <MyPageFramedButton label="스킨&카드 착용" onClick={onClick} />
}
