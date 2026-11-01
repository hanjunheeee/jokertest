// 서고 위치 상태 (탭·기록 쪽·앞뒤 면·직업 순번)와 알림 업적 자리로 옮기기
// pages/LibraryPage.jsx가 씀, 데스크톱 LibraryPage 안 로직을 모바일 쪽에 옮겨 둠 (데스크톱은 못 고침)
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useLibraryTab } from "@/domains/library/hooks/useLibraryTab.js"
import { useLibraryPage } from "@/domains/library/hooks/useLibraryPage.js"
import { resolveAchievementLocation } from "@/domains/library/content/achievementLocation.js"
import { ACHIEVEMENT_PARAM } from "@/shared/constants/notificationTargets.js"

// 모바일은 펼침면 한 쪽씩 → 탭마다 앞(0: 왼쪽)·뒤(1: 오른쪽) 면을 따로 기억
export function useLibraryLocation() {
  const [searchParams] = useSearchParams()
  const { activeTabId, setActiveTabId } = useLibraryTab()
  const page = useLibraryPage(activeTabId)
  const [jobIndex, setJobIndex] = useState(0)
  const [sideByTab, setSideByTab] = useState({})
  const [handledTarget, setHandledTarget] = useState(null)

  // 알림에서 들어오면 주소에 업적 id가 실려 옴
  const targetAchievementId = searchParams.get(ACHIEVEMENT_PARAM)
  const side = sideByTab[activeTabId] ?? 0

  // 다른 탭 면도 정할 수 있음 (알림 이동용)
  const setSide = (nextSide, tabId = activeTabId) => {
    setSideByTab((prev) => ({ ...prev, [tabId]: nextSide }))
  }

  // 업적 id가 바뀌면 그 업적 탭·쪽·직업으로 (effect 대신 그리는 중에 한 번만 맞춤, 모르는 id면 그대로)
  if (targetAchievementId !== handledTarget) {
    setHandledTarget(targetAchievementId)
    const location = resolveAchievementLocation(targetAchievementId)
    if (location !== null) {
      setActiveTabId(location.tabId)
      page.goToPage(location.pageIndex, location.tabId)
      if (location.jobIndex !== null) setJobIndex(location.jobIndex)
      // 업적(해금 조건·도전과제)은 늘 오른쪽 면에 있음
      setSide(1, location.tabId)
    }
  }

  return {
    activeTabId,
    setActiveTabId,
    ...page,
    side,
    setSide,
    jobIndex,
    setJobIndex,
    targetAchievementId,
  }
}
