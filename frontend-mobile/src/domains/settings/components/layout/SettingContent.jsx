// 설정 내용 칸 (지금 탭 내용, 세로 스크롤)
// pages/SettingPage.jsx가 씀
import {
    SETTING_CONTENT_INNER_CLASS,
    SETTING_CONTENT_SCROLL_CLASS,
} from "@m/domains/settings/constants/settingMobileLayout.js"
import GeneralTab from "../tabs/GeneralTab.jsx"
import SoundTab from "../tabs/SoundTab.jsx"

// 탭 id로 일반·사운드 고름, 모르는 id면 빈 칸
function TabBody({ activeTab }) {
    if (activeTab === "general") return <GeneralTab />
    if (activeTab === "sound") return <SoundTab />
    return null
}

// 폰은 기본 스크롤바 그대로 (데스크톱 그림 스크롤바는 손가락으로 못 잡음), 작은 가로는 양피지 폭에 맞춰 줄임
export default function SettingContent({ activeTab }) {
    return (
        <div role="region" aria-label="설정 목록" className={SETTING_CONTENT_SCROLL_CLASS}>
            <div className={SETTING_CONTENT_INNER_CLASS}>
                <TabBody activeTab={activeTab} />
            </div>
        </div>
    )
}
