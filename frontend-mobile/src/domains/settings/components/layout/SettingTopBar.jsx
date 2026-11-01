// 설정 위 줄 (뒤로 가기 그림 버튼만, 데스크톱처럼 제목 없음)
// pages/SettingPage.jsx가 씀
import BackButton from "@m/shared/ui/button/BackButton.jsx"

// 뒤로 버튼은 누르는 칸 48px, 데스크톱 왼쪽 아래 자리를 위 줄로 옮김
export default function SettingTopBar({ onBack }) {
    return (
        <header className="flex h-14 shrink-0 items-center px-2">
            <BackButton
                onClick={onBack}
                className="flex size-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-95"
                iconClassName="block h-auto w-11 select-none"
            />
        </header>
    )
}
