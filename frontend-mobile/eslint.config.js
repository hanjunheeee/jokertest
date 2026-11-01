// 모바일 ESLint 설정 (flat config)
// 데스크톱 규칙(파일 크기·소켓/HTTP 직접 호출 금지·export * 금지·순환 import) + 데스크톱 화면 import 막기
import path from 'node:path'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { importX, createNodeResolver } from 'eslint-plugin-import-x'
import { defineConfig, globalIgnores } from 'eslint/config'
import { builtinRules } from 'eslint/use-at-your-own-risk'

const SRC = path.join(import.meta.dirname, 'src')
const DESKTOP_SRC = path.join(import.meta.dirname, '..', 'frontend', 'src')

// 묶어 내보낼 땐 이름을 하나씩 적기 (RULES 11)
const NO_EXPORT_STAR = {
  selector: 'ExportAllDeclaration[exported=null]',
  message: '[export-star] export * 대신 export { a, b } from 처럼 이름을 하나씩 적음',
}

// 모바일 src는 화면만 → 소켓·HTTP 호출은 전부 데스크톱 domains/<영역>/{socket,api} 함수로
const SOCKET_MSG = '[socket-call] 소켓 직접 호출 금지, @/domains/<영역>/socket/ 함수를 부름'
const SOCKET_METHOD = 'callee.property.name=/^(emit|on|off|once)$/'
const NO_SOCKET_CALL = [
  `CallExpression[${SOCKET_METHOD}][callee.object.name=/socket/i]`,
  `CallExpression[${SOCKET_METHOD}][callee.object.property.name=/socket/i]`,
  `CallExpression[${SOCKET_METHOD}][callee.object.property.name='current'][callee.object.object.name=/socket/i]`,
  `CallExpression[${SOCKET_METHOD}][callee.object.callee.name='getSocket']`,
].map((selector) => ({ selector, message: SOCKET_MSG }))

const FETCH_MSG = '[http-call] HTTP 직접 호출 금지, @/domains/<영역>/api/ 함수를 부름'
const NO_HTTP_CALL = [
  "CallExpression[callee.name='fetch']",
  "CallExpression[callee.object.name=/^(window|globalThis|self)$/][callee.property.name='fetch']",
  "CallExpression[callee.name='axios']",
  "CallExpression[callee.object.name='axios']",
].map((selector) => ({ selector, message: FETCH_MSG }))

// 경계 규칙: 데스크톱 화면(components·pages·ui·layouts·routes)은 못 부름, 로직만 부름
const BOUNDARY_MSG =
  '[mobile-boundary] 데스크톱 화면 import 금지. 로직(api·socket·store·hooks·utils·constants)만 @/로 부르고 화면은 @m/에 새로 만듦'
// 정규식 조각, 앞의 @/는 뺌 (gitignore식 부정 패턴은 상위 폴더가 막히면 하위 파일을 못 풀어 줘서 정규식으로 씀)
const DESKTOP_UI = [
  'domains/(.+/)?(components|pages|page)/',
  'shared/(ui|layouts)/',
  'app/routes/',
  'app/App',
  'app/index\\.css$',
  'main',
]
// 화면 폴더에 있지만 로직인 것 (그대로 씀). 파일 이름 뒤엔 확장자나 끝만 옴
const DESKTOP_UI_ALLOW = [
  'shared/ui/(ProtectedRoute|PublicAsset|GlobalBgmLayer)',
  'domains/game/ingame/components/InGamePlayerSession(Provider|Context)',
  'domains/game/ingame/components/chat/InGameChatSession(Provider|Context)',
  'domains/user/components/profileEdit/useProfileBorderEditor',
]
// 허용 목록은 앞보기 부정(?!)으로 먼저 빼고 나머지 화면 경로만 막기
const DESKTOP_UI_REGEX =
  `^@/(?!(${DESKTOP_UI_ALLOW.join('|')})(\\.[a-z]+)?$)(${DESKTOP_UI.join('|')})`
const BOUNDARY_PATTERNS = [
  { regex: DESKTOP_UI_REGEX, message: BOUNDARY_MSG },
  // 상대 경로로 데스크톱 폴더에 들어가기 막기 (별칭 우회)
  { regex: '(^|/)frontend/src(/|$)', message: '[mobile-boundary] 데스크톱 파일은 상대 경로 말고 @/ 별칭으로 부름' },
]

// DOM·배치에 묶인 데스크톱 훅 6개: 막지는 않고 경고 (모바일 배치에 맞는지 보고 쓰거나 @m/에 따로 만들기)
const DOM_HOOK_MSG = '[mobile-dom-hook] 데스크톱 화면 배치에 묶인 훅. 모바일에서 그대로 맞는지 확인하거나 @m/domains/<영역>/hooks/에 따로 만들기'
const DOM_HOOKS = [
  '@/domains/game/ingame/hooks/cardMenu/useMenuDismiss*',
  '@/domains/game/ingame/hooks/useChatInputViewport*',
  '@/domains/game/ingame/hooks/useDragScroll*',
  '@/domains/game/setup/hooks/useSetupContentScrollOnRoleModeChange*',
  '@/domains/settings/hooks/useScrollbarSync*',
  '@/shared/hooks/useScrollbarThumb*',
]

// 같은 규칙을 다른 심각도(warn)로 한 번 더 걸려고 이름만 바꿔 등록
const mobileBoundary = {
  rules: { 'dom-hooks': builtinRules.get('no-restricted-imports') },
}

export default defineConfig([
  // 빌드 결과물·임시 복사본은 안 봄
  globalIgnores(['dist', 'build', 'coverage', '.tmp*']),

  // 기본: 데스크톱과 같음 (react-hooks, react-refresh)
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

  // 화면 코드 엄격 규칙 + 경계 규칙
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'import-x': importX, 'mobile-boundary': mobileBoundary },
    settings: {
      'import-x/extensions': ['.js', '.jsx', '.mjs'],
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.js', '.jsx', '.mjs', '.json'],
          alias: { '@': [DESKTOP_SRC], '@m': [SRC] },
        }),
      ],
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'no-restricted-syntax': ['error', NO_EXPORT_STAR, ...NO_SOCKET_CALL, ...NO_HTTP_CALL],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'socket.io-client', message: SOCKET_MSG },
            { name: 'axios', message: FETCH_MSG },
          ],
          patterns: BOUNDARY_PATTERNS,
        },
      ],
      'mobile-boundary/dom-hooks': ['warn', { patterns: [{ group: DOM_HOOKS, message: DOM_HOOK_MSG }] }],
      'no-magic-numbers': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },

  // 설정·스크립트 파일은 node에서 돎
  {
    files: ['*.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
])
