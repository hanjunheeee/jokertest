import { motion } from "framer-motion"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { SETTING_ASSETS, SETTING_TABS } from "@/assets/settingAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import GeneralSettingsTab from "@/domains/user/components/tabs/GeneralSettingsTab"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

/** prototype — 영상 위 양피지 영역에 맞춘 오버레이 */
const PANEL_CLASS =
  "absolute left-1/2 top-[42%] z-20 w-[min(56rem,88vw)] -translate-x-1/2 -translate-y-1/2"

const TAB_BTN_CLASS =
  "relative min-w-[clamp(5.75rem,11.5vw,7.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.95rem,1.35vw,1.15rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 양피지 본문(탭 아래 ~ 하단 장식 위)에 맞춘 목록·스크롤바 높이 */
const CONTENT_LIST_HEIGHT =
  "h-[clamp(26rem,min(58vh,52dvh),36rem)]"

/** 빈 스크롤바 트랙 너비 (스크롤 연동은 추후) */
const SCROLLBAR_WIDTH_CLASS = "w-[clamp(0.7rem,1.2vw,0.95rem)]"
/** 트랙 장식 테두리 안쪽 홈에 맞춘 롤러 가로 비율 */
const SCROLL_THUMB_WIDTH_CLASS = "w-[62%]"

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

function SettingTabPlaceholder() {
  return (
    <p className="flex flex-1 items-center justify-center font-subheading text-[clamp(0.95rem,1.2vw,1.05rem)] text-[#2a1810]/70">
      준비 중입니다.
    </p>
  )
}

function measureSettingRows(listEl) {
  const rows = listEl.querySelectorAll("[data-setting-row]")
  if (!rows.length) return null

  const wrapRect = listEl.getBoundingClientRect()
  const firstRect = rows[0].getBoundingClientRect()
  const lastRect = rows[rows.length - 1].getBoundingClientRect()

  return {
    top: firstRect.top - wrapRect.top,
    height: lastRect.bottom - firstRect.top,
  }
}

export default function SettingPanel({ visible }) {
  const [activeTab, setActiveTab] = useState("general")
  const listRef = useRef(null)
  const [scrollbarBox, setScrollbarBox] = useState(null)

  const syncScrollbarHeight = useCallback(() => {
    const listEl = listRef.current
    if (!listEl || activeTab !== "general") {
      setScrollbarBox(null)
      return
    }
    setScrollbarBox(measureSettingRows(listEl))
  }, [activeTab])

  useLayoutEffect(() => {
    syncScrollbarHeight()
    const listEl = listRef.current
    if (!listEl) return undefined

    const observer = new ResizeObserver(() => syncScrollbarHeight())
    observer.observe(listEl)
    window.addEventListener("resize", syncScrollbarHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncScrollbarHeight)
    }
  }, [syncScrollbarHeight, visible])

  const scrollbarStyle =
    scrollbarBox != null
      ? { top: scrollbarBox.top, height: scrollbarBox.height }
      : undefined

  return (
    <motion.div
      className={PANEL_CLASS}
      initial={{ opacity: 0, y: 10 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
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
          <div
            ref={listRef}
            className="flex h-full flex-col pr-[clamp(1.15rem,2vw,1.55rem)]"
            role="region"
            aria-label="설정 목록"
          >
            {activeTab === "general" ? (
              <GeneralSettingsTab />
            ) : (
              <SettingTabPlaceholder />
            )}
          </div>

          <div
            className={`pointer-events-none absolute right-0 flex translate-x-[clamp(0.25rem,0.65vw,0.5rem)] flex-col leading-[0] ${SCROLLBAR_WIDTH_CLASS} ${scrollbarBox == null ? "inset-y-0" : ""}`}
            style={scrollbarStyle}
            aria-hidden="true"
          >
            <PublicAsset
              src={SETTING_ASSETS.scrollTrack}
              alt=""
              className="block h-full min-h-0 w-full flex-1 select-none object-fill"
            />
            <PublicAsset
              src={SETTING_ASSETS.scrollThumb}
              alt=""
              className={`absolute left-1/2 top-[18%] h-auto -translate-x-1/2 select-none ${SCROLL_THUMB_WIDTH_CLASS}`}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
