// socket.io 연결 함수(io)를 가짜로 바꿔 끼우는 파일: 앱 소켓 훅(useSocket)이 만드는 소켓이 A10 가짜 소켓이 되게 함
// useSocket을 그리는 A10·A18 시험이 domSetup.mjs 바로 다음에 부름 (소켓 쪽 코드를 부르기 전에 바꿔야 해서)
import { mock } from "node:test"

// io()로 만든 가짜 소켓 차례 모음 (마지막이 지금 소켓)
export const made = []
let factory = null

// 시험 쪽에서 가짜 소켓 만드는 법을 넣음 (a10Kit.createFakeSocket)
export function useSocketFactory(fn) {
  factory = fn
}

mock.module("socket.io-client", {
  exports: {
    io: (url, opts) => {
      const socket = factory({ id: `io-${made.length + 1}` })
      socket.madeWith = { url, opts }
      made.push(socket)
      return socket
    },
  },
})

// 브라우저 주소 바꾸기 흉내: jsdom은 다른 주소로 못 가서, 그 순간만 window.location을 바꿔 끼워 간 주소를 모음
// run 안에서 부른 location.replace·assign·href 쓰기를 moves에 남김
export function catchPageMoves(run) {
  const moves = []
  const realWindow = globalThis.window
  const fakeLocation = {
    replace: (url) => moves.push(String(url)),
    assign: (url) => moves.push(String(url)),
    set href(url) { moves.push(String(url)) },
    get href() { return realWindow.location.href },
    get pathname() { return realWindow.location.pathname },
  }
  const proxy = new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return fakeLocation
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  globalThis.window = proxy
  try {
    run()
  } finally {
    globalThis.window = realWindow
  }
  return moves
}
