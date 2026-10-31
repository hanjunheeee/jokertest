import test from "node:test"
import assert from "node:assert/strict"
import { attachVideoIntroWatch } from "../useVideoIntro.js"

function makeVideo({ duration = NaN, currentTime = 0, readyState = 0 } = {}) {
  const listeners = new Map()
  return {
    duration, currentTime, readyState, paused: false, seeks: 0,
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]) },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)) },
    emit(type) { for (const fn of listeners.get(type) ?? []) fn() },
    pause() { this.paused = true },
    listenerCount(type) { return (listeners.get(type) ?? []).length },
  }
}

function makeTimers() {
  const pending = new Map()
  let next = 1
  return {
    setTimeoutFn: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id },
    clearTimeoutFn: (id) => { pending.delete(id) },
    fire: () => { for (const [id, { fn }] of [...pending]) { pending.delete(id); fn() } },
    size: () => pending.size,
  }
}

test("영상 error → 즉시 끝난 것으로 보고 멈춘다(클릭 잠금 해제)", () => {
  const video = makeVideo()
  const timers = makeTimers()
  let done = 0
  attachVideoIntroWatch(video, () => { done += 1 }, timers)
  video.emit("error")
  assert.equal(done, 1)
  assert.equal(video.paused, true)
  assert.equal(timers.size(), 0, "로드 타이머는 해제된다")
})

test("메타데이터가 제한 시간 안에 오지 않으면 끝난 것으로 본다", () => {
  const video = makeVideo()
  const timers = makeTimers()
  let done = 0
  attachVideoIntroWatch(video, () => { done += 1 }, timers)
  assert.equal(timers.size(), 1)
  timers.fire()
  assert.equal(done, 1)
})

test("메타데이터가 오면 로드 타이머를 끄고, 끝 근처에서 한 번만 끝난다 — 하드 시크 없음", () => {
  const video = makeVideo({ duration: 5, currentTime: 0 })
  const timers = makeTimers()
  let done = 0
  attachVideoIntroWatch(video, () => { done += 1 }, timers)
  video.emit("loadedmetadata")
  assert.equal(timers.size(), 0)
  video.currentTime = 2
  video.emit("timeupdate")
  assert.equal(done, 0)
  video.currentTime = 4.98
  video.emit("timeupdate")
  video.emit("ended")
  assert.equal(done, 1)
  assert.equal(video.currentTime, 4.98, "currentTime을 duration 끝으로 옮기지 않는다")
  assert.equal(video.paused, true)
})

test("해제하면 리스너와 타이머가 남지 않는다", () => {
  const video = makeVideo()
  const timers = makeTimers()
  const detach = attachVideoIntroWatch(video, () => {}, timers)
  detach()
  assert.equal(timers.size(), 0)
  for (const type of ["timeupdate", "loadedmetadata", "ended", "error"]) {
    assert.equal(video.listenerCount(type), 0, type)
  }
})
