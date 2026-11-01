// 연출 층과 화면 틀 사이 값 주고받는 작은 저장소 (조작 잠금·역할 다시 보기·나가기 손잡이)
// OverlayLayer가 잠금·역할 값을 넣고, 화면 틀(InGamePage)이 읽음; 나가기 손잡이는 틀이 넣고 사망 선택 창이 읽음
import { useEffect } from "react"
import { create } from "zustand"

// 연출 훅 상태가 한 벌뿐이라 틀이 같은 훅을 또 부르면 값이 갈라짐 → 여기로만 나눔
export const useOverlayBridge = create((set) => ({
    // 단계 입장 안내가 떠서 행동 패널 조작 막음 (InGameActionProvider의 interactionBlocked)
    interactionBlocked: false,
    // 연출이 화면을 덮는 중이라 판·채팅·행동 줄 누름 막음 (데스크톱 surfaceLocked)
    surfaceLocked: false,
    // 내 역할 다시 보기 가능 여부·여는 함수 (위 줄 역할 버튼용)
    roleRevealAvailable: false,
    reopenRoleReveal: null,
    // useInGameExit 결과 (useBlocker 때문에 틀이 한 번만 부름)
    exit: null,
    // 바뀐 값만 넣기 (같은 값으로 매번 다시 그리지 않게)
    setOverlayState: (patch) => set((s) => (isSameShallow(s, patch) ? s : patch)),
    // useInGameExit는 그릴 때마다 새 객체라 칸별로 비교
    setExit: (exit) => set((s) => (isSameShallow(s.exit, exit) ? s : { exit })),
}))

// 얕은 비교: patch의 칸이 모두 같으면 true
function isSameShallow(current, patch) {
    if (current === patch) return true
    if (!current || !patch) return false
    return Object.keys(patch).every((key) => Object.is(current[key], patch[key]))
}

// 화면 틀이 useInGameExit 결과를 연출 층에 넘길 때 씀 (화면 빠지면 비움)
export function usePublishOverlayExit(exit) {
    const setExit = useOverlayBridge((s) => s.setExit)
    useEffect(() => {
        setExit(exit ?? null)
    }, [exit, setExit])
    useEffect(() => () => setExit(null), [setExit])
}

// 화면 틀이 잠금 값만 읽을 때 씀
export const selectSurfaceLocked = (s) => s.surfaceLocked
export const selectInteractionBlocked = (s) => s.interactionBlocked
