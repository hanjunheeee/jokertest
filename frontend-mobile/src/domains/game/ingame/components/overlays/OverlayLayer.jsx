// 인게임 연출 층: 역할 공개·단계 입장·밤 차례·밤 결과·낮 시작 연출·재판·추방·사망 선택을 body에 띄움
// InGamePage가 Provider(플레이어·채팅 세션·행동 컨텍스트) 안쪽에 props 없이 둠, 잠금 값은 overlayBridge로 틀에 넘김
import { createPortal } from "react-dom"
import { useOverlayLayer } from "../../hooks/overlays/useOverlayLayer.js"
import DawnReportOverlay from "./DawnReportOverlay.jsx"
import DeadChoiceOverlay from "./DeadChoiceOverlay.jsx"
import ExpulsionOverlay from "./ExpulsionOverlay.jsx"
import NightPrivateResultOverlay from "./NightPrivateResultOverlay.jsx"
import NightTurnOverlay from "./NightTurnOverlay.jsx"
import PhaseEntranceOverlay from "./PhaseEntranceOverlay.jsx"
import RoleRevealOverlay from "./RoleRevealOverlay.jsx"
import TribunalGate from "./tribunal/TribunalGate.jsx"
import InGameEntryPreparingOverlay from "@/domains/game/ingame/components/entryPreparing/InGameEntryPreparingOverlay.jsx"

// .mobile-shell이 container 틀이라 fixed가 그 안에 갇힘 → body로 꺼냄 (그리는 순서는 데스크톱 InGamePage와 같음)
export default function OverlayLayer() {
    const o = useOverlayLayer()

    return createPortal(
        <div data-ingame-overlay-layer="">
            <InGameEntryPreparingOverlay open={o.entryPreparingActive} />
            <TribunalGate />
            <NightTurnOverlay
                open={o.nightTurn.open}
                announcement={o.nightTurn.announcement}
                onClose={o.nightTurn.close}
            />
            <PhaseEntranceOverlay
                open={o.phaseEntrance.open}
                phase={o.phaseEntrance.phase}
                onConfirm={o.phaseEntrance.confirm}
            />
            <RoleRevealOverlay
                open={o.roleReveal.open}
                onClose={o.roleReveal.close}
                roleInfo={o.roleReveal.roleInfo}
                players={o.players}
            />
            <NightPrivateResultOverlay
                open={o.nightPrivateResult.open}
                kind={o.nightPrivateResult.kind}
                label={o.nightPrivateResult.label}
                onConfirm={o.nightPrivateResult.confirm}
            />
            {/* 열쇠 기본값은 추방 연출("none")과 겹치지 않게 따로 (같은 부모 안 같은 열쇠면 React가 둘을 헷갈림) */}
            <DawnReportOverlay
                key={o.dawnReport.report?.key ?? "dawn-none"}
                report={o.dawnReport.report}
                open={o.dawnReport.open}
                onFinish={o.dawnReport.finish}
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
