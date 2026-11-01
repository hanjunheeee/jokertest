// 프로필 편집 창 탭 (프로필 수정·테두리 수정)
// ProfileEditPanel이 씀
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  TAB_BTN_CLASS,
  TAB_BTN_IMG_CLASS,
  TAB_BTN_LABEL_CLASS,
  TAB_BTN_LABEL_INACTIVE_CLASS,
  PROFILE_EDIT_TABS,
  PROFILE_EDIT_TABS_CLASS,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 켜진 탭은 구매 버튼 그림, 꺼진 탭은 흐린 버튼 그림
export default function ProfileEditTabs({ activeTab, onTabChange }) {
  return (
    <div className={PROFILE_EDIT_TABS_CLASS} role="tablist" aria-label="프로필 수정 옵션">
      {PROFILE_EDIT_TABS.map((tab) => {
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={TAB_BTN_CLASS}
            style={{ outline: "none" }}
            onClick={() => onTabChange(tab.id)}
          >
            <PublicAsset
              src={isActive ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
              alt=""
              className={TAB_BTN_IMG_CLASS}
            />
            <span className={isActive ? TAB_BTN_LABEL_CLASS : TAB_BTN_LABEL_INACTIVE_CLASS}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
