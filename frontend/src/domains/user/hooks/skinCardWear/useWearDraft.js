// 스킨·카드 장착 창 초안 상태 (직업 탭·선택 항목·미리보기 방식·초안 장착값)
// 스킨·카드 장착 선택 훅이 씀, 서버 값이 새로 오면 손대지 않은 칸만 따라감
import { useEffect, useRef, useState } from "react"

import { SKIN_CARD_WEAR_PREVIEW_MODE_SKIN } from "../../constants/skinCardWear/skinCardWearLayout.js"
import { resolveInitialSkinSelection } from "../../utils/skinCardWear/wearSelection.js"
import { syncDraftSkins, syncSelectedId } from "../../utils/skinCardWear/wearDraftSync.js"

// 상태·setter와 손댄 칸 기록(edited)을 함께 돌려줌
export function useWearDraft(initialSkinsByJob, initialCardFrameId) {
  const [activeJobIndex, setActiveJobIndex] = useState(0)
  const [selectedItemId, setSelectedItemId] = useState(() =>
    resolveInitialSkinSelection(initialSkinsByJob),
  )
  const [previewMode, setPreviewMode] = useState(SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
  const [draftSkinsByJob, setDraftSkinsByJob] = useState(initialSkinsByJob)
  const [draftCardFrameId, setDraftCardFrameId] = useState(initialCardFrameId)
  const edited = useRef(new Set())

  useEffect(() => {
    setDraftSkinsByJob((previous) => syncDraftSkins(previous, initialSkinsByJob, edited.current))
    if (!edited.current.has("card")) setDraftCardFrameId(initialCardFrameId)
    setSelectedItemId((previous) => syncSelectedId(previous, initialSkinsByJob, initialCardFrameId, edited.current))
  }, [initialSkinsByJob, initialCardFrameId])

  return {
    activeJobIndex, setActiveJobIndex,
    selectedItemId, setSelectedItemId,
    previewMode, setPreviewMode,
    draftSkinsByJob, setDraftSkinsByJob,
    draftCardFrameId, setDraftCardFrameId,
    edited,
  }
}
