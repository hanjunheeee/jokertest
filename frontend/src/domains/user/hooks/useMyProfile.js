import { useEffect } from "react"
import { useUserProfileStore } from "../store/user.store.js"

// 내 프로필 화면에서 필요한 프로필/통계/소개 문구 데이터를 준비하는 훅입니다.
export function useMyProfile() {
    const generation = useUserProfileStore((s) => s.requestGeneration)
    const invalidationRevision = useUserProfileStore((s) => s.invalidationRevision)
    const appliedRevision = useUserProfileStore((s) => s.appliedRevision)
    const data = useUserProfileStore((s) => s.data)
    const loading = useUserProfileStore((s) => s.loading)
    const refresh = useUserProfileStore((s) => s.refresh)

    useEffect(() => {
        // F-21(A-10): **캐시가 있다는 이유로 조회를 생략하지 않는다.**
        //
        // 예전에는 data가 있으면 그대로 돌아갔다. 그러면 개인 무효화 신호를 받지 못한 경우
        // (끊겨 있는 동안 커밋된 전적, 다른 탭에서 지나간 신호, 웹 프로세스 밖의 복구 지급)에
        // 방금 끝난 판의 전적이 **새로고침 전까지 영영** 반영되지 않는다.
        //
        // 중복 요청은 생략이 아니라 합치기로 막는다 — store.refresh가 같은 계정·같은 무효화
        // 세대의 조회를 하나로 합치므로, 로비와 마이페이지가 함께 떠 있어도 요청은 한 번이다.
        // 화면 재진입은 이 effect를 다시 돌려 최신 값을 한 번 확인한다.
        refresh()
    }, [generation, invalidationRevision, refresh])

    // 창 재활성화·탭 가시화에서도 이 화면이 보고 있는 값을 다시 확인한다. 전역 수신기
    // (ProtectedRoute의 useGameSessionSocketEvents)가 같은 전이에서 세 캐시를 함께 수렴시키지만,
    // 이 화면 자체도 자기 데이터에 대해 같은 보장을 갖는다 — 위 refresh의 합치기가 있으므로
    // 둘이 같은 순간에 돌아도 요청은 한 번이다.
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

    // 값이 있어도 마지막 무효화보다 오래됐다면 화면이 그 사실을 알 수 있어야 한다.
    const isStale = appliedRevision < invalidationRevision

    if(!data) {
        // 아직 데이터가 없으면 화면에서 안전하게 처리할 수 있도록 null 값을 반환합니다.
        // retry는 조회가 실패한 화면이 사용자의 명시적 요청으로 다시 읽을 수 있는 경로다
        // (자동 재시도를 무한히 돌리지 않는다 — 실패는 화면에 남고 결정은 사용자가 한다).
        return { profile: null, stats: null, description: null, loading, isStale, retry: refresh }
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

    return { profile, stats, description, loading, isStale, retry: refresh }
}
