// 파일 역할: SettingContentArea.jsx - 화면을 구성하는 컴포넌트입니다.
import GeneralSettingsTab from "@/domains/settings/components/tabs/GeneralSettingsTab.jsx"
import SoundSettingsTab from "@/domains/settings/components/tabs/SoundSettingsTab.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useScrollbarSync } from "../hooks/useScrollbarSync.js"

const CONTENT_LIST_HEIGHT =
  "h-[clamp(34rem,min(72vh,66dvh),46rem)]"

function SettingTabContent({ activeTab }) {
  if (activeTab === "general") return <GeneralSettingsTab />
  if (activeTab === "sound") return <SoundSettingsTab />
  return null
}

/** 선택된 설정 탭의 본문과 커스텀 스크롤바를 렌더링합니다. */
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
