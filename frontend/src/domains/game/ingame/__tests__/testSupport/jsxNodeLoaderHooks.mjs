import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

// F-13 AC-05 재검토(CODEX-2) — 이전 회귀는 InGamePlayerBoard/InGamePlayerCard/
// MatchingPartySlots가 .jsx라 이 저장소의 `node --test` 실행에서는 렌더는커녕 resolve조차
// 되지 않는다는 이유로(vite alias 미해석) 실제 렌더 대신 raw source 정규식 검증으로
// 대체해 왔다. 이 파일은 node:module의 module.register() ESM 훅으로 그 제약 자체를
// 없앤다 — vite가 dev/build에 실제로 쓰는 oxc JSX 변환(transformWithOxc, esbuild와 동등한
// 역할)을 재사용해 .jsx를 이 프로세스 안에서 바로 import 가능한 ESM으로 바꾸고,
// frontend/vite.config.js의 "@" alias(→ src/)도 그대로 해석해, 실제 컴포넌트를 jsdom에
// 마운트하고 진짜 DOM(img src 등)을 검사할 수 있게 한다 — production 코드는 전혀 바뀌지
// 않는다(테스트 실행 방식만 확장).
const SRC_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url))

function resolveAliasedPath(specifier) {
  let target = path.join(SRC_ROOT, specifier.slice(2))
  if (!path.extname(target)) {
    for (const ext of [".jsx", ".js"]) {
      if (existsSync(target + ext)) {
        target += ext
        break
      }
    }
  }
  return target
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(resolveAliasedPath(specifier)).href, context)
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".jsx")) {
    const filePath = fileURLToPath(url)
    const source = await readFile(filePath, "utf8")
    const { transformWithOxc } = await import("vite")
    const result = await transformWithOxc(source, filePath, {
      jsx: { runtime: "automatic", importSource: "react" },
    })
    return { format: "module", source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
