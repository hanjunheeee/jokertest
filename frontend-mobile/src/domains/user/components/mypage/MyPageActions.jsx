// 마이페이지 바닥 버튼 줄 (계정 관리 · 프로필 수정 · 스킨&카드 착용 · 이모티콘, 데스크톱 순서)
// MyPage가 ShellBottom 안에 넣음, 세로 2×2 · 가로 4칸

import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 데스크톱 MyPageFramedButton 그림·글자 모양, 그림 비율 그대로 (칸 폭 160px 이상이라 높이 44px 넘음)
// 데스크톱 hover 흐림을 누를 때로 옮김, 가로 화면은 줄 폭을 줄여 버튼 높이를 낮춤
const FRAME_SRC = "/button/버튼 프레임1.png"
const FRAME_LOOK = {
    button: "relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:opacity-85",
    img: "block h-auto w-full select-none",
    label: "pointer-events-none absolute inset-0 flex items-center justify-center px-[4%] font-subheading app-text-scaled [--app-text-size:0.78rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]",
}

// 이동·시트 열기는 MyPage가 넘김 (다른 담당 화면 파일을 안 부름)
export default function MyPageActions({ onAccount, onProfileEdit, onSkinCardWear, onEmoticons }) {
    // z-30: 본문 z-10 위에 그려 탭 먹게. translate는 시각만 올림
    return (
        <div className="relative z-30 mx-auto grid w-full max-w-[20.5rem] -translate-y-[6.75rem] grid-cols-2 gap-1.5 px-3 pb-0 pt-0 land:-translate-y-[4.25rem] land:max-w-[34rem] land:grid-cols-4 land:gap-2">
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="계정 관리" onClick={onAccount} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="프로필 수정" onClick={onProfileEdit} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="스킨&카드 착용" onClick={onSkinCardWear} />
            <ImageButton look={FRAME_LOOK} src={FRAME_SRC} label="이모티콘" onClick={onEmoticons} />
        </div>
    )
}
