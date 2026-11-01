// 기억의 서고 화면 (/library): 위 줄(뒤로·목차·소리·탭) + 양피지 한 장 + 바닥 쪽 넘김
// app/routes/index.jsx가 씀, 데스크톱 두 쪽 펼침 책을 폰에선 한 쪽씩(가로·태블릿은 두 쪽) 보여 줌
import { useNavigate } from "react-router-dom"
import { LIBRARY_TABS } from "@/domains/library/constants/libraryTabs.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "@/shared/constants/jobSpreadMeta.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import BookSheet from "@m/domains/library/components/book/BookSheet.jsx"
import PagerBar from "@m/domains/library/components/book/PagerBar.jsx"
import ForbiddenRecordsView from "@m/domains/library/components/forbidden/ForbiddenRecordsView.jsx"
import InvitedGuestsView from "@m/domains/library/components/guests/InvitedGuestsView.jsx"
import JobTabs from "@m/domains/library/components/guests/JobTabs.jsx"
import LibraryBackdrop from "@m/domains/library/components/top/LibraryBackdrop.jsx"
import LibraryTopBar from "@m/domains/library/components/top/LibraryTopBar.jsx"
import { useBookPager } from "@m/domains/library/hooks/useBookPager.js"
import { useLibraryLocation } from "@m/domains/library/hooks/useLibraryLocation.js"
import { useTwoColumn } from "@m/domains/library/hooks/useTwoColumn.js"

// 바닥 줄 글자: 금지된 기록은 기록 번호, 초대받은 자들은 직업 이름 + 면 이름
function pagerText(location, twoColumn) {
  if (location.activeTabId === LIBRARY_TABS.forbiddenRecords.id) {
    return {
      title: `기록 ${location.pageIndex + 1} / ${location.pageCount}`,
      sub: twoColumn ? null : location.side === 0 ? "기록 원고" : "해금 조건",
    }
  }
  return {
    title: INVITED_GUESTS_JOB_SPREAD_META[location.jobIndex]?.jobLabel ?? "",
    sub: location.side === 0 ? "직업 설명 · 전적" : "숙련도 랭킹 · 도전과제",
  }
}

// 위치 상태·넘김은 모바일 훅, 탭 내용은 탭별 화면이 그림
export default function LibraryPage() {
  const navigate = useNavigate()
  const twoColumn = useTwoColumn()
  const location = useLibraryLocation()
  const pager = useBookPager(location, twoColumn)
  const isForbidden = location.activeTabId === LIBRARY_TABS.forbiddenRecords.id
  const { title, sub } = pagerText(location, twoColumn)
  const scrollKey = `${location.activeTabId}-${location.pageIndex}-${location.jobIndex}-${twoColumn ? "two" : location.side}`

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <LibraryBackdrop />
      <LibraryTopBar
        activeTabId={location.activeTabId}
        onTabChange={location.setActiveTabId}
        onBack={() => navigate("/lobby")}
      />
      <BookSheet
        scrollKey={scrollKey}
        onNext={pager.next}
        onPrev={pager.prev}
        header={isForbidden ? null : <JobTabs activeIndex={location.jobIndex} onSelect={location.setJobIndex} />}
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
      {/* 넘길 쪽이 없으면(초대받은 자들 두 쪽 모양) 바닥 줄 안 그림 */}
      {pager.canNext || pager.canPrev ? (
        <ShellBottom>
          <PagerBar
            title={title}
            sub={sub}
            canPrev={pager.canPrev}
            canNext={pager.canNext}
            onPrev={pager.prev}
            onNext={pager.next}
          />
        </ShellBottom>
      ) : null}
    </div>
  )
}
