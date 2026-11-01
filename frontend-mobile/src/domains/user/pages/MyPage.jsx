// 마이페이지 화면 (/mypage: 프로필 띠 · 운명의 가면 · 피의 기록 + 바닥 메뉴 4개)
// app/routes/index.jsx가 씀, 값은 데스크톱 useMyProfile 그대로

import { useNavigate } from "react-router-dom"
import ScreenFrame from "@m/domains/user/components/mypage/ScreenFrame.jsx"
import ProfileCard from "@m/domains/user/components/mypage/ProfileCard.jsx"
import FateMask from "@m/domains/user/components/mypage/FateMask.jsx"
import BloodRecord from "@m/domains/user/components/mypage/BloodRecord.jsx"
import StaleNotice from "@m/domains/user/components/mypage/StaleNotice.jsx"
import MyPageActions from "@m/domains/user/components/mypage/MyPageActions.jsx"
import { MY_PAGE_SHEETS, useMyPageSheet } from "@m/domains/user/hooks/mypage/useMyPageSheet.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { useMyProfile } from "@/shared/hooks/useMyProfile.js"

// 뒤로는 로비로 (데스크톱과 같음)
export default function MyPage() {
    const navigate = useNavigate()
    const { profile, stats, description, loading, isStale, error, retry } = useMyProfile()
    const { openSheet } = useMyPageSheet()

    const ready = !loading && profile
    const showNotice = isStale || (!loading && !profile)

    // 프로필 수정·스킨&카드 착용 시트는 다른 담당이 만듦
    // 붙일 때: 여기서 sheetProps(MY_PAGE_SHEETS.profileEdit)를 { open, onClose }로 넘김
    return (
        <ScreenFrame title="마이페이지" onBack={() => navigate("/lobby")}>
            <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-3 px-4 pb-4 md:max-w-[30rem] land:max-w-[52rem]">
                {showNotice ? <StaleNotice hasProfile={Boolean(profile)} error={error} onRetry={retry} /> : null}

                {loading && !profile ? (
                    <p role="status" className="py-10 text-center text-sm text-[#f5f0e6]/80">
                        전적을 불러오는 중입니다.
                    </p>
                ) : null}

                {ready ? (
                    // 세로: 띠 → 가면 → 기록 (데스크톱 순서), 가로: 왼쪽 띠·기록 / 오른쪽 가면
                    <div className="flex flex-col gap-3 land:grid land:grid-cols-2 land:items-start land:gap-x-4">
                        <div className="land:col-start-1 land:row-start-1">
                            <ProfileCard profile={profile} />
                        </div>
                        {description ? (
                            <div className="land:col-start-2 land:row-span-2 land:row-start-1">
                                <FateMask description={description} />
                            </div>
                        ) : null}
                        <div className="land:col-start-1 land:row-start-2">
                            <BloodRecord stats={stats} />
                        </div>
                    </div>
                ) : null}
            </div>

            <ShellBottom>
                <MyPageActions
                    onAccount={() => navigate("/account")}
                    onProfileEdit={() => openSheet(MY_PAGE_SHEETS.profileEdit)}
                    onSkinCardWear={() => openSheet(MY_PAGE_SHEETS.skinCardWear)}
                    onEmoticons={() => navigate("/mypage/emoticons")}
                />
            </ShellBottom>
        </ScreenFrame>
    )
}
