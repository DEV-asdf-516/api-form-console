# api-form-console

OpenAPI(springdoc) 스펙으로 요청 폼을 자동 생성하는 Spring Boot용 API 테스트 콘솔.
의존성 하나로 springdoc + 콘솔이 함께 설치됩니다.

## 설치

```gradle
repositories { maven { url = uri('https://jitpack.io') } }
dependencies { implementation 'com.github.DEV-asdf-516:api-form-console:v0.1.0' }
```

## 사용

- 기동 후 `/api-form.html` 접속
- api-docs 경로가 기본(`/v3/api-docs`)과 다르면 화면 상단에서 수정 (브라우저별 저장됨)

## 설정

```yaml
api-form-console:
  enabled: true          # false로 끄기
  path: /api-form.html   # 서빙 경로 변경
```

## 보안 주의

이 라이브러리는 콘솔 서빙만 담당합니다. 운영 노출 차단, IP 제한 등
접근 제어는 사용하는 프로젝트에서 직접 구성해야 합니다.
