// 설정 탭 줄 (일반·사운드, 데스크톱 옵션 버튼 그림)
// pages/SettingPage.jsx가 씀
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import { SETTING_TABS } from "@/domains/settings/constants/settingTabs.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { IMAGE_LABEL_CLASS } from "../../constants/settingStyles.js"

// 그림 비율(208×86) 그대로, 폭 7.5rem이면 높이 49px
export default function SettingTabs({ activeTab, onSelect }) {
    return (
        <nav className="flex shrink-0 items-center justify-center gap-3 py-2" role="tablist" aria-label="설정 탭">
            {SETTING_TABS.map((tab) => {
                const active = activeTab === tab.id
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onSelect(tab.id)}
                        className="relative w-30 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none md:w-36"
                    >
                        <PublicAsset
                            src={active ? SETTING_ASSETS.tabActive : SETTING_ASSETS.tabInactive}
                            alt=""
                            className="block h-auto w-full select-none"
                        />
                        <span className={`${IMAGE_LABEL_CLASS} app-text-scaled [--app-text-size:1.1rem]`}>{tab.label}</span>
                    </button>
                )
            })}
        </nav>
    )
}
