// 스킨·카드 착용 시트 (직업 탭·미리보기·목록·적용), 화면 전체를 덮음
// 모바일 MyPage가 { open, onClose }로 씀, 상태는 useWearSheet(데스크톱 선택·저장 훅 그대로)
import ConfirmBar from "@m/domains/user/components/wear/ConfirmBar.jsx"
import FullSheet from "@m/domains/user/components/wear/FullSheet.jsx"
import ItemGrid from "@m/domains/user/components/wear/ItemGrid.jsx"
import JobTabs from "@m/domains/user/components/wear/JobTabs.jsx"
import Preview from "@m/domains/user/components/wear/Preview.jsx"
import { useWearSheet } from "@m/domains/user/hooks/wear/useWearSheet.js"

// 적용 버튼 글자: 저장 중·실패/모름이면 다시 시도·평소엔 적용
const confirmLabelOf = (status) => {
  if (status === "saving") return "저장 중..."
  if (status === "error" || status === "uncertain") return "다시 시도"
  return "적용"
}

// 세로: 탭·미리보기 위, 목록 아래 / 폰 가로: 미리보기 왼쪽, 탭·목록 오른쪽
export default function WearSheet({ open, onClose }) {
  const wear = useWearSheet({ open, onClose })
  const isSaving = wear.confirmStatus === "saving"
  const hasFailed = wear.confirmStatus === "error" || wear.confirmStatus === "uncertain"

  return (
    <FullSheet open={open} onClose={onClose} label="스킨&카드 착용" title="스킨&카드 목록">
      <div className="flex min-h-0 flex-1 flex-col land:flex-row land:gap-3 land:px-4 land:pt-2" inert={isSaving} aria-disabled={isSaving}>
        <div className="contents land:flex land:w-[42%] land:min-h-0 land:flex-col land:pb-2">
          <Preview preview={wear.preview} disabled={isSaving} onToggle={wear.togglePreviewMode} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col land:min-w-0">
          <JobTabs
            tabs={wear.jobTabs}
            activeIndex={wear.activeJobIndex}
            onSelect={wear.setActiveJobIndex}
            disabled={isSaving}
          />
          <ItemGrid
            items={wear.listItems}
            selectedItemId={wear.selectedItemId}
            appliedSkinsByJob={wear.appliedSkinsByJob}
            appliedCardFrameId={wear.appliedCardFrameId}
            onSelectItem={wear.handleSelectItem}
          />
        </div>
      </div>
      <ConfirmBar
        label={confirmLabelOf(wear.confirmStatus)}
        saving={isSaving}
        error={hasFailed ? wear.confirmError : null}
        onConfirm={wear.handleConfirm}
      />
    </FullSheet>
  )
}
