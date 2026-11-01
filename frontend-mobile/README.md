# frontend-mobile

모바일(폰 세로 우선) 화면 앱. 로직은 데스크톱 `frontend/src`를 그대로 가져다 쓰고, 화면만 새로 만듦 (계획: `reports/mobile-plan/plan.md` B안).

## 실행

| 무엇 | 포트 | 명령 |
|---|---|---|
| 백엔드 | 4000 | `npm run dev --prefix backend` |
| 데스크톱 | 5173 | `npm run dev --prefix frontend` |
| 모바일 | 5174 | `npm run dev --prefix frontend-mobile` |

1. `npm install --prefix frontend-mobile` (worktree마다 따로 필요)
2. `.env.example`을 `.env`로 복사. 값은 데스크톱 `frontend/.env`와 같음
   - `VITE_API_BASE_URL=http://localhost:4000`
   - `VITE_DISCORD_SUPPORT_URL` (고객센터, 선택)
3. 백엔드 CORS에 5174를 열어야 로그인·소켓이 붙음 (`backend/.env`의 `FRONTEND_MOBILE_URL=http://localhost:5174`, 백엔드 0-B 작업)
4. 개발 때는 `localhost`만 쓰기. `127.0.0.1`과 섞으면 쿠키가 안 실림
5. 실제 폰(같은 와이파이): `npx vite --host`, `VITE_API_BASE_URL=http://<PC IP>:4000`

- 빌드: `npm run build` (데스크톱 로직 이름이 바뀌면 "is not exported"로 여기서 잡힘)
- 검사: `npm run lint`, `npm run check:depth`

## 별칭

| 별칭 | 가리키는 곳 | 쓰는 것 |
|---|---|---|
| `@/` | `../frontend/src` | 데스크톱 로직 (api·socket·store·hooks·utils·constants) |
| `@m/` | `./src` | 모바일 화면 |

- `resolve.dedupe`: react, react-dom, react-router-dom, zustand, socket.io-client, framer-motion
  - 데스크톱 파일이 `frontend/node_modules` 쪽 판을 부르면 React·스토어가 두 벌이 됨 → 한 벌로 묶기
- `publicDir`: `../frontend/public` (그림·소리·영상 공유, 복사 금지)
  - 모바일 전용 그림은 `frontend/public/m/` 아래에
- `server.fs.allow`: 저장소 루트 (`../frontend/src`를 dev 서버가 읽게)
- Tailwind 4: 바깥 폴더는 안 훑음 → `src/app/index.css`의 `@source`로 데스크톱 `constants` 폴더·허용 컴포넌트만 염

## 기준점

| 이름 | 조건 | 대상 |
|---|---|---|
| (없음) | 기본 | 폰 세로 360~430 |
| `land:` | 가로이면서 높이 ≤ 540 | 폰 가로 |
| `short:` | 높이 ≤ 700 | 키 낮은 폰 |
| `md:` | ≥ 768 | 태블릿 세로 |
| `lg:` | ≥ 1024 | 태블릿 가로 |
| `xl:` | ≥ 1280 | 데스크톱 |

## 규칙

- **데스크톱 `frontend/src`는 읽기만.** 고칠 게 생기면 따로 모아 한 명이 처리
- **모바일은 화면만 만듦.** 소켓·HTTP 호출, 스토어, 판단 로직은 `@/`에서 가져다 씀
- 경계 규칙 (ESLint `no-restricted-imports`)
  - 금지: `@/domains/**/{components,pages,page}`, `@/shared/{ui,layouts}`, `@/app/routes`, 상대 경로로 `frontend/src` 들어가기
  - 허용 목록 (화면 폴더지만 로직): `ProtectedRoute`·`PublicAsset`·`GlobalBgmLayer`, ingame `InGamePlayerSession*`·`chat/InGameChatSession*`, `useProfileBorderEditor`
  - 경고: DOM·배치에 묶인 훅 6개 (`useMenuDismiss`, `useChatInputViewport`, `useDragScroll`, `useSetupContentScrollOnRoleModeChange`, `useScrollbarSync`, `useScrollbarThumb`) → 맞는지 보고 쓰거나 `@m/domains/<영역>/hooks/`에 따로
- 데스크톱 규칙 그대로: 파일 300줄, 소켓·HTTP 직접 호출 금지, `export *` 금지, 순환 import 금지, 폴더 깊이 6칸
- 경로는 데스크톱과 같음 (데스크톱 훅 안에 `/lobby`·`/ingame` 같은 경로 문자열이 박혀 있음)
- 주석: 개조식 명사형(~함/~음/~기), 파일 머리 2줄(무엇·누가 씀)

## 폴더

```
src/
  main.jsx                 시작점 (401 처리 등록)
  app/App.jsx              소켓·친구/알림 이벤트·글자 배율·효과음·세션 시작
  app/routes/index.jsx     모든 경로 (주인: 0단계)
  app/index.css            글꼴·색·기준점·안전영역·화면 틀
  shared/layouts/          MobileShell (100svh·안전영역·바닥 자리)
  shared/ui/               PlaceholderPage, ShellBottom (바닥 자리 portal)
  domains/<영역>/
    pages/                 경로마다 페이지 하나 (지금은 빈 자리)
    components/            모바일 화면 조각
    hooks/                 모바일 전용 훅만
```

- 바닥 고정 줄은 `<ShellBottom>...</ShellBottom>`으로 틀 바닥 자리에 넣기
- 공용 UI가 필요하면 먼저 자기 영역 폴더에 만들고, 끝난 뒤 한 번에 `shared/ui`로 올리기
