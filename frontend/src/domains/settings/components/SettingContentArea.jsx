// 설정 내용 칸 (지금 탭 내용 + 그림 스크롤바)
// components/SettingPanel.jsx가 씀
import GeneralSettingsTab from "@/domains/settings/components/tabs/GeneralSettingsTab.jsx"
import SoundSettingsTab from "@/domains/settings/components/tabs/SoundSettingsTab.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useScrollbarSync } from "../hooks/useScrollbarSync.js"

// 목록 높이 (화면 높이 따라 바뀜)
const CONTENT_LIST_HEIGHT =
  "h-[clamp(34rem,min(72vh,66dvh),46rem)]"

// 탭 id로 일반·사운드 탭 고름, 모르는 id면 빈 칸
function SettingTabContent({ activeTab }) {
  if (activeTab === "general") return <GeneralSettingsTab />
  if (activeTab === "sound") return <SoundSettingsTab />
  return null
}

// 기본 스크롤바 숨기고 그림 스크롤바를 설정 줄 위치에 맞춤
export default function SettingContentArea({ activeTab, visible }) {
  const { listRef, scrollbarBox } = useScrollbarSync(activeTab, visible)

  return (
    <div
      className={`mt-[clamp(1.15rem,2.5vh,1.75rem)] px-[clamp(0.75rem,2vw,1.25rem)] ${CONTENT_LIST_HEIGHT}`}
    >
      <div className="relative h-full">
        <div
          ref={listRef}
          className={`flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain pr-[clamp(1.15rem,2vw,1.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
          role="region"
          aria-label="설정 목록"
        >
          <SettingTabContent activeTab={activeTab} />
        </div>

        <Scrollbar
          scrollRef={listRef}
          trackSrc={SETTING_ASSETS.scrollTrack}
          thumbSrc={SETTING_ASSETS.scrollThumb}
          box={scrollbarBox}
        />
      </div>
    </div>
  )
}
