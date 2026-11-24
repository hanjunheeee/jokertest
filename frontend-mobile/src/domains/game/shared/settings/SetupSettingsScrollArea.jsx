// 설정 목록 스크롤 + 커스텀 스크롤막대 (서고 책 본문과 같은 방식)
// SetupPanel·SettingsItemList가 씀
import { useLayoutEffect, useRef } from "react"
import Scrollbar from "@m/shared/ui/scroll/Scrollbar.jsx"
import {
  SETUP_SETTINGS_SCROLL_AREA_CLASS,
  SETUP_SETTINGS_SCROLL_WRAP_CLASS,
  SETUP_SETTINGS_SCROLLBAR_CLASS,
} from "./setupScrollStyle.js"

export default function SetupSettingsScrollArea({ scrollKey, parchmentStyle, children }) {
  const scrollRef = useRef(null)

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])

  return (
    <div className={SETUP_SETTINGS_SCROLL_WRAP_CLASS}>
      <div ref={scrollRef} data-setup-content className={SETUP_SETTINGS_SCROLL_AREA_CLASS} style={parchmentStyle}>
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} syncKey={scrollKey} className={SETUP_SETTINGS_SCROLLBAR_CLASS} />
    </div>
  )
}