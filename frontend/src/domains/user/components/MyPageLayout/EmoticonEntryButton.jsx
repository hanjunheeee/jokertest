import { useNavigate } from "react-router-dom"

import MyPageFramedButton from "./MyPageFramedButton.jsx"

export default function EmoticonEntryButton({ onOpenEmoticons }) {
  const navigate = useNavigate()
  const handleClick = onOpenEmoticons ?? (() => navigate("/mypage/emoticons"))

  return <MyPageFramedButton label="이모티콘" onClick={handleClick} />
}
