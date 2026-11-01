// 사용자 화면 위 줄 (뒤로 · 제목 · 소리 조절)
// ScreenFrame이 씀, 스크롤해도 위에 붙어 있음

import BackButton from "./BackButton.jsx"
import SoundMenu from "./SoundMenu.jsx"

// 제목은 가운데, 좌우 버튼은 44px 칸
export default function TopBar({ title, onBack }) {
    return (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-gradient-to-b from-black/80 to-black/0 px-3">
            <BackButton onClick={onBack} />

            <h1 className="min-w-0 flex-1 truncate text-center font-display text-[1.2rem] text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
                {title}
            </h1>

            <SoundMenu />
        </header>
    )
}
