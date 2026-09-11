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
  MY_PAGE_ACTION_BUTTONS_WRAP_CLASS,
  MY_PAGE_BANNER_WRAP_CLASS,
  MY_PAGE_CENTER_STACK_CLASS,
  MY_PAGE_MAIN_CLASS,
  MY_PAGE_ROOT_CLASS,
  MY_PAGE_UI_FADE,
} from "../constants/myPageLayoutStyle.js"
import { useMyProfile } from "../hooks/useMyProfile.js"

// 마이페이지의 전체 화면 구성을 담당합니다.
// 프로필 조회는 여기서 하고, 실제 화면 조각은 하위 컴포넌트에 맡깁니다.
export default function MyPageLayout() {
  const navigate = useNavigate()
  const { profile, stats, description, loading } = useMyProfile()
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [skinCardWearOpen, setSkinCardWearOpen] = useState(false)

  const goToAccount = () => navigate("/account")

  return (
    <div className={MY_PAGE_ROOT_CLASS}>
      <div className={MY_PAGE_ACTION_BUTTONS_WRAP_CLASS}>
        <AccountManageButton onClick={goToAccount} />
        <ProfileEditButton onClick={() => setProfileEditOpen(true)} />
        <SkinCardWearButton onClick={() => setSkinCardWearOpen(true)} />
        {/* F-13 AC-06: 진입 버튼만 추가한다 — onOpenEmoticons를 넘기지 않아 클릭해도
            아무 탭·모달도 열리지 않는 미연결 상태를 유지한다. */}
        <EmoticonEntryButton />
      </div>

      <ProfileEditOverlay open={profileEditOpen} onClose={() => setProfileEditOpen(false)} />
      <SkinCardWearOverlay open={skinCardWearOpen} onClose={() => setSkinCardWearOpen(false)} />

      {!loading && profile ? (
        <div className={MY_PAGE_BANNER_WRAP_CLASS}>
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
          <div className={MY_PAGE_CENTER_STACK_CLASS}>
            {description ? <FateMaskFooter description={description} /> : null}
            <MyPageSummaryPanel stats={stats} />
          </div>
        ) : null}
      </motion.main>
    </div>
  )
}
