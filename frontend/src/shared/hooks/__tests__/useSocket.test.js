import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MutationObserver: dom.window.MutationObserver,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

mock.module("../../env.js", {
  namedExports: { API_BASE_URL: "http://test-api.local" },
});

const setSocketCalls = [];
mock.module("../../socket/socketClient.js", {
  namedExports: { setSocket: (s) => setSocketCalls.push(s) },
});

let refreshImpl = async () => true;
const refreshCalls = [];
mock.module("../../api/client.js", {
  namedExports: {
    refreshAccessToken: (...args) => { refreshCalls.push(args); return refreshImpl(); },
  },
});

const createdSockets = [];
const createFakeSocket = () => {
  const listeners = new Map();
  const socket = {
    connectCallCount: 0,
    disconnectCallCount: 0,
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
    },
    off(event) {
      listeners.delete(event);
    },
    connect() {
      socket.connectCallCount += 1;
    },
    disconnect() {
      socket.disconnectCallCount += 1;
    },
    fire(event, ...args) {
      (listeners.get(event) || []).forEach((cb) => cb(...args));
    },
  };
  createdSockets.push(socket);
  return socket;
};

mock.module("socket.io-client", {
  namedExports: { io: () => createFakeSocket() },
});

const authState = { isLoggedIn: false };
const logoutCalls = [];
authState.logout = () => logoutCalls.push(true);
function useAuthStore(selector) {
  return selector(authState);
}
mock.module("../../../domains/auth/store/auth.store.js", {
  namedExports: { useAuthStore },
});

const { act, renderHook } = await import("@testing-library/react");
const { useSocket } = await import("../useSocket.js");

const resetAll = () => {
  createdSockets.length = 0;
  setSocketCalls.length = 0;
  refreshCalls.length = 0;
  logoutCalls.length = 0;
  refreshImpl = async () => true;
};

test("로그인 상태면 소켓을 만들고, connect_error가 없으면 재인증도 로그아웃도 일어나지 않는다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  assert.equal(createdSockets.length, 1);
  assert.equal(refreshCalls.length, 0);
  assert.equal(logoutCalls.length, 0);

  hook.unmount();
  authState.isLoggedIn = false;
});

test("UNAUTHORIZED connect_error 한 번 + 갱신 성공은 재연결만 하고 로그아웃하지 않는다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  refreshImpl = async () => true;
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  const socket = createdSockets[0];
  await act(async () => {
    socket.fire("connect_error", { message: "UNAUTHORIZED" });
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(refreshCalls.length, 1, "갱신을 한 번 시도해야 합니다");
  assert.equal(socket.connectCallCount, 1, "갱신 성공 후 재연결을 시도해야 합니다");
  assert.equal(logoutCalls.length, 0, "정상적인 1회 재인증에는 로그아웃하면 안 됩니다");

  hook.unmount();
  authState.isLoggedIn = false;
});

test("F-03 R-IMPL #6: 갱신은 매번 성공하는데 소켓이 계속 UNAUTHORIZED면 상한 이후 재시도를 멈추고 로그아웃한다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  refreshImpl = async () => true;
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  const socket = createdSockets[0];

  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      socket.fire("connect_error", { message: "UNAUTHORIZED" });
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  assert.ok(refreshCalls.length <= 2, `갱신 성공만으로 무제한 재시도하면 안 됩니다(실제 ${refreshCalls.length}회)`);
  assert.ok(socket.connectCallCount <= 2, `재연결 시도 횟수도 상한이 있어야 합니다(실제 ${socket.connectCallCount}회)`);
  assert.equal(logoutCalls.length, 1, "상한 도달 시 사용자 상태를 로그아웃으로 정리해야 합니다");

  hook.unmount();
  authState.isLoggedIn = false;
});

test("F-03 R-IMPL #11: 정상 연결을 사이에 둔 3회 이상의 독립적인 만료·복구는 상한에 걸리지 않는다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  refreshImpl = async () => true;
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  const socket = createdSockets[0];

  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      socket.fire("connect_error", { message: "UNAUTHORIZED" });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      socket.fire("connect");
    });
  }

  assert.equal(refreshCalls.length, 3, "독립적인 만료 3번 각각이 갱신을 시도해야 합니다");
  assert.equal(socket.connectCallCount, 3, "3번 모두 재연결을 시도해야 합니다");
  assert.equal(logoutCalls.length, 0,
    "정상 연결로 매듭지어진 독립적인 만료·복구가 누적되어 상한을 오판하면 안 됩니다(F-03 R-IMPL #11)");

  hook.unmount();
  authState.isLoggedIn = false;
});

test("갱신 자체가 실패하면 즉시 재시도를 멈추고 로그아웃한다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  refreshImpl = async () => false;
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  const socket = createdSockets[0];
  await act(async () => {
    socket.fire("connect_error", { message: "UNAUTHORIZED" });
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(socket.connectCallCount, 0, "갱신 실패로 얻은 자격 없이 재연결을 시도하면 안 됩니다");
  assert.equal(logoutCalls.length, 1);

  hook.unmount();
  authState.isLoggedIn = false;
});

test("UNAUTHORIZED가 아닌 connect_error는 재인증을 시도하지 않는다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  const socket = createdSockets[0];
  await act(async () => {
    socket.fire("connect_error", { message: "transport error" });
    await Promise.resolve();
  });

  assert.equal(refreshCalls.length, 0);
  assert.equal(logoutCalls.length, 0);

  hook.unmount();
  authState.isLoggedIn = false;
});

test("cleanup(언마운트) 이후 늦게 도착한 갱신 응답은 소켓을 재연결하지 않는다", async () => {
  resetAll();
  authState.isLoggedIn = true;
  let resolveRefresh;
  refreshImpl = () => new Promise((resolve) => { resolveRefresh = resolve; });
  const hook = renderHook(() => useSocket());
  await act(async () => {});

  const socket = createdSockets[0];
  act(() => {
    socket.fire("connect_error", { message: "UNAUTHORIZED" });
  });

  hook.unmount();
  authState.isLoggedIn = false;

  await act(async () => {
    resolveRefresh(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(socket.connectCallCount, 0, "cleanup 이후에는 재연결하면 안 됩니다");
});
