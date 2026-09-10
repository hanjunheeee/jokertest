import { useEffect } from "react"
import { useUserProfileStore } from "../store/user.store.js"

// 내 프로필 화면에서 필요한 프로필/통계/소개 문구 데이터를 준비하는 훅입니다.
export function useMyProfile() {
    const data = useUserProfileStore((s) => s.data)
    const loading = useUserProfileStore((s) => s.loading)
    const fetchProfile = useUserProfileStore((s) => s.fetchProfile)

    useEffect(() => {
        // 캐시에 이미 데이터가 있으면 재요청하지 않습니다 (로비→마이페이지 이동 시 중복 fetch 방지).
        if (data) return
        fetchProfile()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    if(!data) {
        // 아직 데이터가 없으면 화면에서 안전하게 처리할 수 있도록 null 값을 반환합니다.
        return { profile: null, stats: null, description: null, loading}
    }

    // 화면 상단 프로필 영역에서 사용할 값입니다.
    const profile = {
        reputationLabel: `${data.nickname}`,
        reputationValue: data.reputation,
        title:           data.title,
    }

    // 전적 숫자들을 화면에 바로 보여줄 수 있는 배열 형태로 바꿉니다.
    const stats = [
        { label: "전체 판수",    value: data.total_games.toLocaleString() },
        { label: "생존 횟수",    value: data.survival_count.toLocaleString() },
        { label: "단두대 처형",  value: data.execution_count.toLocaleString() },
    ]

    // "운명의 가면"은 가장 많이 플레이한 직업이 아니라 최소 1판 이상 중 가장 승률이 높은
    // 직업이다(F-10 AC-04) — most_played_role(최다 플레이, 위 stats에서는 쓰지 않음)과는
    // 다른 필드다. 대상이 없으면(전적이 0판) 서버가 null을 내려보내고, 여기서 더미 직업으로
    // 대체하지 않고 "전적 없음"으로 명시한다(A-05).
    const hasHighestWinRateRole = Boolean(data.highest_win_rate_role)
    const description = {
        prefix:    "이 자는",
        highlight: hasHighestWinRateRole ? data.highest_win_rate_role : "전적 없음",
        suffix:    hasHighestWinRateRole ? "의 가면을 쓸 때 가장 잔혹합니다." : "아직 어떤 가면도 증명하지 못했습니다.",
    }

    return { profile, stats, description, loading }
}
