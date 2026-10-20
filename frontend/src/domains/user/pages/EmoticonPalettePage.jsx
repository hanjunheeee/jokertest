import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"

import EmoticonGradeFilter from "@/domains/user/components/emoticonPalette/EmoticonGradeFilter.jsx"
import EmoticonInventoryGrid from "@/domains/user/components/emoticonPalette/EmoticonInventoryGrid.jsx"
import EmoticonPaletteImageButton from "@/domains/user/components/emoticonPalette/EmoticonPaletteImageButton.jsx"
import EmoticonPaletteSaveSuccessModal from "@/domains/user/components/emoticonPalette/EmoticonPaletteSaveSuccessModal.jsx"
import EmoticonPaletteWheel from "@/domains/user/components/emoticonPalette/EmoticonPaletteWheel.jsx"
import EmoticonSearchInput from "@/domains/user/components/emoticonPalette/EmoticonSearchInput.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  EMOTICON_PALETTE_ACTION_ROW_CLASS,
  EMOTICON_PALETTE_BODY_CLASS,
  EMOTICON_PALETTE_CONFLICT_CLASS,
  EMOTICON_PALETTE_CONTENT_CLASS,
  EMOTICON_PALETTE_ERROR_ROW_CLASS,
  EMOTICON_PALETTE_INVENTORY_SECTION_CLASS,
  EMOTICON_PALETTE_MAIN_CLASS,
  EMOTICON_PALETTE_NOTICE_ERROR_CLASS,
  EMOTICON_PALETTE_RETRY_BTN_CLASS,
  EMOTICON_PALETTE_ROOT_CLASS,
  EMOTICON_PALETTE_STATUS_CLASS,
  EMOTICON_PALETTE_STATUS_WRAP_CLASS,
  EMOTICON_PALETTE_TOOLBAR_CLASS,
  EMOTICON_PALETTE_UI_FADE,
  EMOTICON_PALETTE_WHEEL_SECTION_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { useEmojiPaletteStore } from "@/domains/user/store/emojiPalette.store.js"
import { EMOTICON_STORE_ITEMS, getStoreItemById } from "@/domains/store/constants/storeItems.js"
// F-33 E-2(설계도 §2-2): 마이페이지 이모티콘 관리 화면. 왼쪽은 보유 목록(검색 + 등급
// 드롭다운 + 3열 플레이트 격자), 오른쪽은 8칸 방사형 팔레트, 아래는 저장/취소다.
//
// 편집 상태는 이 화면이 아니라 emojiPalette.store.js가 소유한다 — 저장이 409로 거부되면
// store가 서버의 현재 값으로 slots·selectedSlots를 함께 갱신하는데, 화면이 별도 useState로
// 편집 값을 들고 있으면 그 갱신이 화면에 반영되지 않아 둘이 어긋난다.

const EMOTICON_CATEGORY = "이모티콘"
const GRADE_FILTERS = ["전체", "기본", "상점"]

const SAVE_FAILURE_MESSAGES = {
  INVALID_SLOTS: "팔레트 구성이 올바르지 않습니다. 같은 이모티콘을 두 칸에 넣을 수 없습니다.",
  NOT_OWNED: "보유하지 않은 이모티콘이 포함되어 있습니다. 목록을 다시 불러온 뒤 시도해 주세요.",
  NOT_READY: "팔레트를 아직 불러오지 못했습니다.",
}

/** itemId를 상점 카탈로그의 이모티콘 항목으로 바꾼다. */
const emoticonItemOf = (itemId) => {
  if (typeof itemId !== "string" || itemId.length === 0) return null
  const item = getStoreItemById(itemId)
  if (!item || item.category !== EMOTICON_CATEGORY) return null
  return item
}

export default function EmoticonPalettePage() {
  const navigate = useNavigate()

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

  const visibleItems = useMemo(() => {
    const keyword = query.trim()
    return EMOTICON_STORE_ITEMS.filter((item) => {
      if (gradeFilter !== "전체" && item.grade !== gradeFilter) return false
      if (keyword.length > 0 && !item.name.includes(keyword)) return false
      return true
    })
  }, [gradeFilter, query])

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

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <UserPageBackground />

      <div className={EMOTICON_PALETTE_ROOT_CLASS}>
        <motion.main
          className={EMOTICON_PALETTE_MAIN_CLASS}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={EMOTICON_PALETTE_UI_FADE}
        >
          <div className={EMOTICON_PALETTE_CONTENT_CLASS}>
            <div className={EMOTICON_PALETTE_STATUS_WRAP_CLASS}>
              {status === "loading" ? (
                <p role="status" className={EMOTICON_PALETTE_STATUS_CLASS}>
                  이모티콘 팔레트를 불러오는 중입니다.
                </p>
              ) : null}

              {status === "error" ? (
                <div role="alert" className={EMOTICON_PALETTE_ERROR_ROW_CLASS}>
                  <span className={EMOTICON_PALETTE_STATUS_CLASS}>
                    이모티콘 팔레트를 불러오지 못했습니다.
                  </span>
                  <button
                    type="button"
                    onClick={() => load()}
                    className={EMOTICON_PALETTE_RETRY_BTN_CLASS}
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}

              {conflict ? (
                <p role="status" className={`${EMOTICON_PALETTE_STATUS_CLASS} ${EMOTICON_PALETTE_CONFLICT_CLASS}`}>
                  팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.
                </p>
              ) : null}

              {notice ? (
                <p role="alert" className={`${EMOTICON_PALETTE_STATUS_CLASS} ${EMOTICON_PALETTE_NOTICE_ERROR_CLASS}`}>
                  {notice.text}
                </p>
              ) : null}
            </div>

            <div className={EMOTICON_PALETTE_BODY_CLASS}>
              <section aria-label="보유 이모티콘" className={EMOTICON_PALETTE_INVENTORY_SECTION_CLASS}>
                <div className={EMOTICON_PALETTE_TOOLBAR_CLASS}>
                  <EmoticonSearchInput
                    value={query}
                    disabled={!isReady}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <EmoticonGradeFilter
                    value={gradeFilter}
                    disabled={!isReady}
                    options={GRADE_FILTERS}
                    onChange={(event) => setGradeFilter(event.target.value)}
                  />
                </div>

                <EmoticonInventoryGrid
                  items={visibleItems}
                  ownedIds={ownedIdSet}
                  disabled={!isReady}
                  onAssign={assignItem}
                />
              </section>

              <section aria-label="이모티콘 팔레트" className={EMOTICON_PALETTE_WHEEL_SECTION_CLASS}>
                <EmoticonPaletteWheel
                  slots={selectedSlots}
                  selectedSlotIndex={selectedSlotIndex}
                  disabled={!isReady}
                  resolveItem={emoticonItemOf}
                  onSelectSlot={selectSlot}
                />

                <div className={EMOTICON_PALETTE_ACTION_ROW_CLASS}>
                  <EmoticonPaletteImageButton
                    label="저장"
                    src={EMOTICON_PALETTE_ASSETS.saveButton}
                    disabled={!isReady || saving}
                    onClick={handleSave}
                  />
                  <EmoticonPaletteImageButton
                    label="취소"
                    src={EMOTICON_PALETTE_ASSETS.cancelButton}
                    disabled={!isReady || saving}
                    onClick={handleCancel}
                  />
                </div>
              </section>
            </div>
          </div>
        </motion.main>
      </div>

      <UserPageChrome onBack={() => navigate("/mypage")} />

      <EmoticonPaletteSaveSuccessModal
        open={saveSuccessOpen}
        onDismiss={() => setSaveSuccessOpen(false)}
      />
    </div>
  )
}
