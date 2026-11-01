// 프로필 편집 탭 (프로필 수정·테두리 수정, 켜진 탭은 구매 버튼 그림)
// ProfileEditSheet가 씀
import {
  PROFILE_EDIT_TABS,
  TAB_BTN_LABEL_CLASS,
  TAB_BTN_LABEL_INACTIVE_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 탭 버튼: 데스크톱 최대 폭(9.5rem), 위 줄에 들어가게 남는 폭을 나눠 가짐, 높이 44px
const BTN_CLASS =
  "relative h-11 min-w-0 max-w-[9.5rem] flex-1 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:opacity-90"

// 그림 비율(215x65)이 버튼 칸과 거의 같아 칸에 맞춰 깖
const IMG_CLASS = "absolute inset-0 block h-full w-full select-none object-fill"

// 데스크톱 ProfileEditTabs와 같은 그림·글자 모양
export default function Tabs({ activeTab, onTabChange }) {
  return (
    <div role="tablist" aria-label="프로필 수정 옵션" className="flex w-full min-w-0 items-center justify-center gap-1.5">
      {PROFILE_EDIT_TABS.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={BTN_CLASS}
            style={{ outline: "none" }}
          >
            <PublicAsset src={isActive ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton} alt="" className={IMG_CLASS} />
            <span className={isActive ? TAB_BTN_LABEL_CLASS : TAB_BTN_LABEL_INACTIVE_CLASS}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
