// 마이페이지 이모티콘 꾸미기 화면 가는 버튼
// MyPageLayout만 씀
import { useNavigate } from "react-router-dom"

import MyPageFramedButton from "./MyPageFramedButton.jsx"

export default function EmoticonEntryButton({ onOpenEmoticons }) {
  const navigate = useNavigate()
  const handleClick = onOpenEmoticons ?? (() => navigate("/mypage/emoticons"))

  return <MyPageFramedButton label="이모티콘" onClick={handleClick} />
}
