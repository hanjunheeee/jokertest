import { STORE_ASSETS } from "@/domains/store/constants/storeAssets.js"
import {
  PROFILE_EDIT_TAB_BTN_CLASS,
  PROFILE_EDIT_TAB_BTN_IMAGE_CLASS,
  PROFILE_EDIT_TAB_BTN_LABEL_CLASS,
  PROFILE_EDIT_TAB_BTN_LABEL_INACTIVE_CLASS,
  PROFILE_EDIT_TABS,
  PROFILE_EDIT_TABS_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

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
            className={PROFILE_EDIT_TAB_BTN_CLASS}
            style={{ outline: "none" }}
            onClick={() => onTabChange(tab.id)}
          >
            <PublicAsset
              src={isActive ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
              alt=""
              className={PROFILE_EDIT_TAB_BTN_IMAGE_CLASS}
            />
            <span className={isActive ? PROFILE_EDIT_TAB_BTN_LABEL_CLASS : PROFILE_EDIT_TAB_BTN_LABEL_INACTIVE_CLASS}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
