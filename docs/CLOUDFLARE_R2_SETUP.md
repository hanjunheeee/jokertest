# Cloudflare R2 초기 설정 가이드

일러스트·정적 리소스를 프론트 빌드와 분리해 두고 싶을 때 쓰는 **오브젝트 스토리지**(AWS S3와 유사)입니다. 아래는 최소한으로 동작하게 만드는 순서입니다.

---

## 사전 개념

| 용어 | 설명 |
|------|------|
| **버킷(Bucket)** | 파일을 담는 컨테이너 하나 |
| **오브젝트 키(Object key)** | 버킷 안에서의 파일 경로 (예: `illustrations/chapter1/hero.webp`) |
| **엔드포인트** | R2 API 주소 (업로드·관리용 CLI/SDK에서 사용) |
| **공개 URL** | 브라우저에서 `<img src="...">` 로 불러올 수 있는 주소 (설정 방식 선택 필요) |

---

## 1. Cloudflare 계정·R2 활성화

1. [Cloudflare 대시보드](https://dash.cloudflare.com/) 로그인  
2. 좌측 메뉴에서 **R2** 선택  
3. 최초 사용 시 **결제 수단 등록·약관 동의**가 필요할 수 있습니다.

### 요금에 대한 짧은 메모

- 대시보드에 표시되는 것처럼, **무료 한도(예: 저장 용량·API 호출 횟수) 안**이면 보통 **추가 청구 없이 $0**에 가깝게 유지됩니다.  
- **한도를 넘긴 사용량**에 대해서만 과금되는 구조인 경우가 많습니다 (화면의 “additional usage” 안내 기준).  
- 카드 등록 시 **실제 결제가 아닌, 결제 수단 검증용 일시 승인(pre-authorization)** 이 잡힐 수 있습니다. 은행·카드사마다 다릅니다.  
- 정확한 조건은 **항상 당시 Cloudflare Billing·R2 안내**를 기준으로 하세요.

---

## 2. 버킷 생성

1. R2 → **Create bucket**  
2. 버킷 이름 지정  
   - 꼭 프로젝트 이름일 필요는 없고, **소문자·숫자·하이픈** 위주로 짓는 경우가 많습니다.  
   - 예: `joker-illustrations`, `joker-dev-assets`, `joker-prod-assets` (개발/운영 분리 시)  
3. 리전은 필요 시 선택 (기본값으로도 가능한 경우가 많음)

---

## 3. 자격 증명 두 가지 (헷갈리기 쉬움)

R2를 쓸 때 **서로 다른 종류**가 있습니다. 목적에 맞게 고르세요.

| 종류 | 어디서 만드나 | 주로 쓰는 곳 |
|------|----------------|--------------|
| **① R2용 S3 호환 키** (Access Key ID + Secret Access Key) | R2 화면의 **Manage R2 API Tokens** 등 (S3 API 자격 증명) | Node에서 `@aws-sdk/client-s3` 로 `PutObject` 업로드 |
| **② Cloudflare API Token** | **My Profile** → **API Tokens** → **Create Token** | Wrangler, 일부 Cloudflare API, Workers 연동 등 |

### ① S3 호환 SDK로 업로드할 때 (이 프로젝트 백엔드·스크립트에 흔함)

1. 대시보드 **R2** 로 이동  
2. **Manage R2 API Tokens** (또는 S3 API 자격 증명을 발급하는 메뉴)에서 토큰 생성  
3. 발급되는 **Access Key ID**, **Secret Access Key** 를 안전하게 보관 (재표시 안 될 수 있음)

함께 필요한 값:

- **Account ID**: 대시보드·R2 개요에서 확인  
- **S3 API 엔드포인트**: 보통 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` 형태 (공식 문서·대시보드 표기 기준)

환경 변수 예시:

```env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

프로젝트 루트의 **`.env.example`** 에 위 항목과 Docker·DB 변수까지 한 번에 넣어 둔 틀이 있습니다. 복사 후 `.env` 로 저장하고 값만 채우면 됩니다.

### ② “Create Custom Token” 으로 API Token 만들 때

**Permissions 가 비어 있으면 안 됩니다.** 두 번째 칸이 비어 있거나 `Access: …` 만 고른 채로 만들면 R2용이 아닙니다.

1. **My Profile** → **API Tokens** → **Create Token** → **Create Custom Token**  
2. **Permissions** 한 줄에서 **왼쪽부터 순서대로** 고릅니다.

   | 순서 | 칸 이름에 가까운 것 | 고를 값 (R2용) |
   |------|---------------------|----------------|
   | 1번째 | 리소스 범위 | **Account** |
   | 2번째 | 세부 권한 종류 | 아래 **「R2 검색 시」** 참고 |
   | 3번째 | 동작 수준 | **Read** (조회만) 또는 **Edit** (필요 시. 세 번째 칸이 열리면 화면 안내에 따름) |

   **`Access: Apps`** 만 보일 때는 목록을 **아래로 스크롤**해 R2 관련 줄을 찾습니다. `Choose a permission` 이 뜨면 두 번째 칸을 아직 안 고른 상태입니다.

   **「R2」로 검색했을 때 3개만 나오는 경우** (계정·UI 버전에 따라 이렇게만 보일 수 있음)

   | 항목 | 용도 |
   |------|------|
   | **Workers R2 Storage** | 일반적인 **오브젝트 스토리지(버킷·파일)** 와 연동할 때 선택하는 경우가 많음 |
   | **Workers R2 Data Catalog** | 데이터 카탈로그(Iceberg 등) 용도 — 일러스트 호스팅만 할 때는 보통 아님 |
   | **Workers R2 SQL** | R2에 대한 SQL 쿼리 기능 — 일반 업로드·정적 파일과는 별개 |

   **일러스트·정적 파일을 버킷에 두는 용도**면 위 셋 중에서는 **`Workers R2 Storage`** 가 맞습니다.  
   그런데 **Node에서 S3 SDK로 `PutObject` 업로드**만 할 거면, 이 Custom Token 경로보다 **§3 ① R2 대시보드의 S3 호환 Access Key** 를 쓰는 편이 절차상 더 직관적입니다.

3. **Account Resources** 는 가능하면 **특정 계정만** 지정하는 편이 안전합니다 (`All accounts` 는 편하지만 범위가 넓음).

> **참고:** Node에서 `PutObject` 로 파일을 올리는 방식이면, 이 **Custom Token** 보다 **§3의 ① R2에서 발급하는 S3 호환 Access Key** 가 맞는 경우가 많습니다. Custom Token은 Cloudflare **REST API**·Wrangler 등과 맞춰 쓸 때 자주 씁니다.

---

## 4. 브라우저에서 이미지 읽기 (공개 URL)

업로드만 하고 **웹에서 바로 보이게** 하려면 공개 접근 방식을 정해야 합니다. 대표적으로는 다음 중 하나입니다.

### A) `r2.dev` 공개 개발 URL (비프로덕션·테스트용)

Cloudflare가 관리하는 **`https://....r2.dev`** 주소로 버킷 내용을 인터넷에 노출합니다. **레이트 리밋이 있고, 공식 문서상 개발/비프로덕션 용도**로만 쓰는 것을 권장합니다. (캐시·WAF·봇 관리 등은 **커스텀 도메인**이 필요)

**대시보드에서 켜는 방법**

1. [R2 Overview](https://dash.cloudflare.com/) 로 이동 후 버킷 선택  
2. 버킷 페이지에서 **Settings**  
3. **Public Development URL** 섹션에서 **Enable**  
4. **Allow Public Access?** 에서 확인 문구로 `allow` 입력 후 허용  
5. 설정에 **Public Bucket URL** 이 표시되면, 객체는 보통 `공개URL/객체키경로` 형태로 접근 (버킷 루트 목록 조회는 공식적으로 제한되는 경우가 있음)

끄려면 같은 **Settings** → **Public Development URL** → **Disable** 후 `disallow` 로 확인.

### B) 커스텀 도메인 (운영에 더 적합)

도메인이 **같은 Cloudflare 계정의 Zone** 으로 추가되어 있어야 합니다.

1. R2 → 버킷 선택 → **Settings**  
2. **Custom Domains** → **Add**  
3. **연결할 호스트 이름** 은 계정 이메일이 아니라, **이미 Cloudflare에 추가된 도메인의 서브도메인**입니다. 예: `assets.example.com`, `cdn.example.com` (`example.com` 이 해당 계정의 Zone 으로 있어야 함). 입력 후 **Continue** → DNS 레코드 검토 → **Connect Domain**  
4. 상태가 **Active** 가 될 때까지 수 분 걸릴 수 있음  

객체 URL 예: `https://assets.example.com/illustrations/foo.webp`

공식 가이드: [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)

### C) Cloudflare Workers로 프록시

버킷을 비공개로 두고, Worker가 요청 시에만 객체를 내려주는 방식도 가능합니다 (구현 난이도는 조금 올라감).

프론트엔드에서는 베이스 URL만 환경 변수로 두는 패턴이 많습니다.

```env
VITE_ASSETS_BASE_URL=https://assets.example.com
```

```jsx
<img src={`${import.meta.env.VITE_ASSETS_BASE_URL}/illustrations/hero.webp`} alt="" />
```

---

## 5. 업로드 방법 (참고)

- **수동**: 대시보드에서 객체 업로드 (키 경로만 맞추면 됨)  
- **CLI**: `wrangler` 등 Cloudflare 도구로 업로드  
- **코드**: Node에서 `@aws-sdk/client-s3` 등 **S3 호환 클라이언트**로 `PutObject`  
  - 엔드포인트·리전·자격 증명을 R2 문서에 맞게 설정  
  - 리전은 종종 `auto` 로 두는 예시가 많음 (공식 문서 확인)

---

## 6. CORS (브라우저에서 직접 업로드할 때만)

**이미지 URL만 `<img>` 로 불러오는 경우**에는 보통 CORS 설정이 크게 문제되지 않습니다.  
**프론트에서 브라우저가 R2로 직접 `PUT` 업로드**하는 경우에는 버킷 CORS 규칙에 허용 출처·메서드를 추가해야 합니다.

---

## 7. 이 프로젝트와의 역할 분리

| 저장 위치 | 적합한 경우 |
|-----------|----------------|
| `frontend/public`, `src/assets` | 소량·로컬 개발·Git에 넣어도 되는 크기 |
| **R2 (+ CDN/커스텀 도메인)** | 일러스트 다수·대용량·배포 바이너리 경량화 |

Git에는 **비밀키를 넣지 말고**, `.env.example` 에 변수 이름만 두고 실제 값은 각자 `.env` 또는 배포 시 비밀 관리에 두는 것을 권장합니다.

---

## 8. 확인 체크리스트

- [ ] 버킷 생성 완료  
- [ ] 목적에 맞는 자격 증명 선택 (**① R2 S3 호환 키** vs **② Cloudflare API Token**)  
- [ ] (② 사용 시) **Permissions** 에 `Cloudflare R2` 등 필요한 권한이 실제로 들어갔는지 확인 (`Select` 빈칸 없음)  
- [ ] **①** 이라면 Access Key / Secret 발급 및 보관  
- [ ] 엔드포인트·Account ID 확인  
- [ ] 공개 읽기 URL 전략 선택 (r2.dev / 커스텀 도메인 / Worker)  
- [ ] 테스트 객체 업로드 후 브라우저에서 이미지 로드 확인  
- [ ] (직접 업로드 시) CORS 설정  

---

## 참고 링크

- [Cloudflare R2 문서](https://developers.cloudflare.com/r2/)  
- 공식 문서의 **S3 API 호환성**, **Public buckets**, **Custom domains** 항목을 배포 방식에 맞게 읽으면 됩니다.

문서 내용은 작성 시점 기준이며, Cloudflare UI·요금·정책은 변경될 수 있습니다.
