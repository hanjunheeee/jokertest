// 전적 못 불러옴·갱신 중 안내 줄 + 다시 불러오기 버튼
// MyPage가 씀, 문구는 데스크톱 MyPageLayout과 같음

// 값이 없음 / 오류 / 갱신 대기 순서로 문구를 고름
function pickMessage({ hasProfile, error }) {
    if (!hasProfile) return "전적을 불러오지 못했습니다."
    if (error) return "최신 전적을 불러오지 못했습니다. 아래 값은 갱신 전 값일 수 있습니다."
    return "전적이 갱신되었습니다. 최신 값을 불러오는 중입니다."
}

// 화면 폭에 맞춰 줄바꿈, 버튼은 44px
export default function StaleNotice({ hasProfile, error, onRetry }) {
    return (
        <div
            role="status"
            className="flex items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/75 px-3 py-2 text-sm text-[#f5f0e6]"
        >
            <span className="min-w-0 flex-1 break-keep">{pickMessage({ hasProfile, error })}</span>
            <button
                type="button"
                onClick={() => onRetry?.()}
                aria-label="전적 다시 불러오기"
                className="min-h-11 shrink-0 cursor-pointer rounded border border-[#c9b892]/60 bg-transparent px-3 font-bold text-[#f5f0e6] active:scale-95"
            >
                다시 불러오기
            </button>
        </div>
    )
}
