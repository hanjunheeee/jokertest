// shared/env.js만 Node에서 읽을 수 있는 형태로 갈아끼우는 ESM 로더 훅이다.
//
// env.js는 import.meta.env(Vite 빌드타임 치환)를 읽으므로 plain Node에서는 import 자체가
// 죽는다. 다른 시험들은 node:test의 mock.module로 이 모듈을 대체하지만, 그 API는
// --experimental-test-module-mocks 플래그가 있어야 한다 — DB 통합 시험은 그 플래그 없이
// `node --test <파일>`로도 단독 실행되어야 하므로(격리 DB 실행기), 플래그가 필요 없는 로더
// 훅으로 같은 경계만 대체한다.
//
// API_BASE_URL을 빈 문자열로 두는 이유: client.js가 `${BASE_URL}${endpoint}`로 최종 URL을
// 만들므로 endpoint("/auth/login")가 그대로 남고, 시험의 전달 계층(전역 fetch)이 그 경로를
// 실제 fixture 서버로 보낸다. 서버 주소는 시험이 런타임에 정하므로 여기서는 고정할 수 없다.
// 그 밖의 모듈은 하나도 건드리지 않는다.

const ENV_MODULE_SUFFIX = "/shared/env.js"

const STUB_SOURCE = `export const API_BASE_URL = ""
export const DISCORD_SUPPORT_URL = undefined
`

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(ENV_MODULE_SUFFIX)) {
    return { format: "module", source: STUB_SOURCE, shortCircuit: true }
  }
  return nextLoad(url, context)
}
