import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LibraryBackground from "../components/LibraryBackground.jsx"
import LibraryBookShell from "../components/book/LibraryBookShell.jsx"
import { LIBRARY_BACK_BUTTON_REVEAL_DELAY } from "../constants/libraryEntranceMotion.js"
import { LIBRARY_PAGE_ROOT_CLASS } from "../constants/libraryLayoutStyle.js"
import { useLibraryPage } from "../hooks/useLibraryPage.js"
import { useLibraryTab } from "../hooks/useLibraryTab.js"
import { resolveAchievementLocation } from "../content/achievementLocation.js"
import { NOTIFICATION_ACHIEVEMENT_PARAM } from "../../notifications/constants/notificationTargets.js"
import MotionBackButton from "../../../shared/ui/MotionBackButton.jsx"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "../../../shared/constants/navigationLayout.js"
import { PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"
import { UI_REVEAL_TRANSITION } from "../../../shared/constants/pageTransitions.js"

/** 기억의 서고 — 금지된 기록 레이아웃 */
export default function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeTabId, setActiveTabId } = useLibraryTab()
  const { pageIndex, goToPage, goNext, goPrev, canGoNext, canGoPrev } = useLibraryPage(activeTabId)

  // F-17(AC-02): 알림에서 "기억의 서고에서 보기"로 들어오면 ?achievementId=<서버 정의 id>가
  // 붙는다. 허용 목록으로만 해석하고(모르는 id는 무시), 그 업적이 있는 목차·페이지·직업을
  // 연다. 이 값으로 지급을 트리거하거나 진행률을 바꾸지 않는다 — 화면 위치만 고른다.
  const targetAchievementId = searchParams.get(NOTIFICATION_ACHIEVEMENT_PARAM)

  // 초대받은 자들 탭의 직업 선택은 원래 InvitedGuestsSpread가 자체 상태로 들고 있었다.
  // URL 대상이 특정 직업을 가리키므로 여기서 소유하고 내려보낸다(기존 기본값 0은 유지).
  const [jobIndex, setJobIndex] = useState(0)

  useEffect(() => {
    const location = resolveAchievementLocation(targetAchievementId)
    if (location === null) return

    setActiveTabId(location.tabId)
    // 목적 탭을 **명시**해서 넘긴다 — 생략하면 아직 바뀌기 전의 activeTabId 클로저에
    // 페이지가 기록되어, 목적 탭은 0페이지로 열리고 이전 탭만 엉뚱하게 움직인다.
    goToPage(location.pageIndex, location.tabId)
    if (location.jobIndex !== null) setJobIndex(location.jobIndex)
    // goToPage/setActiveTabId는 매 렌더 새로 만들어지는 함수라 의존성에 넣으면 이 효과가
    // 매번 다시 돈다 — URL 대상이 바뀔 때만 위치를 다시 고른다.
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
        transition={{ ...UI_REVEAL_TRANSITION, delay: LIBRARY_BACK_BUTTON_REVEAL_DELAY }}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      />
      <PageSoundControlArea className={PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS} />
    </div>
  )
}
