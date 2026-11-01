// 마이페이지 바닥 버튼 줄 (계정 관리 · 프로필 수정 · 스킨&카드 착용 · 이모티콘)
// MyPage가 ShellBottom 안에 넣음, 세로 2×2 · 가로 4칸

import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 틀 그림 버튼 (데스크톱 MyPageFramedButton 그림, 칸에 맞춰 늘림, 높이 44px 이상)
const FRAME_SRC = "/button/버튼 프레임1.png"
const FRAME_LOOK = {
    button: "relative block h-12 w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97]",
    img: "absolute inset-0 block h-full w-full select-none",
    label: "pointer-events-none absolute inset-0 flex items-center justify-center px-2 font-subheading text-[0.95rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]",
}

// 이동·시트 열기는 MyPage가 넘김 (다른 담당 화면 파일을 안 부름)
export default function MyPageActions({ onAccount, onProfileEdit, onSkinCardWear, onEmoticons }) {
    return (
        <nav
            aria-label="마이페이지 메뉴"
            className="mx-auto grid w-full max-w-[30rem] grid-cols-2 gap-2 bg-gradient-to-t from-black/90 to-black/50 px-4 pb-3 pt-2 land:max-w-[52rem] land:grid-cols-4 land:pb-2"
        >
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="계정 관리" onClick={onAccount} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="프로필 수정" onClick={onProfileEdit} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="스킨&카드 착용" onClick={onSkinCardWear} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="이모티콘" onClick={onEmoticons} />
        </nav>
    )
}
