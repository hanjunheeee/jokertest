/**
 * 설정 패널.
 *
 * 탭 전환 및 커스텀 스크롤바 위치 동기화를 담당합니다.
 * - 탭 전환 상태 → activeTab (이 컴포넌트에서 직접 관리)
 * - 스크롤바 위치 동기화 → useScrollbarSync (listRef, scrollbarBox 반환)
 */
import { motion } from "framer-motion"
import { useState } from "react"
import { SETTING_ASSETS, SETTING_TABS } from "../constants/settingAssets.js"
import GeneralSettingsTab from "@/domains/settings/components/tabs/GeneralSettingsTab"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useScrollbarSync } from "../hooks/useScrollbarSync.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

const PANEL_CLASS =
  "absolute left-1/2 top-[42%] z-20 w-[min(56rem,88vw)] -translate-x-1/2 -translate-y-1/2"

const TAB_BTN_CLASS =
  "relative min-w-[clamp(5.75rem,11.5vw,7.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.95rem,1.35vw,1.15rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const CONTENT_LIST_HEIGHT =
  "h-[clamp(26rem,min(58vh,52dvh),36rem)]"

/** 단일 탭 버튼 — active 여부에 따라 이미지와 aria-pressed가 전환됩니다. */
function SettingTab({ tab, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={TAB_BTN_CLASS}
      aria-pressed={active}
    >
      <PublicAsset
        src={active ? SETTING_ASSETS.tabActive : SETTING_ASSETS.tabInactive}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={TAB_LABEL_CLASS}>{tab.label}</span>
    </button>
  )
}

/** 미구현 탭에 표시되는 준비 중 안내 */
function SettingTabPlaceholder() {
  return (
    <p className="flex flex-1 items-center justify-center font-subheading text-[clamp(0.95rem,1.2vw,1.05rem)] text-[#2a1810]/70">
      준비 중입니다.
    </p>
  )
}

export default function SettingPanel({ visible }) {
  const [activeTab, setActiveTab] = useState("general") // 현재 선택된 탭 id

  // listRef를 설정 목록에 연결하면 useScrollbarSync가 ResizeObserver로 높이를 측정해 scrollbarBox를 반환
  const { listRef, scrollbarBox } = useScrollbarSync(activeTab, visible)

  return (
    <motion.div
      className={PANEL_CLASS}
      initial={{ opacity: 0, y: 10 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }} // 인트로 중 클릭 차단
    >
      <nav
        className="-translate-y-[clamp(0.85rem,2.2vh,1.35rem)] mb-[clamp(0.55rem,1.3vh,0.75rem)] flex justify-center gap-[clamp(0.35rem,0.8vw,0.55rem)]"
        aria-label="설정 탭"
      >
        {SETTING_TABS.map((tab) => (
          <SettingTab
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onSelect={setActiveTab}
          />
        ))}
      </nav>

      <div className={`px-[clamp(0.75rem,2vw,1.25rem)] ${CONTENT_LIST_HEIGHT}`}>
        <div className="relative h-full">
          {/* listRef 연결 — useScrollbarSync가 이 엘리먼트의 크기를 측정 */}
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
    </motion.div>
  )
}
