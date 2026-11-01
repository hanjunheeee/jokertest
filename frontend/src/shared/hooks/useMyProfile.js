// 내 프로필 요약(닉네임·칭호·판수·승률·대표 직업 문구)을 사용자 스토어에서 읽고, 창으로 돌아오면 다시 불러옴
// lobby 프로필 영역(LobbyPage)과 마이페이지(MyPageLayout)가 씀
import { useEffect } from "react"
import { useUserProfileStore } from "../../domains/user/store/user.store.js"

export function useMyProfile() {
    const generation = useUserProfileStore((s) => s.requestGeneration)
    const invalidationRevision = useUserProfileStore((s) => s.invalidationRevision)
    const appliedRevision = useUserProfileStore((s) => s.appliedRevision)
    const data = useUserProfileStore((s) => s.data)
    const loading = useUserProfileStore((s) => s.loading)
    const error = useUserProfileStore((s) => s.error)
    const refresh = useUserProfileStore((s) => s.refresh)

    useEffect(() => {
        refresh()
    }, [generation, invalidationRevision, refresh])

    useEffect(() => {
        if (typeof window === "undefined") return undefined
        const onFocus = () => { refresh() }
        const onVisible = () => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return
            refresh()
        }
        window.addEventListener("focus", onFocus)
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible)
        return () => {
            window.removeEventListener("focus", onFocus)
            if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible)
        }
    }, [refresh])

    const isStale = appliedRevision < invalidationRevision || error !== null

    if(!data) {
        return { profile: null, stats: null, description: null, loading, isStale, error, retry: refresh }
    }

    const profile = {
        nickname: data.nickname,
        title:    data.title,
    }

    const stats = [
        { label: "전체 판수", value: data.total_games.toLocaleString() },
        { label: "승률",      value: `${(data.account_win_rate * 100).toFixed(1)}%` },
    ]

    const hasHighestWinRateRole = Boolean(data.highest_win_rate_role)
    const description = hasHighestWinRateRole
        ? {
            prefix: "이 자는",
            highlight: data.highest_win_rate_role,
            suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
        }
        : {
            prefix: "",
            highlight: "전적 없음",
            suffix: " 아직 어떤 가면도 증명하지 못했습니다.",
        }

    return { profile, stats, description, loading, isStale, error, retry: refresh }
}
