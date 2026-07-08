/**
 * 친구 목록 패널 상단 탭 — 친구 추가 / 요청 수락
 * 검색바 위 헤더 영역에 배치, 활성 탭은 버튼(수락 및 긍정), 비활성은 버튼(미선택)
 */
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const TAB_LIST_CLASS =
  "mb-3 flex shrink-0 items-stretch gap-[clamp(0.25rem,0.55vw,0.4rem)]"

const TAB_BTN_CLASS =
  "interactive-scale relative flex-1 overflow-hidden border-0 bg-transparent p-0 leading-none"

const TAB_BTN_IMG_CLASS =
  "block h-[clamp(1.48rem,2.15vw,1.78rem)] w-full select-none object-fill object-center"

const TAB_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.68rem,0.95vw,0.82rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

function FriendListTabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={TAB_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={
          active
            ? FRIEND_LIST_ASSETS.tabButtonActive
            : FRIEND_LIST_ASSETS.tabButtonInactive
        }
        alt=""
        className={TAB_BTN_IMG_CLASS}
      />
      <span
        className={`${TAB_BTN_LABEL_CLASS} ${
          active ? "text-[#e8f0dc]" : "text-[#ebe2cc]/90"
        }`}
        aria-hidden="true"
      >
        {label}
      </span>
    </button>
  )
}

/** @param {"list"|"request"|"accept"} activeView */
export default function FriendListViewTabs({
  activeView,
  onRequestClick,
  onAcceptClick,
}) {
  return (
    <div className={TAB_LIST_CLASS} role="tablist" aria-label="친구 목록 탭">
      <FriendListTabButton
        label="친구 추가"
        active={activeView === "request"}
        onClick={onRequestClick}
      />
      <FriendListTabButton
        label="요청 수락"
        active={activeView === "accept"}
        onClick={onAcceptClick}
      />
    </div>
  )
}
