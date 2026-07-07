# api-form.html HTML/CSS/JS 분리 수정 방안

> 작성일: 2026-07-07 · 대상 버전: 0.1.0 → 0.2.0 제안
> 목적: 780줄 단일 HTML을 역할별 3개 파일로 분리하되, **동작·URL 완전 호환**을 유지한다.
> **결정(2026-07-07): Step 3은 B안(고정 파일 리졸버) 채택 — 적용 완료.**

## 1. 배경과 목표

`src/main/resources/api-form-console/api-form.html` 한 파일에 스타일·마크업·스크립트가 모두 들어 있다.

| 섹션 | 라인 범위 | 분량 |
|---|---|---|
| CSS (`<style>`) | 8–104 | 약 97줄 |
| 마크업 (`<body>`) | 107–180 | 약 74줄 |
| JS (`<script>`) | 182–778 | 약 597줄 |

**목표**
- 역할별 3파일 분리: `api-form.html` / `api-form.css` / `api-form.js`
- 런타임 동작·기본 URL(`/api-form.html`) 무변경
- 번들러·npm 등 빌드 도구 미도입 (라이브러리의 "의존성 하나" 단순성 유지)

## 2. 현재 서빙 구조 진단 — 분리 전 반드시 이해할 제약

### 2.1 매핑이 "정확히 한 URL"만 서빙한다

`ApiFormConsoleAutoConfiguration.addResourceHandlers`:

```java
registry.addResourceHandler(properties.getPath())        // 기본값 "/api-form.html"
        .addResourceLocations("classpath:/api-form-console/");
```

와일드카드가 없는 **정확 URL 매핑**이다. 이 경우 Spring MVC는 요청 전체 경로를
location 뒤에 그대로 이어 붙여 리소스를 찾는다(관례적인 favicon 매핑
`addResourceHandler("/favicon.ico").addResourceLocations("classpath:/")`가 동작하는 것과
같은 원리). 즉:

```
GET /api-form.html  →  classpath:/api-form-console/ + /api-form.html  →  적중 ✓
GET /api-form.css   →  매핑 자체가 없음                                →  404 ✗
```

**따라서 CSS/JS를 파일로 분리하면 Java 매핑 수정이 필수다.** HTML만 쪼개고 배포하면
화면이 스타일 없는 깡통으로 뜬다.

### 2.2 (부수 발견) `path` 프로퍼티는 기본값 외에 동작하지 않을 가능성이 높다

위 원리의 따름정리: URL 전체 경로가 classpath 경로에 그대로 메아리(echo)되므로,
`path: /console.html`로 바꾸면 `classpath:/api-form-console/console.html`을 찾게 되어
404가 난다. **기본값 `/api-form.html`이 동작하는 것은 URL과 실제 파일명이 우연히
일치하기 때문이다.**

검증 방법 (호스트 앱에서 1분):

```yaml
api-form-console:
  path: /console.html   # 기본값이 아닌 아무 값
```

기동 후 `/console.html`이 404이면 분석대로다. README가 "서빙 경로 변경"을 안내하고
있으므로, 이번 리팩토링에서 함께 고치는 것을 권장한다(§4 Step 3 권장안이 해결).

## 3. 목표 구조

```
src/main/resources/api-form-console/
├── api-form.html   ← 마크업 + <link>/<script src> 참조만
├── api-form.css    ← 기존 <style> 내용 그대로
└── api-form.js     ← 기존 <script> 내용 그대로
```

**URL 설계** — HTML이 서빙되는 디렉토리에 css/js를 나란히 둔다:

```
{path}                          예: /api-form.html
{path의 디렉토리}api-form.css   예: /api-form.css
{path의 디렉토리}api-form.js    예: /api-form.js
```

HTML에서는 **상대 경로**로 참조한다(`href="api-form.css"`, 선행 `/` 금지).
상대 참조는 "현재 문서 URL의 디렉토리" 기준으로 해석되므로, path를 어디로 옮겨도
css/js URL이 자동으로 따라간다.

파일명을 `style.css`/`app.js`가 아닌 `api-form.*`으로 유지하는 이유: 이 URL들은 호스트
앱의 루트 레벨에 노출되므로, 프리픽스가 있어야 호스트 정적 리소스와 충돌하지 않는다.

## 4. 단계별 수정 방안

### Step 1 — CSS 분리 (기계적 이동, 동작 무변경)

1. `api-form.html`의 `<style>` 내용(8–104행)을 `api-form.css`로 그대로 이동
   (`:root` 변수, 주석 포함 무수정).
2. `<head>`의 `<style>...</style>` 자리에:

```html
<link rel="stylesheet" href="api-form.css">
```

### Step 2 — JS 분리 (기계적 이동, 동작 무변경)

1. `<script>` 내용(182–778행)을 `api-form.js`로 그대로 이동.
   첫 줄 `'use strict';` 유지.
2. `</body>` 직전 기존 위치에:

```html
<script src="api-form.js"></script>
```

- 스크립트 위치를 그대로 두므로 `defer` 불필요 — 실행 시점이 현재와 동일하다
  (DOM 파싱 완료 후). `<head>` + `defer`로 옮겨도 등가이나, 이동 최소화를 권장.
- `type="module"` 전환은 이번 범위에서 제외한다. 전역 스코프가 파일 스코프로 바뀌는
  의미 변화가 있고, 스크립트가 1개뿐인 현재는 이득이 없다. JS를 여러 파일로 쪼갤
  필요가 생기는 시점에 함께 도입한다.

### Step 3 — 리소스 매핑 수정 (필수)

두 안 중 택일. **권장은 B안.**

#### A안 — 최소 변경 (echo 관례 유지)

```java
registry.addResourceHandler(properties.getPath(), "/api-form.css", "/api-form.js")
        .addResourceLocations("classpath:/api-form-console/");
```

- 장점: 3줄 변경으로 끝.
- 한계: css/js URL이 루트 고정이라 `path`를 다른 디렉토리로 옮기면 상대 참조가
  깨진다. §2.2의 `path` 잠재 이슈도 그대로 남는다.

#### B안 — 권장: URL과 classpath 파일의 결합을 끊는 고정 파일 리졸버

각 URL이 요청 경로와 무관하게 **정해진 classpath 파일 하나**를 서빙하게 한다.
`path` 커스터마이즈 문제(§2.2)까지 함께 해결된다.

```java
@Override
public void addResourceHandlers(ResourceHandlerRegistry registry) {
    String htmlUrl = properties.getPath();                    // 예: /api-form.html, /debug/console.html
    String dir = htmlUrl.substring(0, htmlUrl.lastIndexOf('/') + 1);

    serveFixedFile(registry, htmlUrl,              "api-form.html");
    serveFixedFile(registry, dir + "api-form.css", "api-form.css");
    serveFixedFile(registry, dir + "api-form.js",  "api-form.js");
}

private void serveFixedFile(ResourceHandlerRegistry registry, String url, String filename) {
    registry.addResourceHandler(url)
            .addResourceLocations("classpath:/api-form-console/")
            .setCacheControl(CacheControl.noCache())          // §5-4 캐시 이슈 예방 (재검증 요구)
            .resourceChain(false)
            .addResolver(new PathResourceResolver() {
                @Override
                protected Resource getResource(String resourcePath, Resource location) throws IOException {
                    Resource r = location.createRelative(filename);
                    return r.isReadable() ? r : null;
                }
            });
}
```

- `PathResourceResolver#getResource` 오버라이드는 SPA fallback 등에 쓰이는 공식 확장
  지점이다. 요청 경로 대신 고정 파일명을 해석하므로 echo 의존이 사라진다.
- 추가 import: `org.springframework.http.CacheControl`,
  `org.springframework.core.io.Resource`,
  `org.springframework.web.servlet.resource.PathResourceResolver`, `java.io.IOException`.
- 방어 처리(선택): `path`에 선행 `/`가 없으면 붙여 정규화.

#### 비교

| | A안 (최소) | B안 (권장) |
|---|---|---|
| 변경량 | 3줄 | ~20줄 |
| 기본 URL 호환 | ✓ | ✓ |
| `path` 커스터마이즈 | 여전히 깨짐 | 정상 동작 |
| URL-파일명 결합 | 유지 (암묵적) | 제거 (명시적) |

> 참고 — 검토 후 기각한 대안: 디렉토리 프리픽스 매핑(`/api-form/**`)은 콘솔 URL이
> `/api-form/api-form.html`로 바뀌어 기존 사용자·README와 어긋난다. 하위 호환을 위해
> 기존 URL 매핑을 병행하면 오히려 A/B안보다 복잡해진다.

### Step 4 — 문서·메타 갱신

- README: 사용법의 URL 안내는 그대로, `path` 설정 예시가 B안 채택 시 실제로 동작함을
  반영. 필요하면 "css/js는 html과 같은 디렉토리에서 서빙됨" 한 줄 추가.
- `ApiFormConsoleProperties.path` Javadoc에 규칙 명시(선행 `/` 필요 등).
- `build.gradle` version `0.2.0` (서빙 매핑 변경 포함이므로 patch보다 minor 승급이 적절).

## 5. 함정과 주의사항

1. **상대 경로**: `<link>`/`<script>`의 `href/src`에 선행 `/`를 쓰면 컨텍스트 경로나
   커스텀 path에서 깨진다. 반드시 `api-form.css` 형태의 상대 참조.
2. **인코딩**: js/css에 한글 주석·문자열이 있다. 파일을 UTF-8로 저장해야 한다.
   외부 js/css는 문서 인코딩(UTF-8 `<meta charset>`)을 상속하므로 런타임은 안전.
3. **Gradle 리소스 필터링 금지**: `api-form.js`에는 `` `HTTP ${res.status}` `` 같은
   템플릿 리터럴이 많다. 이후 누군가 `processResources { expand(...) }`를 추가하면
   `${}`가 치환되어 파일이 조용히 망가진다. 필터링을 켜야 할 일이 생기면 이 두 파일은
   반드시 제외할 것.
4. **브라우저 캐시**: 라이브러리 버전업 후 호스트 앱을 재배포해도 브라우저가 구버전
   js/css를 캐시할 수 있다(단일 파일 시절에는 없던 문제). B안의
   `CacheControl.noCache()`(매 요청 재검증, Last-Modified 기반 304)로 예방한다.
   A안 채택 시에는 `<link href="api-form.css?v=0.2.0">`처럼 버전 쿼리를 붙이는 방법도
   있으나 릴리스마다 수동 갱신이 필요해 비권장.
5. **`[Added]`/`[Modified]` 주석 마커**: 분리 이동 시 유지 여부를 결정할 것.
   git 이력이 변경 추적을 대신하므로 이동하는 김에 정리하는 것을 제안(선택).
6. **jar 패키징**: 새 파일 2개가 jar에 포함되는지 확인 필요(§6). `processResources`는
   디렉토리 전체를 복사하므로 기본적으로 자동 포함된다.
7. **springdoc 정적 리소스와의 충돌**: swagger-ui는 `/swagger-ui/**` 등 별도 경로라
   무관. 충돌 없음.

## 6. 검증 체크리스트

```bash
# 1) JS 문법
node --check src/main/resources/api-form-console/api-form.js

# 2) 패키징 — 3파일 포함 확인
./gradlew clean jar && jar tf build/libs/api-form-console-*.jar | grep api-form-console/

# 3) 로컬 배포 후 호스트 앱에서
./gradlew publishToMavenLocal
```

호스트 앱 스모크 테스트:

- [ ] `GET /api-form.html` 200 + `text/html`
- [ ] `GET /api-form.css` 200 + `text/css`, `GET /api-form.js` 200 + `text/javascript`
- [ ] 화면 스타일 정상 (분리 누락 시 즉시 깡통 화면으로 드러남)
- [ ] 기능 스모크: 스펙 로드 → 폼 생성 → 미리보기 토글(펼침/접힘) → 복사 체크 아이콘
      → JSON 붙여넣기/폼에 적용 → 요청 전송
- [ ] (B안) `path: /debug/console.html` 설정 후 `/debug/console.html`·`/debug/api-form.css` 정상
- [ ] 응답 헤더에 `Cache-Control: no-cache` 확인 (B안)
- [ ] 호스트 앱에 `spring.web.resources.add-mappings=false`가 있어도 동작
      (라이브러리가 직접 등록하는 매핑이므로 무관해야 정상 — 기존 보장 유지 확인)

## 7. 커밋 / 릴리스 전략

각 단계가 독립적으로 검증 가능하도록 분리 커밋을 권장:

1. **커밋 1** — 현재 워킹트리의 UI 개선분(미리보기/붙여넣기 토글, 복사 아이콘 버튼).
   분리 작업과 섞이면 리뷰가 불가능해지므로 반드시 먼저 커밋.
2. **커밋 2** — CSS/JS 파일 분리. "내용 이동만 있고 수정은 없다"가 리뷰 포인트
   (`git diff --color-moved`로 이동 여부 확인 가능).
3. **커밋 3** — 리소스 매핑 개선(Step 3) + README/버전 갱신.

릴리스: 커밋 3까지 묶어 `v0.2.0` 태그 → JitPack.

## 8. 이번에 하지 않는 것 (비범위)

- **npm/번들러/minify 도입** — 597줄 개발 도구에 과한 인프라. JitPack 빌드 단순성과
  "정적 리소스 서빙만 한다"는 라이브러리 성격을 해친다.
- **JS 다중 파일 분할·모듈화** — 파일 1개 유지. 규모가 더 커지면 `type="module"`
  전환과 함께 검토.
- **템플릿 엔진·프레임워크 도입** — 해당 없음.
