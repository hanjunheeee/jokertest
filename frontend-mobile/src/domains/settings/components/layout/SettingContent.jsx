// 설정 내용 칸 (지금 탭 내용, 세로 스크롤)
// pages/SettingPage.jsx가 씀
import GeneralTab from "../tabs/GeneralTab.jsx"
import SoundTab from "../tabs/SoundTab.jsx"

// 탭 id로 일반·사운드 고름, 모르는 id면 빈 칸
function TabBody({ activeTab }) {
    if (activeTab === "general") return <GeneralTab />
    if (activeTab === "sound") return <SoundTab />
    return null
}

// 폰은 기본 스크롤바 그대로 (데스크톱 그림 스크롤바는 손가락으로 못 잡음)
export default function SettingContent({ activeTab }) {
    return (
        <div
            role="region"
            aria-label="설정 목록"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 md:px-10"
        >
            <div className="mx-auto w-full max-w-xl land:max-w-lg">
                <TabBody activeTab={activeTab} />
            </div>
        </div>
    )
}
