import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url))

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

function resolveExtensionlessRelativePath(specifier, parentURL) {
  const parentPath = fileURLToPath(parentURL)
  return withResolvedJsExtension(path.join(path.dirname(parentPath), specifier))
}

const RAW_QUERY = "?raw"

function resolveRawSpecifierPath(specifier, parentURL) {
  const bare = specifier.slice(0, -RAW_QUERY.length)
  if (bare.startsWith("@/")) return path.join(SRC_ROOT, bare.slice(2))
  return path.join(path.dirname(fileURLToPath(parentURL)), bare)
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(RAW_QUERY) && (specifier.startsWith("@/") || specifier.startsWith("./") || specifier.startsWith("../"))) {
    const absolutePath = resolveRawSpecifierPath(specifier, context.parentURL)
    return {
      url: `${pathToFileURL(absolutePath).href}${RAW_QUERY}`,
      format: "module",
      shortCircuit: true,
    }
  }
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(resolveAliasedPath(specifier)).href, context)
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.(jsx|js)$/.test(specifier) && context.parentURL) {
    return nextResolve(pathToFileURL(resolveExtensionlessRelativePath(specifier, context.parentURL)).href, context)
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(RAW_QUERY)) {
    const filePath = fileURLToPath(url.slice(0, -RAW_QUERY.length))
    const raw = await readFile(filePath, "utf8")
    return { format: "module", source: `export default ${JSON.stringify(raw)}`, shortCircuit: true }
  }
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
