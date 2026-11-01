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

export default function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeTabId, setActiveTabId } = useLibraryTab()
  const { pageIndex, goToPage, goNext, goPrev, canGoNext, canGoPrev } = useLibraryPage(activeTabId)

  const targetAchievementId = searchParams.get(ACHIEVEMENT_PARAM)

  const [jobIndex, setJobIndex] = useState(0)

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
