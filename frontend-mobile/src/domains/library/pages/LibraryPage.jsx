// 기억의 서고 화면 (/library): 소리 줄 + 양피지, 하단 왼쪽 책갈피·오른쪽 뒤로
// app/routes/index.jsx가 씀, 폰은 탭별 한 스크롤(금지: 해금+본문, 초대: 전적+도전과제), 넓은 화면은 두 쪽 펼침
import { useNavigate } from "react-router-dom"
import { LIBRARY_TABS } from "@/domains/library/constants/libraryTabs.js"
import BookSheet from "@m/domains/library/components/book/BookSheet.jsx"
import PageNavigation from "@m/domains/library/components/book/PageNavigation.jsx"
import ForbiddenRecordsView from "@m/domains/library/components/forbidden/ForbiddenRecordsView.jsx"
import InvitedGuestsView from "@m/domains/library/components/guests/InvitedGuestsView.jsx"
import JobTabs from "@m/domains/library/components/guests/JobTabs.jsx"
import LibraryBackdrop from "@m/domains/library/components/top/LibraryBackdrop.jsx"
import LibraryBottomBar from "@m/domains/library/components/top/LibraryBottomBar.jsx"
import LibraryTopBar from "@m/domains/library/components/top/LibraryTopBar.jsx"
import { useBookPager } from "@m/domains/library/hooks/useBookPager.js"
import { useLibraryLocation } from "@m/domains/library/hooks/useLibraryLocation.js"
import { useTwoColumn } from "@m/domains/library/hooks/useTwoColumn.js"

// 스크롤 맨 위로 되돌릴 기준 값: 폰 한 쪽은 금지 탭이면 쪽, 초대 탭이면 직업마다 / 두 쪽 펼침은 셋 다
// 예: 폰 금지 탭 3쪽 → "forbiddenRecords-3", 두 쪽 펼침 → "forbiddenRecords-3-0-two"
function scrollKeyOf(location, mergedSpread, isForbidden) {
  if (!mergedSpread) return `${location.activeTabId}-${location.pageIndex}-${location.jobIndex}-two`
  if (isForbidden) return `${location.activeTabId}-${location.pageIndex}`
  return `${location.activeTabId}-${location.jobIndex}`
}

// 위치 상태·넘김은 모바일 훅, 탭 내용은 탭별 화면이 그림
export default function LibraryPage() {
  const navigate = useNavigate()
  const twoColumn = useTwoColumn()
  const location = useLibraryLocation()
  const isForbidden = location.activeTabId === LIBRARY_TABS.forbiddenRecords.id
  const mergedSpread = !twoColumn
  const pager = useBookPager(location, twoColumn, { mergedSpread })
  const scrollKey = scrollKeyOf(location, mergedSpread, isForbidden)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <LibraryBackdrop />
      <LibraryTopBar activeTabId={location.activeTabId} />
      <BookSheet
        activeTabId={location.activeTabId}
        scrollKey={scrollKey}
        onNext={pager.next}
        onPrev={pager.prev}
        header={isForbidden ? null : <JobTabs activeIndex={location.jobIndex} onSelect={location.setJobIndex} />}
        nav={
          // 넘길 쪽이 없으면(초대받은 자들 두 쪽 모양) 화살표 줄 안 그림 (데스크톱도 초대받은 자들은 화살표 없음)
          pager.canNext || pager.canPrev ? (
            <PageNavigation canPrev={pager.canPrev} canNext={pager.canNext} onPrev={pager.prev} onNext={pager.next} />
          ) : null
        }
      >
        {isForbidden ? (
          <ForbiddenRecordsView
            pageIndex={location.pageIndex}
            side={location.side}
            twoColumn={twoColumn}
            targetAchievementId={location.targetAchievementId}
          />
        ) : (
          <InvitedGuestsView
            jobIndex={location.jobIndex}
            side={location.side}
            twoColumn={twoColumn}
            targetAchievementId={location.targetAchievementId}
          />
        )}
      </BookSheet>
      <LibraryBottomBar
        activeTabId={location.activeTabId}
        onTabChange={location.setActiveTabId}
        onBack={() => navigate("/lobby")}
      />
    </div>
  )
}
