// 설정 위 줄 (뒤로 가기 그림 버튼만, 데스크톱처럼 제목 없음)
// pages/SettingPage.jsx가 씀
import BackButton from "@m/shared/ui/button/BackButton.jsx"

// hideBack: 위 뒤로 없음(shell 하단만). 미사용 시 SettingPage에서 TopBar 제거 가능
export default function SettingTopBar({ onBack, hideBack = false }) {
    if (hideBack) {
        return <header className="flex h-14 shrink-0 land:h-12 land:w-14" aria-hidden="true" />
    }

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
