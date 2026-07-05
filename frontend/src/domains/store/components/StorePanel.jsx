/**
 * 상점 메인 패널.
 *
 * 현재 선택된 상점 탭에 맞는 상품/콘텐츠 영역을 렌더링합니다.
 */
import { useState } from "react"
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import StoreSidebar from "@/domains/store/components/StoreSidebar.jsx"
import {
  getStoreDummyItemInfo,
  STORE_ASSETS,
  STORE_GRID_ITEMS,
  STORE_TABS,
} from "../constants/storeAssets.js"

const PANEL_CLASS =
  "absolute left-1/2 top-[48%] z-20 w-[min(70rem,95vw)] -translate-x-1/2 -translate-y-1/2"

const INNER_PAD = {
  paddingTop: "9.5%",
  paddingBottom: "8.5%",
  paddingLeft: "8.5%",
  paddingRight: "8.5%",
}

const TAB_BTN_CLASS =
  "relative min-w-[clamp(5.2rem,10vw,7rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.12rem,1.6vw,1.35rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const PURCHASE_BTN_CLASS =
  "relative w-[clamp(6.75rem,12.5vw,9.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

const PURCHASE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.88rem,1.2vw,1.02rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 상단 탭 버튼 — active 여부에 따라 이미지와 aria-pressed가 전환됩니다. */
// tab: { id, label } 형태의 탭 정보
// active: 이 탭이 현재 선택된 탭인지 여부
// onSelect: 탭 클릭 시 호출할 콜백. 부모(StorePanel)가 activeTab을 바꾸는 setActiveTab을 넘겨줌
function StoreTab({ tab, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={TAB_BTN_CLASS}
      style={{ outline: "none" }}
      aria-pressed={active}
      aria-label={tab.label}
    >
      <PublicAsset
        src={active ? SETTING_ASSETS.tabActive : SETTING_ASSETS.tabInactive}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span
        className={`${TAB_LABEL_CLASS} ${active ? "opacity-100" : "opacity-90"}`}
      >
        {tab.label}
      </span>
    </button>
  )
}

/** 그리드 상품 슬롯 — 아이콘 + 이름/한줄설명, 선택 시 강조 표시 */
// icon/name/tagline: 그리드에 표시할 상품 정보 (STORE_GRID_ITEMS 항목에서 옴)
// selected: 이 아이템이 현재 선택된 상태인지 여부
// onSelect: 클릭 시 호출할 콜백. 부모가 selectedItem을 이 아이템으로 바꾸는 함수를 넘겨줌
function StoreItemSlot({ icon, name, tagline, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-0 w-full cursor-pointer flex-col items-center justify-center overflow-visible border-0 bg-transparent p-0 transition-opacity ${
        selected ? "opacity-100" : "opacity-80 hover:opacity-95"
      }`}
      style={{ outline: "none" }}
      aria-pressed={selected}
    >
      <PublicAsset
        src={icon}
        alt=""
        className={`block h-auto w-[min(100%,clamp(7.75rem,12.5vw,11.25rem))] select-none object-contain ${
          selected ? "drop-shadow-[0_0_10px_rgba(196,165,116,0.55)]" : ""
        }`}
      />
      <div className="mt-[clamp(0.1rem,0.35vh,0.2rem)] w-full px-1 text-center font-subheading">
        <p className="line-clamp-1 text-[clamp(0.9rem,1.2vw,1.05rem)] font-bold leading-snug text-[#140c08]">
          {name}
        </p>
        <p className="line-clamp-1 text-[clamp(0.75rem,1vw,0.88rem)] leading-snug text-[#2a1810]/75">
          {tagline}
        </p>
      </div>
    </button>
  )
}

/** 선택한 아이템 상세 영역의 구매 버튼 (기능 미구현 — 버튼 이미지 위 텍스트 오버레이) */
function StorePurchaseButton() {
  return (
    <button
      type="button"
      className={PURCHASE_BTN_CLASS}
      style={{ outline: "none" }}
      aria-label="구매"
    >
      <PublicAsset
        src={STORE_ASSETS.purchaseButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={PURCHASE_LABEL_CLASS}>구매</span>
    </button>
  )
}

/** 선택된 그리드 아이템의 상세 정보(이름/등급/설명/가격)와 구매 버튼을 표시 */
// item: 현재 선택된 그리드 아이템 (StorePanel의 selectedItem state를 그대로 전달받음)
function SelectedItemDetail({ item }) {
  // item.id로 더미 상세 정보(이름/등급/설명/가격 등)를 조회
  const info = getStoreDummyItemInfo(item.id)

  return (
    <section
      className="mt-auto mb-[clamp(1.1rem,2.4vh,1.65rem)] shrink-0 rounded-md bg-[#1a0f0a]/22 px-[clamp(0.45rem,0.9vw,0.65rem)] pt-[clamp(0.55rem,1.1vh,0.75rem)] pb-[clamp(0.45rem,0.95vh,0.6rem)] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.10),_0_6px_18px_rgba(0,0,0,0.16)]"
      aria-label="선택한 아이템 정보"
    >
      <div className="flex gap-[clamp(0.55rem,1.1vw,0.85rem)]">
        <PublicAsset
          src={item.icon}
          alt=""
          className="block w-[clamp(4.5rem,8vw,6rem)] shrink-0 select-none object-contain"
        />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[clamp(0.2rem,0.45vh,0.3rem)] font-subheading">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-[clamp(1.05rem,1.55vw,1.25rem)] font-bold leading-tight text-[#140c08]">
              {info.name}
            </h2>
            {info.tag ? (
              <span className="rounded-sm bg-[#2a1810]/18 px-1.5 py-0.5 text-[clamp(0.65rem,0.9vw,0.75rem)] font-bold text-[#6b3a28]">
                {info.tag}
              </span>
            ) : null}
          </div>

          <p className="text-[clamp(0.78rem,1.05vw,0.9rem)] font-bold text-[#6b4a32]">
            {info.category}
            <span className="mx-1.5 text-[#8b7355]/70">·</span>
            {info.grade}
          </p>

          <p className="line-clamp-2 text-[clamp(0.78rem,1.05vw,0.9rem)] leading-snug text-[#2a1810]/85">
            {info.description}
          </p>

          <div className="mt-[clamp(0.15rem,0.4vh,0.25rem)] flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-[clamp(0.35rem,0.65vw,0.5rem)]">
              <span className="text-[clamp(0.88rem,1.15vw,1rem)] font-bold text-[#3d1810]">
                구매 가격
              </span>
              <PublicAsset
                src={STORE_ASSETS.currencyIcon}
                alt=""
                className="block h-[clamp(1.15rem,1.9vw,1.45rem)] w-auto shrink-0 select-none object-contain"
              />
              <span className="text-[clamp(0.95rem,1.25vw,1.08rem)] font-bold tabular-nums text-[#6b2e18]">
                {info.priceAmount}
              </span>
            </div>

            <StorePurchaseButton />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function StorePanel() {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // 값을 바꾸는 함수를 호출하면 이 컴포넌트가 다시 렌더링되어 화면이 최신 상태로 갱신됩니다.

  // activeTab: 현재 선택된 상단 탭의 id. 초기값은 첫 번째 탭("skin")
  const [activeTab, setActiveTab] = useState(STORE_TABS[0].id)
  // selectedItem: 그리드에서 현재 선택된 아이템 객체. 초기값은 첫 번째 아이템
  const [selectedItem, setSelectedItem] = useState(STORE_GRID_ITEMS[0])

  return (
    <div className={PANEL_CLASS}>
      <div className="relative w-full">
        <PublicAsset
          src={STORE_ASSETS.panelFrame}
          alt=""
          className="pointer-events-none block h-auto w-full select-none"
        />

        <div className="absolute inset-0 flex flex-col" style={INNER_PAD}>
          <nav
            className="translate-y-[clamp(0.35rem,0.95vh,0.6rem)] mb-[clamp(0.25rem,0.7vh,0.45rem)] flex shrink-0 justify-center gap-[clamp(1.1rem,2.2vw,1.65rem)]"
            aria-label="상점 탭"
          >
            {STORE_TABS.map((tab) => (
              <StoreTab
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onSelect={setActiveTab}
              />
            ))}
          </nav>

          <div className="flex min-h-0 flex-1 gap-[clamp(0.55rem,1.15vw,0.9rem)]">
            <div className="flex min-h-0 min-w-0 flex-[1.58] flex-col">
              <div className="mt-[clamp(0.25rem,0.75vh,0.5rem)] grid shrink-0 grid-cols-4 gap-[clamp(0.25rem,0.55vw,0.4rem)]">
                {STORE_GRID_ITEMS.map((item) => (
                  <StoreItemSlot
                    key={item.id}
                    icon={item.icon}
                    name={item.name}
                    tagline={item.tagline}
                    selected={selectedItem.id === item.id}
                    onSelect={() => setSelectedItem(item)}
                  />
                ))}
              </div>

              <SelectedItemDetail item={selectedItem} />
            </div>

            <aside className="w-[26%] min-w-[9.25rem] shrink-0 pl-[clamp(0.9rem,1.4vw,1.1rem)]">
              <StoreSidebar />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
