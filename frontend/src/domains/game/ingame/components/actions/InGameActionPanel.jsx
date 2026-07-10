import { useMemo, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient"
import { useInGameStore } from "../../store/ingameStore.js"

const PANEL_CLASS =
  "absolute bottom-[clamp(0.75rem,2vh,1.25rem)] left-[clamp(0.75rem,2vw,1.25rem)] z-30 w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-[#d8b982]/55 bg-black/72 p-3 text-[#f8ead2] shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-sm"

const HEADER_CLASS =
  "flex items-center justify-between gap-3 border-b border-[#d8b982]/25 pb-2"

const TITLE_CLASS = "text-sm font-semibold tracking-normal text-[#ffe2ad]"

const META_CLASS = "text-[0.7rem] leading-tight text-[#cdbb9e]"

const SECTION_CLASS = "mt-3 space-y-2"

const BUTTON_CLASS =
  "min-h-8 rounded border border-[#d8b982]/35 bg-[#2b1c15]/85 px-3 py-1.5 text-xs text-[#f8ead2] transition hover:border-[#f3d28d] hover:bg-[#53321f] disabled:cursor-not-allowed disabled:opacity-40"

const TARGET_BUTTON_CLASS =
  "min-h-8 rounded border border-[#927556]/45 bg-black/35 px-2 py-1 text-left text-xs text-[#f8ead2] transition hover:border-[#f3d28d] disabled:cursor-not-allowed disabled:opacity-40"

const SELECTED_TARGET_BUTTON_CLASS =
  `${TARGET_BUTTON_CLASS} border-[#f3d28d] bg-[#5b321d]/80`

function emit(eventName, payload = {}) {
  getSocket()?.emit(eventName, payload)
}

function getNightActionType(role) {
  if (role === "DOCTOR") return "PROTECT"
  if (role === "JOKER") return "ASSASSINATE"
  if (role === "GUARD") return "INVESTIGATE"
  if (role === "WITCH_HUNTER") return "CONFIRM"
  return "SKIP"
}

function getNightActionLabel(role) {
  if (role === "DOCTOR") return "보호"
  if (role === "JOKER") return "암살"
  if (role === "GUARD") return "조사"
  if (role === "WITCH_HUNTER") return "확인"
  return "건너뛰기"
}

function formatEvent(event) {
  const actor = event.actorId ? ` ${event.actorId}` : ""
  const target = event.targetId ? ` -> ${event.targetId}` : ""
  return `${event.type}${actor}${target}`
}

function TargetPicker({ players, selectedTargetId, onSelect, disabled = false }) {
  return (
    <div className="grid max-h-32 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          disabled={disabled || !player.alive || !player.connected}
          className={
            selectedTargetId === player.id
              ? SELECTED_TARGET_BUTTON_CLASS
              : TARGET_BUTTON_CLASS
          }
          onClick={() => onSelect(player.id)}
        >
          <span className="block truncate">{player.name}</span>
          <span className="block text-[0.65rem] text-[#cdbb9e]">
            {!player.connected ? "연결끊김" : player.alive ? "생존" : "사망"}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * 개발용 인게임 조작 패널.
 * TODO: 실제 기획 UI가 들어오면 이 패널은 정식 투표/스킬 UI로 교체합니다.
 */
export default function InGameActionPanel() {
  const gameState = useInGameStore((s) => s.state)
  const error = useInGameStore((s) => s.error)
  const [selectedTargetId, setSelectedTargetId] = useState(null)

  const alivePlayers = useMemo(
    () => gameState?.players?.filter((player) => player.alive && player.connected) ?? [],
    [gameState?.players],
  )

  if (!gameState) {
    return (
      <aside className={PANEL_CLASS} aria-label="게임 조작">
        <p className={TITLE_CLASS}>게임 상태 대기</p>
        <p className={META_CLASS}>매칭에서 게임을 시작하거나 방 코드로 참가하세요.</p>
      </aside>
    )
  }

  const nightActionType = getNightActionType(gameState.myRole)
  const nightActionLabel = getNightActionLabel(gameState.myRole)
  const hasTarget = Boolean(selectedTargetId)
  const latestEvents = [...(gameState.events ?? [])].slice(-6).reverse()

  return (
    <aside className={PANEL_CLASS} aria-label="게임 조작">
      <div className={HEADER_CLASS}>
        <div>
          <p className={TITLE_CLASS}>
            {gameState.phase} · 제 {gameState.dayIndex}일
          </p>
          <p className={META_CLASS}>
            역할 {gameState.myRole ?? "미정"} · 생존 {alivePlayers.length}명
          </p>
        </div>
        {gameState.winResult ? (
          <p className="rounded border border-[#f3d28d]/60 px-2 py-1 text-xs text-[#ffe2ad]">
            {gameState.winResult.winner} 승리
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded border border-red-300/40 bg-red-950/40 px-2 py-1 text-xs text-red-100">
          {error}
        </p>
      ) : null}

      {gameState.phase === "DAY" ? (
        <div className={SECTION_CLASS}>
          <TargetPicker
            players={gameState.players}
            selectedTargetId={selectedTargetId}
            onSelect={setSelectedTargetId}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={!hasTarget}
              onClick={() => emit("cast_day_vote", { targetId: selectedTargetId })}
            >
              투표
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => emit("resolve_day_vote")}
            >
              낮 집계
            </button>
          </div>
        </div>
      ) : null}

      {gameState.phase === "TRIBUNAL" ? (
        <div className={SECTION_CLASS}>
          <p className={META_CLASS}>후보자: {gameState.tribunal?.candidateId ?? "없음"}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => emit("cast_tribunal_vote", { vote: "APPROVE" })}
            >
              찬성
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => emit("cast_tribunal_vote", { vote: "REJECT" })}
            >
              반대
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => emit("resolve_tribunal_vote")}
            >
              처형 결정
            </button>
          </div>
        </div>
      ) : null}

      {gameState.phase === "NIGHT" ? (
        <div className={SECTION_CLASS}>
          <TargetPicker
            players={gameState.players}
            selectedTargetId={selectedTargetId}
            onSelect={setSelectedTargetId}
            disabled={nightActionType === "SKIP"}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={nightActionType !== "SKIP" && !hasTarget}
              onClick={() =>
                emit("submit_night_action", {
                  action:
                    nightActionType === "SKIP"
                      ? { type: "SKIP" }
                      : { type: nightActionType, targetId: selectedTargetId },
                })
              }
            >
              {nightActionLabel}
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => emit("resolve_night")}
            >
              밤 종료
            </button>
          </div>
        </div>
      ) : null}

      <div className={SECTION_CLASS}>
        <p className={META_CLASS}>이벤트</p>
        <ul className="space-y-1 text-[0.68rem] leading-tight text-[#e9d6ba]">
          {latestEvents.length ? (
            latestEvents.map((event) => (
              <li key={event.id} className="truncate">
                {formatEvent(event)}
              </li>
            ))
          ) : (
            <li>이벤트 없음</li>
          )}
        </ul>
      </div>
    </aside>
  )
}
