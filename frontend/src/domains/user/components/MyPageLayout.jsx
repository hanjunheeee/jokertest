import { motion } from "framer-motion"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import FateMaskFooter from "./FateMaskFooter.jsx"
import AccountManageButton from "./MyPageLayout/AccountManageButton.jsx"
import EmoticonEntryButton from "./MyPageLayout/EmoticonEntryButton.jsx"
import MyPageSummaryPanel from "./MyPageLayout/MyPageSummaryPanel.jsx"
import ProfileEditButton from "./MyPageLayout/ProfileEditButton.jsx"
import SkinCardWearButton from "./MyPageLayout/SkinCardWearButton.jsx"
import MyPageBannerButton from "./MyPageBannerButton.jsx"
import ProfileEditOverlay from "./profileEdit/ProfileEditOverlay.jsx"
import SkinCardWearOverlay from "./skinCardWear/SkinCardWearOverlay.jsx"
import { MY_PAGE_PROFILE_BANNER_DEFAULTS } from "../constants/myPageAssets.js"
import {
  ACTION_BTNS_WRAP_CLASS,
  BANNER_WRAP_CLASS,
  CENTER_STACK_CLASS,
  MY_PAGE_MAIN_CLASS,
  MY_PAGE_ROOT_CLASS,
  MY_PAGE_UI_FADE,
} from "../constants/myPageLayoutStyle.js"
import { useMyProfile } from "../../../shared/hooks/useMyProfile.js"

export default function MyPageLayout() {
  const navigate = useNavigate()
  const { profile, stats, description, loading, isStale, error, retry } = useMyProfile()
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [skinCardWearOpen, setSkinCardWearOpen] = useState(false)

  const goToAccount = () => navigate("/account")

  return (
    <div className={MY_PAGE_ROOT_CLASS}>
      <div className={ACTION_BTNS_WRAP_CLASS}>
        <AccountManageButton onClick={goToAccount} />
        <ProfileEditButton onClick={() => setProfileEditOpen(true)} />
        <SkinCardWearButton onClick={() => setSkinCardWearOpen(true)} />
        <EmoticonEntryButton />
      </div>

      {isStale || (!loading && !profile) ? (
        <div role="status" className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/70 px-4 py-2 text-[#f5f0e6]">
          <span>
            {!profile
              ? "전적을 불러오지 못했습니다."
              : error
                ? "최신 전적을 불러오지 못했습니다. 아래 값은 갱신 전 값일 수 있습니다."
                : "전적이 갱신되었습니다. 최신 값을 불러오는 중입니다."}
          </span>
          <button
            type="button"
            onClick={() => retry?.()}
            aria-label="전적 다시 불러오기"
            className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-2 py-1 font-bold"
          >
            다시 불러오기
          </button>
        </div>
      ) : null}

      <ProfileEditOverlay open={profileEditOpen} onClose={() => setProfileEditOpen(false)} />
      <SkinCardWearOverlay open={skinCardWearOpen} onClose={() => setSkinCardWearOpen(false)} />

      {!loading && profile ? (
        <div className={BANNER_WRAP_CLASS}>
          <MyPageBannerButton {...MY_PAGE_PROFILE_BANNER_DEFAULTS} profile={profile} />
        </div>
      ) : null}

      <motion.main
        className={MY_PAGE_MAIN_CLASS}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={MY_PAGE_UI_FADE}
      >
        {!loading && profile ? (
          <div className={CENTER_STACK_CLASS}>
            {description ? <FateMaskFooter description={description} /> : null}
            <MyPageSummaryPanel stats={stats} />
          </div>
        ) : null}
      </motion.main>
    </div>
  )
}
