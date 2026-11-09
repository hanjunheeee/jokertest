// Node 힌트(다음 접속이 갈 서버 Node 이름) 기억·지우기와 WRONG_NODE 튕김 세기
// connection.js·nodeMove.js·useSocket이 씀, 새로고침해도 같은 Node로 바로 붙게 sessionStorage(mmc.node)에 둠
import { NODE_BOUNCE_LIMIT, NODE_BOUNCE_WINDOW_MS } from "../constants/connectionSocket.js"

const HINT_KEY = "mmc.node"

// 서버 SERVER_ID 모양(n1·s1n1 등)만 받음, 주소(?node=)에 실리므로 짧은 영문·숫자만
const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

// 힌트 주인 계정 (다른 계정이 남긴 힌트는 안 씀)
let hintAccount = null

export const isNodeId = (node) => typeof node === "string" && NODE_ID_PATTERN.test(node)

// 시험·사생활 모드처럼 저장소가 없거나 막혀도 안 터지게
function storage() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

// 지금 로그인 계정 넣기 (useSocket이 연결 만들 때)
export function setNodeHintAccount(uuid) {
  hintAccount = typeof uuid === "string" && uuid.length > 0 ? uuid : null
}

// 이 계정이 남긴 힌트만 돌려줌, 없으면 null
export function readNodeHint() {
  if (!hintAccount) return null
  try {
    const saved = JSON.parse(storage()?.getItem(HINT_KEY) ?? "null")
    return saved?.uuid === hintAccount && isNodeId(saved.node) ? saved.node : null
  } catch {
    return null
  }
}

// 옮겨 간 Node 기억 (계정 모르면 안 남김)
export function saveNodeHint(node) {
  if (!hintAccount || !isNodeId(node)) return
  try {
    storage()?.setItem(HINT_KEY, JSON.stringify({ uuid: hintAccount, node }))
  } catch {
    // 저장 못 해도 이번 연결은 그대로 감
  }
}

// 힌트 지우기 (로그아웃·튕김 한도 넘음)
export function clearNodeHint() {
  try {
    storage()?.removeItem(HINT_KEY)
  } catch {
    // 지우기 실패는 무시 (다음 읽기 때 계정이 달라 안 씀)
  }
}

// 튕김 세기: note()가 창 안 횟수를 돌려줌 (한도와 비교는 부르는 쪽)
export function createBounceCounter({
  limit = NODE_BOUNCE_LIMIT,
  windowMs = NODE_BOUNCE_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  let times = []
  return {
    limit,
    note() {
      const at = now()
      times = times.filter((t) => at - t < windowMs)
      times.push(at)
      return times.length
    },
  }
}
