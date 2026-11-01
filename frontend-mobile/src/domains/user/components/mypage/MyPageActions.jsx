// 마이페이지 바닥 버튼 줄 (계정 관리 · 프로필 수정 · 스킨&카드 착용 · 이모티콘, 데스크톱 순서)
// MyPage가 ShellBottom 안에 넣음, 세로 2×2 · 가로 4칸

import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 데스크톱 MyPageFramedButton 그림·글자 모양, 그림 비율 그대로 (칸 폭 160px 이상이라 높이 44px 넘음)
// 데스크톱 hover 흐림을 누를 때로 옮김, 가로 화면은 줄 폭을 줄여 버튼 높이를 낮춤
const FRAME_SRC = "/button/버튼 프레임1.png"
const FRAME_LOOK = {
    button: "relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:opacity-85",
    img: "block h-auto w-full select-none",
    label: "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]",
}

// 이동·시트 열기는 MyPage가 넘김 (다른 담당 화면 파일을 안 부름)
export default function MyPageActions({ onAccount, onProfileEdit, onSkinCardWear, onEmoticons }) {
    return (
        <div className="mx-auto grid w-full max-w-[30rem] grid-cols-2 gap-2 px-4 pb-3 pt-2 land:max-w-[40rem] land:grid-cols-4 land:pb-2">
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="계정 관리" onClick={onAccount} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="프로필 수정" onClick={onProfileEdit} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="스킨&카드 착용" onClick={onSkinCardWear} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="이모티콘" onClick={onEmoticons} />
        </div>
    )
}
