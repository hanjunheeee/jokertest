// 파일 역할: SettingContentArea.jsx - 화면을 구성하는 컴포넌트입니다.
import GeneralSettingsTab from "@/domains/settings/components/tabs/GeneralSettingsTab"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useScrollbarSync } from "../hooks/useScrollbarSync.js"

const CONTENT_LIST_HEIGHT =
  "h-[clamp(26rem,min(58vh,52dvh),36rem)]"

function SettingTabPlaceholder() {
  return (
    <p className="flex flex-1 items-center justify-center font-subheading text-[clamp(0.95rem,1.2vw,1.05rem)] text-[#2a1810]/70">
      준비 중입니다.
    </p>
  )
}

/** 선택된 설정 탭의 본문과 커스텀 스크롤바를 렌더링합니다. */
export default function SettingContentArea({ activeTab, visible }) {
  const { listRef, scrollbarBox } = useScrollbarSync(activeTab, visible)

  return (
    <div className={`px-[clamp(0.75rem,2vw,1.25rem)] ${CONTENT_LIST_HEIGHT}`}>
      <div className="relative h-full">
        <div
          ref={listRef}
          className={`flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain pr-[clamp(1.15rem,2vw,1.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
          role="region"
          aria-label="설정 목록"
        >
          {activeTab === "general" ? (
            <GeneralSettingsTab />
          ) : (
            <SettingTabPlaceholder />
          )}
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
