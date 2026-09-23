import { useNavigate } from "react-router-dom"

import MyPageFramedButton from "./MyPageFramedButton.jsx"

// F-33 E-2(설계도 §2-2): 마이페이지의 이모티콘 진입 버튼. 기본 동작은 이모티콘 관리
// 화면(/mypage/emoticons)으로 이동하는 것이고, MyPageLayout은 지금도 props 없이 마운트한다
// (F-13에서 콜백을 넘기지 않던 배선을 그대로 둔 채 버튼 자신의 기본 동작만 생겼다).
// onOpenEmoticons를 넘기면 이동 대신 그 콜백만 부른다 — 오버레이로 열고 싶은 호출부가
// 생겨도 이 버튼을 고치지 않아도 되게 남겨 둔 여지다.
export default function EmoticonEntryButton({ onOpenEmoticons }) {
  const navigate = useNavigate()
  const handleClick = onOpenEmoticons ?? (() => navigate("/mypage/emoticons"))

  return <MyPageFramedButton label="이모티콘" onClick={handleClick} />
}
