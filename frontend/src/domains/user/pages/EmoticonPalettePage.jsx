import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import PublicAsset from "../../../shared/ui/PublicAsset.jsx"
import { getStoreItemById } from "../../store/constants/storeItems.js"
import { useEmojiPaletteStore } from "../store/emojiPalette.store.js"

// F-33 E-2(설계도 §2-2): 마이페이지 이모티콘 관리 화면. 왼쪽은 보유 목록(검색 + 등급
// 드롭다운 + 3열 플레이트 격자), 오른쪽은 8칸 방사형 팔레트, 아래는 저장/취소다.
//
// 편집 상태는 이 화면이 아니라 emojiPalette.store.js가 소유한다 — 저장이 409로 거부되면
// store가 서버의 현재 값으로 slots·selectedSlots를 함께 갱신하는데, 화면이 별도 useState로
// 편집 값을 들고 있으면 그 갱신이 화면에 반영되지 않아 둘이 어긋난다.

const EMOTICON_CATEGORY = "이모티콘"
const GRADE_FILTERS = ["전체", "기본", "상점"]

const PALETTE_FRAME_SRC = "/frame/emoji/palette-frame.png"
const PLATE_SRC = "/frame/emoji/plate.png"

// 8칸 방사형 팔레트 위의 칸 중심 좌표(%). palette-frame.png(769×738)의 방사형 배치를 따라
// 12시부터 시계 방향으로 돈다.
const SLOT_POSITIONS = [
  { top: "12%", left: "50%" },
  { top: "23%", left: "77%" },
  { top: "50%", left: "88%" },
  { top: "77%", left: "77%" },
  { top: "88%", left: "50%" },
  { top: "77%", left: "23%" },
  { top: "50%", left: "12%" },
  { top: "23%", left: "23%" },
]

/** itemId를 상점 카탈로그의 이모티콘 항목으로 바꾼다.
 *
 *  getStoreItemById는 등록되지 않은 id에 undefined를 돌려준다 — 서버가 카탈로그에 없는
 *  itemId를 보내오거나(구 버전 데이터), 다른 카테고리의 id가 섞여 들어와도 여기서 걸러
 *  null이 되므로, 호출부가 item.icon에 손대다 예외를 내는 일이 없다. */
const emoticonItemOf = (itemId) => {
  if (typeof itemId !== "string" || itemId.length === 0) return null
  const item = getStoreItemById(itemId)
  if (!item || item.category !== EMOTICON_CATEGORY) return null
  return item
}

const SAVE_FAILURE_MESSAGES = {
  INVALID_SLOTS: "팔레트 구성이 올바르지 않습니다. 같은 이모티콘을 두 칸에 넣을 수 없습니다.",
  NOT_OWNED: "보유하지 않은 이모티콘이 포함되어 있습니다. 목록을 다시 불러온 뒤 시도해 주세요.",
  NOT_READY: "팔레트를 아직 불러오지 못했습니다.",
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
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    // load는 거부를 스스로 잡아 status='error'로 끝낸다 — 여기서 다시 catch하지 않아도
    // 처리되지 않은 rejection이 생기지 않는다.
    load()
  }, [load])

  const isReady = status === "ready"

  // 목록은 "카탈로그 전체"가 아니라 **서버가 알려준 보유 목록**을 순회해 만든다 — 그래서
  // 소유하지 않은 이모티콘은 애초에 여기 들어오지 않는다(AC-12).
  const ownedItems = useMemo(
    () => owned.map(emoticonItemOf).filter((item) => item !== null),
    [owned],
  )

  const visibleItems = useMemo(() => {
    const keyword = query.trim()
    return ownedItems.filter((item) => {
      if (gradeFilter !== "전체" && item.grade !== gradeFilter) return false
      if (keyword.length > 0 && !item.name.includes(keyword)) return false
      return true
    })
  }, [ownedItems, gradeFilter, query])

  const handleSave = async () => {
    setSaving(true)
    setNotice(null)
    const result = await save()
    setSaving(false)

    if (result.ok) {
      setNotice("팔레트를 저장했습니다.")
      return
    }
    if (result.code === "REVISION_MISMATCH") {
      // 서버의 현재 값은 store가 이미 반영했다(아래 conflict 안내가 그 근거를 읽는다).
      return
    }
    setNotice(SAVE_FAILURE_MESSAGES[result.code] ?? "팔레트를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
  }

  const handleCancel = () => {
    setNotice(null)
    cancel()
  }

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col gap-4 px-[clamp(1rem,3cqw,2.5rem)] py-[clamp(1rem,3vh,2rem)] text-[#f5f0e6]">
      <header className="flex shrink-0 items-center justify-between gap-4">
        {/* F-15 AC-02: 명시적 글자 크기는 전부 전역 배율 경로(--app-text-size)를 지난다. */}
        <h1 className="font-subheading app-text-scaled [--app-text-size:clamp(1.1rem,2.2cqw,1.5rem)] font-bold">이모티콘 관리</h1>
        <button
          type="button"
          onClick={() => navigate("/mypage")}
          className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-3 py-1 font-bold"
        >
          마이페이지로
        </button>
      </header>

      {status === "loading" ? (
        <p role="status" className="shrink-0">이모티콘 팔레트를 불러오는 중입니다.</p>
      ) : null}

      {status === "error" ? (
        <div role="alert" className="flex shrink-0 items-center gap-3">
          <span>이모티콘 팔레트를 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={() => load()}
            className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-3 py-1 font-bold"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {conflict ? (
        <p role="status" className="shrink-0 text-[#e8c878]">
          팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.
        </p>
      ) : null}

      {notice ? <p role="status" className="shrink-0">{notice}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        {/* 왼쪽 — 보유 목록 */}
        <section aria-label="보유 이모티콘" className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="search"
              aria-label="이모티콘 검색"
              value={query}
              disabled={!isReady}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이모티콘 이름 검색"
              className="min-w-0 flex-1 rounded border border-[#c9b892]/60 bg-black/40 px-2 py-1"
            />
            <select
              aria-label="이모티콘 등급 필터"
              value={gradeFilter}
              disabled={!isReady}
              onChange={(event) => setGradeFilter(event.target.value)}
              className="rounded border border-[#c9b892]/60 bg-black/40 px-2 py-1"
            >
              {GRADE_FILTERS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </div>

          <ul aria-label="보유 이모티콘 목록" className="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!isReady}
                  onClick={() => assignItem(item.id)}
                  aria-label={`${item.name} 팔레트에 넣기`}
                  className="interactive-scale relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none"
                >
                  <PublicAsset src={PLATE_SRC} alt="" className="block h-auto w-full select-none" />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center p-[18%]">
                    <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 오른쪽 — 8칸 방사형 팔레트 */}
        <section aria-label="이모티콘 팔레트" className="flex shrink-0 flex-col items-center gap-3">
          <div role="group" aria-label="팔레트 슬롯" className="relative w-[min(100%,clamp(16rem,32cqw,24rem))]">
            <PublicAsset src={PALETTE_FRAME_SRC} alt="" className="block h-auto w-full select-none" />
            {selectedSlots.map((slotValue, index) => {
              const item = emoticonItemOf(slotValue)
              const position = SLOT_POSITIONS[index]
              return (
                <button
                  key={`emoji-slot-${index}`}
                  type="button"
                  disabled={!isReady}
                  aria-label={`${index + 1}번 슬롯`}
                  aria-pressed={selectedSlotIndex === index}
                  onClick={() => selectSlot(index)}
                  style={{ top: position.top, left: position.left }}
                  className={`absolute flex h-[20%] w-[20%] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 bg-black/30 p-[2%] ${
                    selectedSlotIndex === index ? "border-[#e8c878]" : "border-transparent"
                  }`}
                >
                  {item
                    ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
                    : <span className="app-text-scaled [--app-text-size:0.7rem] opacity-60">비어 있음</span>}
                </button>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              disabled={!isReady || saving}
              onClick={handleSave}
              className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-4 py-1 font-bold"
            >
              저장
            </button>
            <button
              type="button"
              disabled={!isReady || saving}
              onClick={handleCancel}
              className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-4 py-1 font-bold"
            >
              취소
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
