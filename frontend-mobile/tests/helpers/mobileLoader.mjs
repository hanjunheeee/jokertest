// 시험용 import 길 풀기: @/(데스크톱 src)·@m/(모바일 src)·확장자 없는 길·.jsx 변환·import.meta.env 채우기
// tests/**의 시험이 맨 위에서 불러 씀, 소스는 안 고치고 vite 설정(alias·dedupe)을 흉내 냄
// 이유: node --test는 vite alias를 모름, 정적 import는 이 파일보다 먼저 풀리므로 시험 대상은 await import()로 부름
import { registerHooks, createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const MOBILE_ROOT = fileURLToPath(new URL("../../", import.meta.url))
const MOBILE_SRC = path.join(MOBILE_ROOT, "src")
const DESKTOP_SRC = path.join(MOBILE_ROOT, "..", "frontend", "src")
const DESKTOP_REQUIRE = createRequire(path.join(MOBILE_ROOT, "..", "frontend", "package.json"))
// 리액트·스토어가 두 벌이면 훅 오류 → 모바일 node_modules 한 벌로 (vite dedupe와 같음)
const DEDUPE = ["react", "react-dom", "react-router-dom", "react-router", "zustand", "socket.io-client", "framer-motion"]
const MOBILE_PARENT = pathToFileURL(path.join(MOBILE_ROOT, "package.json")).href

// 바꿔 끼울 모듈: 파일 길 끝(/ 구분) → 모듈 글
const stubs = new Map()
export function stubModule(pathSuffix, source) {
    stubs.set(pathSuffix.split("\\").join("/"), source)
}

function withExt(target) {
    if (/\.(jsx|js|mjs)$/.test(target) && existsSync(target)) return target
    for (const ext of [".js", ".jsx"]) if (existsSync(target + ext)) return target + ext
    return target
}

function isDeduped(specifier) {
    return DEDUPE.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

let ts = null
function transpileJsx(source, filePath) {
    ts ??= DESKTOP_REQUIRE("typescript")
    return ts.transpileModule(source, {
        fileName: filePath,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, jsxImportSource: "react", module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
}

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(withExt(path.join(DESKTOP_SRC, specifier.slice(2)))).href, context)
        if (specifier.startsWith("@m/")) return nextResolve(pathToFileURL(withExt(path.join(MOBILE_SRC, specifier.slice(3)))).href, context)
        const fromSrc = /\/frontend(-mobile)?\/src\//.test(context.parentURL ?? "")
        if ((specifier.startsWith("./") || specifier.startsWith("../")) && fromSrc) {
            const target = path.join(path.dirname(fileURLToPath(context.parentURL)), specifier.split("?")[0])
            if (specifier.includes("?")) return { url: `${pathToFileURL(target).href}?raw`, format: "module", shortCircuit: true }
            return nextResolve(pathToFileURL(withExt(target)).href, context)
        }
        if (isDeduped(specifier)) return nextResolve(specifier, { ...context, parentURL: MOBILE_PARENT })
        return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
        if (!url.startsWith("file:")) return nextLoad(url, context)
        if (url.endsWith("?raw")) {
            return { format: "module", source: `export default ${JSON.stringify("")}`, shortCircuit: true }
        }
        const filePath = fileURLToPath(url)
        const normalized = filePath.split(path.sep).join("/")
        for (const [suffix, source] of stubs) {
            if (normalized.endsWith(suffix)) return { format: "module", source, shortCircuit: true }
        }
        // 그림·소리·글꼴 같은 파일은 빈 값
        if (/\.(css|png|jpe?g|webp|svg|mp3|ogg|wav|mp4|webm|woff2?)$/.test(normalized)) {
            return { format: "module", source: `export default ${JSON.stringify(normalized)}`, shortCircuit: true }
        }
        const inSrc = normalized.includes("/frontend/src/") || normalized.includes("/frontend-mobile/src/")
        if (!inSrc) return nextLoad(url, context)
        let source = readFileSync(filePath, "utf8")
        if (normalized.endsWith(".jsx")) source = transpileJsx(source, filePath)
        if (source.includes("import.meta.env")) {
            source = `import.meta.env = globalThis.__TEST_IMPORT_META_ENV ?? { DEV: false, PROD: true, MODE: "test", BASE_URL: "/" };\n${source}`
        }
        return { format: "module", source, shortCircuit: true }
    },
})
