// 스킨·카드 착용 시트 열림 수명 관리 (열 때 초안 다시 시작·지갑 받기·적용 뒤 닫기)
// WearSheet가 씀, 데스크톱 SkinCardWearOverlay 안에 있던 수명 로직을 화면 없이 옮김
import { useEffect, useRef } from "react"
import { useSkinCardWearSelection } from "@/domains/user/hooks/useSkinCardWearSelection.js"
import { useSkinCardWearStore } from "@/domains/user/store/skinCardWear.store.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 지금 스토어 장착값 (초안 다시 시작용)
const appliedNow = () => ({
  skinsByJob: useSkinCardWearStore.getState().skinsByJob,
  cardFrameId: useSkinCardWearStore.getState().cardFrameId,
})

// 열고 닫을 때마다 lifecycle 번호를 올려 닫힌 뒤 늦게 온 결과를 버림
export function useWearSheet({ open, onClose }) {
  const lifecycle = useRef(0)
  const dirty = useRef(false)
  const onCloseRef = useRef(onClose)
  const appliedSkinsByJob = useSkinCardWearStore((state) => state.skinsByJob)
  const appliedCardFrameId = useSkinCardWearStore((state) => state.cardFrameId)
  const fetchSummary = useEconomyStore((state) => state.fetchSummary)
  const requestGeneration = useEconomyStore((state) => state.requestGeneration)

  const selection = useSkinCardWearSelection({
    initialSkinsByJob: appliedSkinsByJob,
    initialCardFrameId: appliedCardFrameId,
  })
  const { resetDraft, selectItem, confirmLoadout } = selection

  // 늘 최신 닫기 함수
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // 열림: 초안 다시 시작 → 지갑 받기 → 그사이 안 고쳤으면 받은 값으로 한 번 더 맞춤
  useEffect(() => {
    const epoch = ++lifecycle.current
    if (!open) return undefined
    dirty.current = false
    resetDraft(appliedNow())
    fetchSummary().then((result) => {
      if (epoch !== lifecycle.current || dirty.current || !result?.ok) return
      resetDraft(appliedNow())
    })
    return () => {
      lifecycle.current += 1
    }
  }, [open, requestGeneration, resetDraft, fetchSummary])

  // 고르면 고친 걸로 기록 (지갑 응답이 초안을 덮지 않게)
  const handleSelectItem = (item) => {
    dirty.current = true
    selectItem(item)
  }

  // 적용: 바뀐 칸 있으면 확인 소리, 저장 성공하고 그사이 안 닫혔으면 닫음
  const handleConfirm = async () => {
    const epoch = lifecycle.current
    dirty.current = true
    const result = await confirmLoadout({
      appliedSkinsByJob,
      appliedCardFrameId,
      onChanged: () => dispatchUiSfx("ui-confirm"),
      isActive: () => epoch === lifecycle.current,
    })
    if (result.ok && epoch === lifecycle.current) onCloseRef.current()
  }

  return { ...selection, appliedSkinsByJob, appliedCardFrameId, handleSelectItem, handleConfirm }
}
