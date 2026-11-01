// 이모티콘 팔레트 화면 상태와 동작 (팔레트 불러오기·검색/등급 거르기·저장·취소 안내)
// EmoticonPalettePage가 씀
import { useEffect, useMemo, useState } from "react"
import { useEmojiPaletteStore } from "@/domains/user/store/emojiPalette.store.js"
import { SAVE_FAILURE_MESSAGES } from "@/domains/user/constants/emoticonPaletteText.js"
import { filterEmoticons } from "@/domains/user/utils/emoticonPalette/items.js"

export function useEmoticonPalettePage() {
  const status = useEmojiPaletteStore((state) => state.status)
  const owned = useEmojiPaletteStore((state) => state.owned)
  const selectedSlots = useEmojiPaletteStore((state) => state.selectedSlots)
  const selectedSlotIndex = useEmojiPaletteStore((state) => state.selectedSlotIndex)
  const conflict = useEmojiPaletteStore((state) => state.conflict)
  const load = useEmojiPaletteStore((state) => state.load)
  const selectSlot = useEmojiPaletteStore((state) => state.selectSlot)
  const assignItem = useEmojiPaletteStore((state) => state.assignItem)
  const save = useEmojiPaletteStore((state) => state.save)
  const cancel = useEmojiPaletteStore((state) => state.cancel)

  const [query, setQuery] = useState("")
  const [gradeFilter, setGradeFilter] = useState("전체")
  const [saving, setSaving] = useState(false)
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    load()
  }, [load])

  const isReady = status === "ready"

  const ownedIdSet = useMemo(() => new Set(owned), [owned])

  const visibleItems = useMemo(() => filterEmoticons(gradeFilter, query), [gradeFilter, query])

  // 버전 충돌은 스토어가 충돌 안내를 띄우므로 따로 문구를 안 냄
  const handleSave = async () => {
    setSaving(true)
    setNotice(null)
    setSaveSuccessOpen(false)
    const result = await save()
    setSaving(false)

    if (result.ok) {
      setSaveSuccessOpen(true)
      return
    }
    if (result.code === "REVISION_MISMATCH") {
      return
    }
    setNotice({
      type: "error",
      text: SAVE_FAILURE_MESSAGES[result.code] ?? "팔레트를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    })
  }

  const handleCancel = () => {
    setNotice(null)
    setSaveSuccessOpen(false)
    cancel()
  }

  return {
    status, isReady, conflict, notice, load,
    query, setQuery, gradeFilter, setGradeFilter, visibleItems, ownedIdSet, assignItem,
    selectedSlots, selectedSlotIndex, selectSlot,
    saving, handleSave, handleCancel, saveSuccessOpen, setSaveSuccessOpen,
  }
}
