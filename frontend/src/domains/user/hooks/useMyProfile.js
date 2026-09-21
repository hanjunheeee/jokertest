import { useEffect } from "react"
import { useUserProfileStore } from "../store/user.store.js"

// 내 프로필 화면에서 필요한 프로필/통계/소개 문구 데이터를 준비하는 훅입니다.
export function useMyProfile() {
    const generation = useUserProfileStore((s) => s.requestGeneration)
    const invalidationRevision = useUserProfileStore((s) => s.invalidationRevision)
    const appliedRevision = useUserProfileStore((s) => s.appliedRevision)
    const data = useUserProfileStore((s) => s.data)
    const loading = useUserProfileStore((s) => s.loading)
    const error = useUserProfileStore((s) => s.error)
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

    /**
     * 값이 있어도 그 값이 **확인된 값이 아니면** 화면이 그 사실을 알 수 있어야 한다.
     *
     * 두 가지가 그 사실을 만든다:
     *   - 마지막 무효화보다 오래된 값이다(서버가 새 전적을 알렸는데 아직 못 받았다).
     *   - 마지막 조회가 **실패**했다. 무효화 신호를 놓친 채 재진입 조회가 실패하면 세대는
     *     오르지 않으므로 위 판정만으로는 false다 — 그때 화면은 낡았을 수 있는 숫자를 아무
     *     표시 없이 보여주고 다시 읽을 경로도 내놓지 않았다.
     */
    const isStale = appliedRevision < invalidationRevision || error !== null

    if(!data) {
        // 아직 데이터가 없으면 화면에서 안전하게 처리할 수 있도록 null 값을 반환합니다.
        // retry는 조회가 실패한 화면이 사용자의 명시적 요청으로 다시 읽을 수 있는 경로다
        // (자동 재시도를 무한히 돌리지 않는다 — 실패는 화면에 남고 결정은 사용자가 한다).
        return { profile: null, stats: null, description: null, loading, isStale, error, retry: refresh }
    }

    // 화면 상단 프로필 영역에서 사용할 값입니다.
    // F-30 AC-04: 명성은 화면에서 제거됐다 — 닉네임을 명성 이름 칸에 실어 보내던
    // reputationLabel/reputationValue도 함께 없앤다(배너는 닉네임 하나만 받는다).
    // title은 값 자체를 그대로 보존한다(기존에 없던 칭호 UI를 새로 만들지는 않는다).
    const profile = {
        nickname: data.nickname,
        title:    data.title,
    }

    // F-30 AC-01/AC-02: 피의 기록은 **전체 판수와 승률 두 항목뿐**이다(생존 횟수·단두대 처형
    // 행은 화면에서 제거됐다 — 원본 집계 자체는 서버에 그대로 남아 업적·랭킹이 계속 쓴다).
    //
    // 승률은 서버가 계정 전체 유효 종료 경기의 승수/판수로 계산한 원시 비율(0~1)이고, 여기서는
    // 표시 자리수만 정한다 — 0판이면 0.0%, 전승이면 100.0%다. 두 숫자는 같은 응답의 같은
    // 모집단에서 나오므로 화면에서 서로 검산할 수 있다.
    const stats = [
        { label: "전체 판수", value: data.total_games.toLocaleString() },
        { label: "승률",      value: `${(data.account_win_rate * 100).toFixed(1)}%` },
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

    return { profile, stats, description, loading, isStale, error, retry: refresh }
}
