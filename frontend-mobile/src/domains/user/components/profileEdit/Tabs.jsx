// 프로필 편집 탭 (프로필 수정·테두리 수정, 켜진 탭은 긍정 버튼 그림)
// ProfileEditSheet가 씀
import { PROFILE_EDIT_TABS } from "@/domains/user/constants/profileEditLayout.js"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 시트 위 줄 안에 들어가게 두 탭이 남는 폭을 나눠 가짐
export default function Tabs({ activeTab, onTabChange }) {
  return (
    <div role="tablist" aria-label="프로필 수정 옵션" className="flex w-full min-w-0 items-center gap-1.5">
      {PROFILE_EDIT_TABS.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className="relative h-11 min-w-0 max-w-[9.5rem] flex-1 border-0 bg-transparent p-0 leading-none active:scale-95"
          >
            <PublicAsset
              src={isActive ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
              alt=""
              className="absolute inset-0 block h-full w-full select-none object-fill"
            />
            <span
              className={`absolute inset-0 flex items-center justify-center font-subheading text-sm font-bold ${
                isActive
                  ? "text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
                  : "text-[#5c554d] [text-shadow:0_1px_1px_rgba(245,240,230,0.35)]"
              }`}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
