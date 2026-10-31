import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../ingameStore.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../hooks/useGameSessionSocketEvents.js")

const GAME_ID = "game-npr-store"
const SELF_UUID = "uuid-self"
const OTHER_UUID = "uuid-other"

const ROSTER = [
  { uuid: SELF_UUID, nickname: "나" },
  { uuid: OTHER_UUID, nickname: "상대" },
]

function buildSelf() {
  return { uuid: SELF_UUID, nickname: "나", role: "GUARD", team: "CITIZEN", hasActedThisPhase: false }
}

function createFakeSocket() {
  const listeners = new Map()
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
}

function openSession() {
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const { unmount } = renderHook(() => useGameSessionSocketEvents())
  return {
    socket,
    deliver(event, payload) {
      act(() => socket.deliver(event, payload))
    },
    close() {
      unmount()
      act(() => setSocket(null))
    },
  }
}

function seedNightSession({ gameId = GAME_ID } = {}) {
  act(() => {
    useInGameStore.setState({
      gameId: null,
      state: null,
      hostUuid: null,
      error: null,
      snapshotSeq: 0,
      nightPrivateResult: null,
    })
    useInGameStore.getState().setGamePayload({
      gameId,
      state: {
        id: gameId,
        phase: "NIGHT",
        dayIndex: 1,
        dayPhase: null,
        players: ROSTER.map((p) => ({ ...p })),
        self: buildSelf(),
      },
    })
  })
}

const GUARD_RESULT = Object.freeze({
  gameId: GAME_ID,
  dayIndex: 1,
  actionType: "INVESTIGATE",
  targetId: OTHER_UUID,
  role: "JOKER",
})

const NIGHT_RESULT_APPLIED = Object.freeze({
  gameId: GAME_ID,
  phase: "DAY",
  dayIndex: 2,
  players: [
    { uuid: SELF_UUID, alive: true },
    { uuid: OTHER_UUID, alive: false },
  ],
  victimUuid: OTHER_UUID,
  deathReveals: [{ victimUuid: OTHER_UUID, source: "JOKER" }],
})

function applyDaySnapshot() {
  act(() => {
    useInGameStore.getState().applySessionSnapshot({
      ok: true,
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex: 2,
      dayPhase: "DAY_DISCUSSION",
      players: [
        { uuid: SELF_UUID, nickname: "나", isAlive: true, isConnected: true },
        { uuid: OTHER_UUID, nickname: "상대", isAlive: false, isConnected: true },
      ],
      self: buildSelf(),
    })
  })
}

const readResult = () => useInGameStore.getState().nightPrivateResult


const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { __setSfxPlayerForTests } = await import("../../../../../shared/hooks/useSfxRuntime.js")
const { createSfxPlayer } = await import("../../../../../shared/audio/sfxPlayer.js")
const { SFX_MANIFEST } = await import("../../../../../shared/audio/sfxManifest.js")

function recordProductionPlayer() {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF_UUID } })
  const player=createSfxPlayer({manifest:SFX_MANIFEST,
    getSettings:()=>({masterVolume:100,sfxVolume:100,sfxMuted:false}),
    getScope:()=>({accountId:SELF_UUID,gameId:GAME_ID,roomId:null})})
  __setSfxPlayerForTests(player)
  return player
}
test.afterEach(()=>{ __setSfxPlayerForTests(null); useAuthStore.setState({isLoggedIn:false,user:null}) })

test("F16 actual private consumer rejects foreign account and never emits secret target/role",()=>{
  seedNightSession(); const session=openSession(); const events=[]
  useAuthStore.setState({isLoggedIn:true,user:{uuid:SELF_UUID}})
  __setSfxPlayerForTests({dispatch:event=>events.push(event)})
  const envelope={eventId:"private-1",accountId:OTHER_UUID,gameId:GAME_ID,origin:"live"}
  session.deliver("night_action_result",{...GUARD_RESULT,sfxEvent:envelope})
  assert.equal(events.length,0)
  session.deliver("night_action_result",{...GUARD_RESULT,sfxEvent:{...envelope,accountId:SELF_UUID}})
  assert.equal(events.length,1)
  assert.equal(events[0].kind,"night-private-result")
  assert.equal(Object.hasOwn(events[0],"targetId"),false)
  assert.equal(Object.hasOwn(events[0],"role"),false)
  session.close()
})

test("F16 real hook and player deduplicate private delivery without losing game state",()=>{
  seedNightSession(); const session=openSession(); const player=recordProductionPlayer()
  const payload={...GUARD_RESULT,sfxEvent:{eventId:"private-2",accountId:SELF_UUID,gameId:GAME_ID,origin:"live"}}
  session.deliver("night_action_result",payload)
  session.deliver("night_action_result",payload)
  const logs=player.getSilenceLog()
  assert.equal(logs.filter(x=>x.reason==="duplicate").length,1)
  assert.equal(readResult().targetId,OTHER_UUID)
  session.deliver("night_result_applied",NIGHT_RESULT_APPLIED)
  assert.equal(useInGameStore.getState().state.phase,"DAY")
  session.close(); player.dispose()
})

test("F16 actual eliminated consumer applies terminal once and rejects resurrection/stale roster",()=>{
  seedNightSession(); const session=openSession(); const events=[]
  useAuthStore.setState({isLoggedIn:true,user:{uuid:SELF_UUID}})
  __setSfxPlayerForTests({dispatch:event=>events.push(event)})
  const original=useInGameStore.getState().state
  const payload={gameId:GAME_ID,phase:"ENDED",dayIndex:1,victimUuid:OTHER_UUID,
    players:[{uuid:SELF_UUID,isAlive:true},{uuid:OTHER_UUID,isAlive:false}],winResult:{winner:"CITIZEN"}}
  session.deliver("player_eliminated",{...payload,gameId:"foreign"})
  assert.equal(useInGameStore.getState().state,original)
  session.deliver("player_eliminated",{...payload,players:[{uuid:SELF_UUID,isAlive:true},{uuid:"foreign",isAlive:false}]})
  assert.equal(useInGameStore.getState().state,original)
  session.deliver("player_eliminated",payload)
  const ended=useInGameStore.getState().state
  assert.equal(ended.phase,"ENDED")
  assert.equal(ended.players.find(p=>p.uuid===OTHER_UUID).alive,false)
  assert.deepEqual(events.map(x=>x.kind),["player-eliminated","game-result"])
  session.deliver("player_eliminated",payload)
  session.deliver("player_eliminated",{...payload,players:payload.players.map(p=>({...p,isAlive:true}))})
  assert.equal(useInGameStore.getState().state,ended)
  assert.equal(events.length,2)
  session.close()
})


test("F16 private restore origin survives consumer forwarding and does not claim the live event",()=>{
  seedNightSession();const session=openSession();const player=recordProductionPlayer()
  const payload={...GUARD_RESULT,sfxEvent:{eventId:"restore-private",accountId:SELF_UUID,gameId:GAME_ID,origin:"restore"}}
  session.deliver("night_action_result",payload)
  assert.equal(player.getSilenceLog().filter(x=>x.reason==="restore-origin").length,1)
  session.deliver("night_action_result",{...payload,sfxEvent:{...payload.sfxEvent,origin:"live"}})
  assert.equal(player.getSilenceLog().filter(x=>x.reason==="duplicate").length,0)
  session.close();player.dispose()
})
