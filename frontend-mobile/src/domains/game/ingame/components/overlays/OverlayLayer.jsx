// 인게임 연출 층: 역할 공개·단계 입장·밤 차례·밤 대기·밤 성공·밤 결과·재판·추방·사망 선택을 body에 띄움
// InGamePage가 Provider(플레이어·채팅 세션·행동 컨텍스트) 안쪽에 props 없이 둠, 잠금 값은 overlayBridge로 틀에 넘김
import { createPortal } from "react-dom"
import { useOverlayLayer } from "../../hooks/overlays/useOverlayLayer.js"
import DeadChoiceOverlay from "./DeadChoiceOverlay.jsx"
import ExpulsionOverlay from "./ExpulsionOverlay.jsx"
import NightPrivateResultOverlay from "./NightPrivateResultOverlay.jsx"
import NightTurnOverlay from "./NightTurnOverlay.jsx"
import NightWaitOverlay from "./NightWaitOverlay.jsx"
import PhaseEntranceOverlay from "./PhaseEntranceOverlay.jsx"
import RoleRevealOverlay from "./RoleRevealOverlay.jsx"
import NightSuccessOverlay from "./nightSuccess/NightSuccessOverlay.jsx"
import TribunalGate from "./tribunal/TribunalGate.jsx"

// .mobile-shell이 container 틀이라 fixed가 그 안에 갇힘 → body로 꺼냄 (그리는 순서는 데스크톱 InGamePage와 같음)
export default function OverlayLayer() {
    const o = useOverlayLayer()

    return createPortal(
        <div data-ingame-overlay-layer="">
            <TribunalGate />
            <NightTurnOverlay
                open={o.nightTurn.open && !o.waitOpen}
                announcement={o.nightTurn.announcement}
                onClose={o.nightTurn.close}
            />
            <PhaseEntranceOverlay
                open={o.phaseEntrance.open && !o.waitOpen}
                phase={o.phaseEntrance.phase}
                onConfirm={o.phaseEntrance.confirm}
            />
            {o.waitOpen ? null : (
                <RoleRevealOverlay
                    open={o.roleReveal.open}
                    onClose={o.roleReveal.close}
                    roleInfo={o.roleReveal.roleInfo}
                    players={o.players}
                />
            )}
            <NightWaitOverlay open={o.waitOpen} />
            <NightPrivateResultOverlay
                open={o.nightPrivateResult.open && !o.waitOpen}
                kind={o.nightPrivateResult.kind}
                label={o.nightPrivateResult.label}
                onConfirm={o.nightPrivateResult.confirm}
            />
            <NightSuccessOverlay
                current={o.nightSuccess.current}
                open={o.nightSuccess.open}
                finish={o.nightSuccess.finish}
                finalStatus={o.nightSuccess.finalStatus}
                onClose={o.nightSuccess.onClose}
            />
            <DeadChoiceOverlay {...o.deadChoice} />
            <ExpulsionOverlay
                key={o.tribunalExpulsion.presentationId ?? "none"}
                open={o.tribunalExpulsion.open}
                presentationId={o.tribunalExpulsion.presentationId}
                message={o.tribunalExpulsion.message}
                onComplete={o.tribunalExpulsion.consume}
            />
        </div>,
        document.body,
    )
}
