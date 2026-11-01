// 서고 화면 (/library): 배경·책·뒤로 버튼·소리 조절
// app/routes/index.jsx가 씀
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LibraryBackground from "../components/LibraryBackground.jsx"
import LibraryBookShell from "../components/book/LibraryBookShell.jsx"
import { BACK_BTN_REVEAL_DELAY } from "../constants/libraryEntranceMotion.js"
import { LIBRARY_PAGE_ROOT_CLASS } from "../constants/libraryLayoutStyle.js"
import { useLibraryPage } from "../hooks/useLibraryPage.js"
import { useLibraryTab } from "../hooks/useLibraryTab.js"
import { resolveAchievementLocation } from "../content/achievementLocation.js"
import { ACHIEVEMENT_PARAM } from "../../../shared/constants/notificationTargets.js"
import MotionBackButton from "../../../shared/ui/MotionBackButton.jsx"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "../../../shared/constants/navigationLayout.js"
import { PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"
import { UI_REVEAL_TRANSITION } from "../../../shared/constants/pageTransitions.js"

// 탭·쪽·직업 순번을 들고 책에 넘김, 알림 업적이면 그 자리로 옮김
export default function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeTabId, setActiveTabId } = useLibraryTab()
  const { pageIndex, goToPage, goNext, goPrev, canGoNext, canGoPrev } = useLibraryPage(activeTabId)

  // 알림에서 들어오면 주소에 업적 id가 실려 옴
  const targetAchievementId = searchParams.get(ACHIEVEMENT_PARAM)

  // 직업 순번을 여기서 들어야 알림으로 들어올 때 바꿀 수 있음
  const [jobIndex, setJobIndex] = useState(0)

  // 업적 id가 바뀌면 그 업적 있는 탭·쪽·직업으로, 모르는 id면 그대로
  useEffect(() => {
    const location = resolveAchievementLocation(targetAchievementId)
    if (location === null) return

    setActiveTabId(location.tabId)
    goToPage(location.pageIndex, location.tabId)
    if (location.jobIndex !== null) setJobIndex(location.jobIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAchievementId])

  return (
    <div className={LIBRARY_PAGE_ROOT_CLASS}>
      <LibraryBackground />
      <LibraryBookShell
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        pageIndex={pageIndex}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrevPage={goPrev}
        onNextPage={goNext}
        jobIndex={jobIndex}
        onJobChange={setJobIndex}
        targetAchievementId={targetAchievementId}
      />
      {/* 뒤로 가기는 로비로, 책 다음에 늦게 보임 */}
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: BACK_BTN_REVEAL_DELAY }}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      />
      <PageSoundControlArea className={PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS} />
    </div>
  )
}
