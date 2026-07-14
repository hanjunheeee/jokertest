import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { MY_PAGE_SUMMARY_PANEL_CLASS } from "@/domains/user/constants/myPageLayoutStyle.js"
import BloodRecordFrame from "@/domains/user/components/BloodRecordFrame.jsx"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"
import AccountManageButton from "@/domains/user/components/MyPageLayout/AccountManageButton.jsx"

export default function MyPageSummaryPanel({ profile, stats, onAccountClick }) {
  return (
    <div className={MY_PAGE_SUMMARY_PANEL_CLASS}>
      {/* 명성 배너입니다. profile 정보가 배너 안의 텍스트로 들어갑니다. */}
      <MyPageBannerButton showText profile={profile} bannerSrc={MY_PAGE_ASSETS.reputationBanner} />

      {/* 피의 기록 프레임입니다. 전체 판수, 생존 횟수 같은 stats가 들어갑니다. */}
      <BloodRecordFrame stats={stats} />

      {/* 계정 관리 페이지로 이동하는 버튼입니다. */}
      <AccountManageButton onClick={onAccountClick} />
    </div>
  )
}
