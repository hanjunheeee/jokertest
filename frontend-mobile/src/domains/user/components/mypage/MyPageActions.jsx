// 마이페이지 바닥 버튼 줄 (계정 관리 · 프로필 수정 · 스킨&카드 착용 · 이모티콘)
// MyPage가 ShellBottom 안에 넣음, 세로 2×2 · 가로 4칸

import FramedButton from "./FramedButton.jsx"

// 이동·시트 열기는 MyPage가 넘김 (다른 담당 화면 파일을 안 부름)
export default function MyPageActions({ onAccount, onProfileEdit, onSkinCardWear, onEmoticons }) {
    return (
        <nav
            aria-label="마이페이지 메뉴"
            className="mx-auto grid w-full max-w-[30rem] grid-cols-2 gap-2 bg-gradient-to-t from-black/90 to-black/50 px-4 pb-3 pt-2 land:max-w-[52rem] land:grid-cols-4 land:pb-2"
        >
            <FramedButton label="계정 관리" onClick={onAccount} />
            <FramedButton label="프로필 수정" onClick={onProfileEdit} />
            <FramedButton label="스킨&카드 착용" onClick={onSkinCardWear} />
            <FramedButton label="이모티콘" onClick={onEmoticons} />
        </nav>
    )
}
