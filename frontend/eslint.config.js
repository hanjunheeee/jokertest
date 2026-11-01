// 프론트 ESLint 설정 (flat config)
// RULES.md 규칙(파일 크기·소켓/API 분리·export * 금지·순환 import)을 자동으로 검사함
import path from 'node:path'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { importX, createNodeResolver } from 'eslint-plugin-import-x'
import { defineConfig, globalIgnores } from 'eslint/config'

const SRC = path.join(import.meta.dirname, 'src')

// 시험 파일: 지금 자리(__tests__)와 옮겨 갈 자리(tests/) 둘 다 잡음
const TESTS = ['**/__tests__/**', 'tests/**', '**/*.test.{js,jsx,mjs}']

// 소켓 보내기·받기, HTTP 요청만 모아 두는 폴더
const SOCKET_DIRS = ['src/domains/**/socket/**', 'src/shared/socket/**']
const API_DIRS = ['src/domains/**/api/**', 'src/shared/api/**']

// 묶어 내보낼 땐 이름을 하나씩 적기 (RULES 11)
const NO_EXPORT_STAR = {
  selector: 'ExportAllDeclaration[exported=null]',
  message: '[export-star] export * 대신 export { a, b } from 처럼 이름을 하나씩 적음',
}

// socket.emit / socket.on / socket.off / getSocket().emit 직접 호출 막기 (RULES 2)
const SOCKET_MSG = '[socket-call] 소켓 직접 호출 금지, domains/<영역>/socket/ 함수를 부름'
const SOCKET_METHOD = 'callee.property.name=/^(emit|on|off|once)$/'
const NO_SOCKET_CALL = [
  `CallExpression[${SOCKET_METHOD}][callee.object.name=/socket/i]`,
  `CallExpression[${SOCKET_METHOD}][callee.object.property.name=/socket/i]`,
  `CallExpression[${SOCKET_METHOD}][callee.object.property.name='current'][callee.object.object.name=/socket/i]`,
  `CallExpression[${SOCKET_METHOD}][callee.object.callee.name='getSocket']`,
].map((selector) => ({ selector, message: SOCKET_MSG }))

// fetch / axios 직접 호출 막기 (RULES 2)
const FETCH_MSG = '[http-call] HTTP 직접 호출 금지, domains/<영역>/api/ 함수를 부름'
const NO_HTTP_CALL = [
  "CallExpression[callee.name='fetch']",
  "CallExpression[callee.object.name=/^(window|globalThis|self)$/][callee.property.name='fetch']",
  "CallExpression[callee.name='axios']",
  "CallExpression[callee.object.name='axios']",
].map((selector) => ({ selector, message: FETCH_MSG }))

// 소켓 연결 만들기·axios 가져오기도 같은 폴더 안에서만
const SOCKET_IMPORT = { name: 'socket.io-client', message: SOCKET_MSG }
const AXIOS_IMPORT = { name: 'axios', message: FETCH_MSG }

export default defineConfig([
  // 빌드 결과물·다른 작업이 만든 임시 복사본은 안 봄
  globalIgnores(['dist', 'build', 'coverage', '.tmp*']),

  // 기본: 예전 설정 그대로 (react-hooks, react-refresh)
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // 화면 코드 엄격 규칙: 파일·함수 크기, 순환 import, 소켓/API 분리, export * 금지
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: TESTS,
    plugins: { 'import-x': importX },
    settings: {
      'import-x/extensions': ['.js', '.jsx', '.mjs'],
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.js', '.jsx', '.mjs', '.json'],
          alias: { '@': [SRC] },
        }),
      ],
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'no-restricted-syntax': ['error', NO_EXPORT_STAR, ...NO_SOCKET_CALL, ...NO_HTTP_CALL],
      'no-restricted-imports': ['error', { paths: [SOCKET_IMPORT, AXIOS_IMPORT] }],
      // 매직 넘버: 너무 많이 나와서 끔 (보고서 참고)
      'no-magic-numbers': 'off',
    },
  },

  // socket/ 폴더: 소켓 호출은 됨, HTTP는 여전히 막음
  {
    files: SOCKET_DIRS,
    ignores: TESTS,
    rules: {
      'no-restricted-syntax': ['error', NO_EXPORT_STAR, ...NO_HTTP_CALL],
      'no-restricted-imports': ['error', { paths: [AXIOS_IMPORT] }],
    },
  },

  // api/ 폴더: HTTP 호출은 됨, 소켓은 여전히 막음
  {
    files: API_DIRS,
    ignores: TESTS,
    rules: {
      'no-restricted-syntax': ['error', NO_EXPORT_STAR, ...NO_SOCKET_CALL],
      'no-restricted-imports': ['error', { paths: [SOCKET_IMPORT] }],
    },
  },

  // 시험: node + jsdom에서 돌아서 두 환경 전역을 다 씀, 엄격 규칙은 안 걸음
  {
    files: TESTS,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // 설정·스크립트 파일은 node에서 돎
  {
    files: ['*.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
])
