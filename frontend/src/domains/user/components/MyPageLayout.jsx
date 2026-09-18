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
  const { profile, stats, description, loading, isStale, error, retry } = useMyProfile()
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

      {/*
        F-21(A-10): 서버가 전적 커밋을 알려왔는데 아직 최신 값을 받지 못했거나(재조회 실패),
        조회 자체가 실패해 보여줄 값이 없는 상태다. 여기서 **추측한 숫자를 보여주지 않는다** —
        지금 화면의 값이 낡았다는 사실과 다시 읽는 경로만 제공한다.
      */}
      {isStale || (!loading && !profile) ? (
        <div role="status" className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/70 px-4 py-2 text-[#f5f0e6]">
          <span>
            {!profile
              ? "전적을 불러오지 못했습니다."
              // 조회가 실패한 것과 아직 못 받은 것은 사용자가 할 일이 다르다 — 실패는 다시
              // 읽어야 하고, 지연은 기다리면 된다. 두 경우를 같은 문장으로 말하지 않는다.
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
