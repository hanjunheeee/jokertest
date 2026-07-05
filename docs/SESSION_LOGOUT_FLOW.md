# 세션 확인 / 로그아웃 처리 흐름

세션 확인은 앱 시작 시 `GET /auth/me`로 쿠키 유효성을 검증하고, 로그아웃은 `POST /auth/logout`으로 세션 기록과 쿠키 제거를 처리합니다.

세션 확인과 로그아웃은 서로 다른 진입점이므로 각각 분리해 크게 보이도록 구성했습니다.

관련 파일:

- `frontend/src/app/App.jsx`
- `frontend/src/domains/auth/api/auth.js`
- `frontend/src/domains/auth/store/authStore.js`
- `frontend/src/shared/api/client.js`
- `backend/routes/auth.routes.js`
- `backend/middleware/auth.middleware.js`
- `backend/controller/user.controller.js`
- `backend/repositories/user.repositories.js`

---

## 1. 앱 시작 시 세션 확인 여부 결정

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["App.jsx 마운트"] --> B{"authStore.isLoggedIn 인가?"}
    B -- "아니오" --> C["세션 확인 생략"]
    B -- "예" --> D{"단순 reload 인가?"}
    D -- "예" --> C
    D -- "아니오" --> E["getMeApi<br/>GET /auth/me"]

    style C fill:#fff3cd,stroke:#9c7a20,color:#5a4210
    style E fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

`sessionStorage`의 `RELOAD_FLAG`로 새 탭/재시작과 단순 새로고침을 구분합니다.

---

## 2. `/auth/me` 쿠키 검증

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["GET /auth/me"] --> B["verifyToken"]
    B --> C["accessToken 쿠키 검증"]
    C --> D{"JWT 유효?"}
    D -- "아니오" --> E["401"]
    E --> F["client.logout + /login"]
    D -- "예" --> G["user.controller.me"]
    G --> H["{ uuid, role } 반환"]

    style E fill:#f8d7da,stroke:#9c3b36,color:#5a1f1c
    style H fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
```

`/auth/me` 응답은 유저 전체가 아니라 `{ uuid, role }`만 반환합니다.

---

## 3. 로그아웃 요청 처리

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["로그아웃 요청"] --> B["logoutApi"]
    B --> C["POST /auth/logout"]
    C --> D["verifyToken"]
    D --> E{"JWT 유효?"}

    E -- "아니오" --> F["401<br/>이미 인증 없음"]
    E -- "예" --> G["user.controller.logout"]
    G --> H["recordLogout(req.user.uuid)"]
    H --> I["clearCookie(accessToken)"]
    I --> J["200<br/>성공적으로 로그아웃"]

    style F fill:#f8d7da,stroke:#9c3b36,color:#5a1f1c
    style J fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
```

로그아웃은 `verifyToken`을 통과해야 DB에 기록됩니다.
토큰이 없거나 만료되면 공통 401 처리 흐름으로 떨어집니다.

---

## 실제 코드에서 주의할 점 3가지

1. **reload는 세션 재검증을 건너뜁니다.** `sessionStorage`의 `RELOAD_FLAG`로 새 탭/재시작과 단순 새로고침을 구분합니다.
2. **`/auth/me` 응답은 유저 전체가 아니라 `{ uuid, role }`만 반환합니다.** 닉네임 같은 화면용 정보는 로그인 응답 또는 프로필 API를 사용합니다.
3. **로그아웃은 `verifyToken`을 통과해야 DB에 기록됩니다.** 토큰이 없거나 만료되면 공통 401 처리 흐름으로 떨어집니다.

---

## 단계별 코드 위치

| 단계 | 파일:라인 | 내용 |
| --- | --- | --- |
| 앱 세션 확인 | `App.jsx:17-43` | 앱 시작 시 `getMeApi`, 실패하면 store logout |
| 세션 API | `auth.js:23-25` | `GET /auth/me` |
| 로그아웃 API | `auth.js:28-30` | `POST /auth/logout` |
| 인증 미들웨어 | `auth.middleware.js` | 쿠키의 `accessToken` 검증 |
| 세션 응답 | `user.controller.js:65-78` | `req.user`에서 uuid/role 반환 |
| 로그아웃 처리 | `user.controller.js:84-96` | `recordLogout`, 쿠키 제거 |
