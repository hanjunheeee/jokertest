import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

// Test-only JSX transformation uses pure JavaScript TypeScript transpilation.
// Native Oxc transforms in async loader workers intermittently exited with
// Windows access violation 0xC0000005 after assertions had passed.
// Keep production Vite configuration unchanged and retain actual component tests.
const SRC_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url))

// path.extname()은 마지막 "."부터를 확장자로 본다 — "auth.store"처럼 실제 확장자가 없는
// 파일 basename에 점이 포함되면(이 저장소의 *.store.js 관례) extname이 ".store"처럼 잘못
// 잡혀 실제 확장자(.js/.jsx) 보완을 건너뛰는 버그가 있었다(F-13 CODEX-4에서 발견 — auth.store
// import가 "존재하지 않음"으로 실패). 이미 .js/.jsx로 끝나는지만 명시적으로 검사한다.
function withResolvedJsExtension(target) {
  if (/\.(jsx|js)$/.test(target)) return target
  for (const ext of [".jsx", ".js"]) {
    if (existsSync(target + ext)) return target + ext
  }
  return target
}

function resolveAliasedPath(specifier) {
  return withResolvedJsExtension(path.join(SRC_ROOT, specifier.slice(2)))
}

// F-13(CODEX-4): "@/" alias가 아닌 평범한 상대 경로(예: "../../../shared/ui/PublicAsset",
// 이 저장소의 일부 .jsx가 확장자 없이 쓴다)도 vite dev/build에서는 암묵적으로 .jsx/.js를
// 찾아주지만, Node ESM 기본 리졸버는 확장자 없는 상대 지정자를 해석하지 못해
// ERR_MODULE_NOT_FOUND로 죽는다 — "@/" 전용이던 확장자 보완을 상대 경로에도 그대로
// 적용한다(이미 확장자가 있거나 패키지 지정자면 손대지 않는다).
function resolveExtensionlessRelativePath(specifier, parentURL) {
  const parentPath = fileURLToPath(parentURL)
  return withResolvedJsExtension(path.join(path.dirname(parentPath), specifier))
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(resolveAliasedPath(specifier)).href, context)
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.(jsx|js)$/.test(specifier) && context.parentURL) {
    return nextResolve(pathToFileURL(resolveExtensionlessRelativePath(specifier, context.parentURL)).href, context)
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".jsx")) {
    const filePath = fileURLToPath(url)
    const source = await readFile(filePath, "utf8")
    const { default: ts } = await import("typescript")
    const result = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "react",
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    return { format: "module", source: result.outputText, shortCircuit: true }
  }
  return nextLoad(url, context)
}
