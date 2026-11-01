// 백엔드 ESLint 설정 (flat config, CommonJS)
// game-core/RULES.md 규칙(파일 크기·펼친 다시 내보내기 금지·순환 require)을 자동으로 검사함
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const espree = require('espree')
const js = require('@eslint/js')
const globals = require('globals')
const { defineConfig, globalIgnores } = require('eslint/config')

// 시험 파일: 지금 자리(__tests__·*.test.js)와 옮겨 갈 자리(tests/) 둘 다 잡음
const TESTS = ['**/__tests__/**', 'tests/**', '**/*.test.{js,cjs}']

// ---- 순환 require 검사 ----
// import-x/no-cycle은 ESM만 따라가서 CommonJS require 고리를 못 찾음, 그래서 따로 만듦

// 파일마다 require 목록 보관 (mtime 바뀌면 다시 읽음)
const depCache = new Map()

// require('./x') 꼴인지 확인
function requiredPath(node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return null
  if (node.callee.name !== 'require' || node.arguments.length !== 1) return null
  const arg = node.arguments[0]
  if (arg.type !== 'Literal' || typeof arg.value !== 'string') return null
  return arg.value.startsWith('.') ? arg.value : null
}

// node가 찾는 방식 그대로 실제 파일 경로로 바꿈 (폴더면 index.js)
function resolveFrom(file, spec) {
  try {
    const target = createRequire(file).resolve(spec)
    if (!target.startsWith(__dirname) || target.includes(`${path.sep}node_modules${path.sep}`)) return null
    return /\.c?js$/.test(target) ? target : null
  } catch {
    return null
  }
}

// AST를 돌며 require를 모음, 함수 안이면 lazy(불러올 때 바로 안 돎)로 표시
function collect(node, inFn, out, file) {
  if (!node || typeof node.type !== 'string') return
  const spec = requiredPath(node)
  const to = spec && resolveFrom(file, spec)
  if (to) out.push({ to, lazy: inFn })
  const fn = inFn || /Function/.test(node.type)
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const child = node[key]
    if (Array.isArray(child)) child.forEach((c) => collect(c, fn, out, file))
    else if (child && typeof child === 'object') collect(child, fn, out, file)
  }
}

// 다른 파일의 require 목록 읽기 (디스크 기준)
function depsOf(file) {
  let mtime
  try {
    mtime = fs.statSync(file).mtimeMs
  } catch {
    return []
  }
  const hit = depCache.get(file)
  if (hit && hit.mtime === mtime) return hit.deps
  const deps = []
  try {
    const ast = espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'commonjs' })
    collect(ast, false, deps, file)
  } catch {
    // 문법 오류 파일은 고리 계산에서 뺌, 오류 자체는 그 파일 검사에서 나옴
  }
  depCache.set(file, { mtime, deps })
  return deps
}

// from에서 goal로 돌아오는 가장 짧은 길 찾기, topOnly면 함수 밖 require만 따라감
function findRoute(from, goal, topOnly) {
  const prev = new Map([[from, null]])
  const queue = [from]
  while (queue.length > 0) {
    const cur = queue.shift()
    for (const { to, lazy } of depsOf(cur)) {
      if ((topOnly && lazy) || prev.has(to)) continue
      prev.set(to, cur)
      if (to === goal) {
        const route = []
        for (let n = goal; n; n = prev.get(n)) route.unshift(n)
        return route
      }
      queue.push(to)
    }
  }
  return null
}

const rel = (file) => path.relative(__dirname, file).split(path.sep).join('/')

const noRequireCycle = {
  meta: {
    type: 'problem',
    docs: { description: 'CommonJS 순환 require 막기' },
    schema: [{ type: 'object', properties: { allowLazy: { type: 'boolean' } }, additionalProperties: false }],
    messages: {
      load: '순환 require(불러올 때 바로 돎): {{route}}',
      lazy: '순환 require(함수 안 require가 끼어 있음): {{route}}',
    },
  },
  create(context) {
    // 드라이브 글자 크기가 달라도 같은 파일로 보게 맞춤
    const file = context.physicalFilename.replace(/^[a-z]:/, (d) => d.toUpperCase())
    const allowLazy = Boolean(context.options[0]?.allowLazy)
    return {
      CallExpression(node) {
        const spec = requiredPath(node)
        const target = spec && resolveFrom(file, spec)
        if (!target || target === file) return
        const inFn = context.sourceCode.getAncestors(node).some((a) => /Function/.test(a.type))
        // 함수 밖 require로만 도는 고리가 제일 위험해서 먼저 찾음
        const loadRoute = inFn ? null : findRoute(target, file, true)
        const route = loadRoute || (allowLazy ? null : findRoute(target, file, false))
        if (!route) return
        context.report({
          node,
          messageId: loadRoute ? 'load' : 'lazy',
          data: { route: [file, ...route].map(rel).join(' → ') },
        })
      },
    }
  },
}

// ---- 규칙 ----

// module.exports = { ...require('./x') } 막기 (RULES 6: 이름을 하나씩 적음)
const NO_SPREAD_REQUIRE = {
  selector: "SpreadElement > CallExpression[callee.name='require']",
  message: '[spread-require] ...require() 대신 const { a, b } = require(...) 후 이름을 하나씩 내보냄',
}

module.exports = defineConfig([
  // 마이그레이션은 체크섬이 걸려 있어 절대 안 건드림
  globalIgnores(['db/migrations/**', 'dist', 'build', 'coverage', '.tmp*']),

  // 기본: Node 24 CommonJS, recommended(no-unused-vars·no-undef·no-useless-catch·no-empty 포함)
  {
    files: ['**/*.{js,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // 빈 catch는 주석이 있을 때만 됨 (allowEmptyCatch: false가 기본)
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  // 코드 엄격 규칙: 파일·함수 크기, 펼친 다시 내보내기, 순환 require
  {
    files: ['**/*.{js,cjs}'],
    ignores: [...TESTS, 'eslint.config.js'],
    plugins: { local: { rules: { 'no-require-cycle': noRequireCycle } } },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': ['error', NO_SPREAD_REQUIRE],
      'local/no-require-cycle': 'error',
      // 매직 넘버: 너무 많이 나와서 끔 (보고서 참고)
      'no-magic-numbers': 'off',
    },
  },
])
