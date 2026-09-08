import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { renderHook } from "@testing-library/react"
import { useInGameActionPanel } from "../useInGameActionPanel.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { InGamePlayerSessionContext } from "../../components/InGamePlayerSessionContext.js"
import { setSocket } from "../../../../../shared/socket/socketClient.js"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
for (const name of ["window", "document", "HTMLElement", "Node", "MutationObserver"]) {
  globalThis[name] = name === "window" ? dom.window : dom.window[name]
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const players = ["p1", "p2", "p3", "p4", "p5"].map((id) => ({
  id, uuid: id, nickname: id, status: "alive", alive: true,
}))
const revote = { gameId: "g", dayIndex: 2, phase: "DAY", outcome: "REVOTE", round: 1,
  tribunalTargetUuid: null, publicVoteCount: 5, publicAbstainCount: 1, revoteExcludedUuids: ["p2", "p3"] }

test("live REVOTE resets selection/submission and ignores delayed previous-round acknowledgements", async () => {
  const listeners = new Map()
  const requests = []
  const socket = {
    connected: true,
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn) },
    off(event, fn) { listeners.get(event)?.delete(fn) },
    timeout() { return socket },
    emitWithAck(event, payload) { return new Promise((resolve) => requests.push({ event, payload, resolve })) },
  }
  setSocket(socket)
  useInGameStore.setState({ gameId: "g", state: { id: "g", phase: "DAY", dayPhase: "DAY_VOTE",
    dayIndex: 2, players, self: { uuid: "p1", role: "CITIZEN" } } })
  function Wrapper({ children }) {
    return React.createElement(InGamePlayerSessionContext.Provider, { value: { players, localPlayerId: "p1" } }, children)
  }
  const hook = renderHook(() => useInGameActionPanel(), { wrapper: Wrapper })
  try {
    act(() => hook.result.current.setSelectedDayVoteTargetId("p2"))
    act(() => hook.result.current.submitDayVote())
    act(() => hook.result.current.resolveDayVote())
    assert.equal(hook.result.current.dayVoteStatus, "submitting")
    assert.equal(hook.result.current.dayVoteResolveStatus, "resolving")
    act(() => {
      useInGameStore.getState().applyDayVoteResolvedToPhase("g", 2, revote)
      for (const fn of listeners.get("day_vote_resolved") ?? []) fn(revote)
    })
    assert.equal(hook.result.current.selectedDayVoteTargetId, null)
    assert.equal(hook.result.current.dayVoteStatus, "idle")
    assert.equal(hook.result.current.dayVoteHasSubmitted, false)
    assert.equal(hook.result.current.dayVoteResolveStatus, "idle")
    assert.equal(hook.result.current.dayVoteControlsEnabled, true)
    assert.deepEqual(hook.result.current.dayVoteTargets.map((p) => p.id), ["p4", "p5"])
    await act(async () => {
      for (const request of requests) request.resolve({ ok: true, outcome: "TRIBUNAL", tribunalTargetUuid: "p2" })
    })
    assert.equal(hook.result.current.dayVoteHasSubmitted, false)
    assert.equal(hook.result.current.dayVoteResolveStatus, "idle")
    // A duplicate first-round broadcast must not clear an in-flight second vote.
    act(() => hook.result.current.setSelectedDayVoteTargetId("p4"))
    act(() => hook.result.current.submitDayVote())
    act(() => { for (const fn of listeners.get("day_vote_resolved") ?? []) fn(revote) })
    assert.equal(hook.result.current.dayVoteStatus, "submitting")
    await act(async () => requests.at(-1).resolve({ ok: true }))
    assert.equal(hook.result.current.dayVoteHasSubmitted, true)
    assert.equal(hook.result.current.dayVoteLastSubmittedTargetId, "p4")
  } finally {
    hook.unmount()
    setSocket(null)
  }
})
