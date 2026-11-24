// 마이페이지 바닥 버튼 줄 (계정 관리 · 프로필 수정 · 스킨&카드 착용 · 이모티콘)
// MyPage 본문 흐름 안 — 운명의 가면·피의 기록과 같이 스크롤

import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import {
  MY_PAGE_ACTIONS_GRID_CLASS,
  MY_PAGE_ACTIONS_WRAP,
} from "@m/domains/user/constants/myPageMobileLayout.js"

const FRAME_SRC = "/button/버튼 프레임1.webp"
const FRAME_LOOK = {
  button: "relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:opacity-85",
  img: "block h-auto w-full select-none",
  label:
    "pointer-events-none absolute inset-0 flex items-center justify-center px-[4%] font-subheading app-text-scaled [--app-text-size:0.78rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]",
}

export default function MyPageActions({ onAccount, onProfileEdit, onSkinCardWear, onEmoticons }) {
  return (
    <div className={MY_PAGE_ACTIONS_WRAP}>
      <div className={MY_PAGE_ACTIONS_GRID_CLASS}>
        <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="계정 관리" onClick={onAccount} />
        <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="프로필 수정" onClick={onProfileEdit} />
        <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="스킨&카드 착용" onClick={onSkinCardWear} />
        <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="이모티콘" onClick={onEmoticons} />
      </div>
    </div>
  )
}
