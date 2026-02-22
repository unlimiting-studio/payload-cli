---
name: payload-cli
description: Payload CMS를 @unlimiting/payload-cli로 운영할 때 사용한다. 최신 명령 체계(payload auth/status, collections list, create/list/schema/publish/unpublish/export)와 markdown 입출력(create --md --input, export --md --output), frontmatter(coverImage, publishedAt, _status 등) 기반 포스트 작성/내보내기가 필요한 요청에서 반드시 사용한다.
---

# payload-cli

이 스킬을 사용해 `payload` CLI 작업을 최신 명령 체계로 일관되게 수행하라.

## 빠른 절차

1. 설치 상태를 확인하라.
2. 인증 정보를 설정하라.
3. 컬렉션 구조를 확인하라.
4. 문서를 생성/조회/퍼블리시/내보내기 하라.
5. 실패 시 에러 패턴별로 조치하라.

## 설치 및 점검

```bash
npm install -g @unlimiting/payload-cli
payload --help
```

로컬 개발 중이면 저장소 루트에서 다음으로 실행하라.

```bash
npm install
npm link
payload --help
```

## 인증

최초 1회 로그인:

```bash
payload auth login --domain https://your-payload-domain.com --email you@example.com --password 'your-password'
```

저장 상태 확인:

```bash
payload auth status
```

기본 저장 위치:
- macOS/Linux: `~/.config/payload/credentials.json`

## 컬렉션 탐색

컬렉션 목록 조회:

```bash
payload collections list
```

특정 컬렉션 스키마 조회:

```bash
payload schema foobars
```

스키마 조회는 GraphQL introspection 우선, 실패 시 샘플 문서 기반 fallback임을 안내하라.  
group/object 필드는 하위 경로(`seo.metaTitle` 같은 형태)로 출력되는지 확인하라.

## 문서 생성/조회/상태 변경

문서 생성:

```bash
payload create foobars --title "제목" --content "본문"
```

locale 지정 생성:

```bash
payload create foobars --lang ko --title "제목" --content "본문"
```

페이징 조회:

```bash
payload list foobars --page 3 --limit 30
```

퍼블리시/언퍼블리시:

```bash
payload publish foobars 1
payload unpublish foobars 1
```

상태 필드/값이 다른 프로젝트에서는 옵션을 명시하라.

```bash
payload publish foobars 1 --status-field state --published-value live
payload unpublish foobars 1 --status-field state --draft-value hidden
```

문서 내보내기:

```bash
payload export foobars 1
payload export foobars 1 --md --output ./foobars-1.md
payload export foobars 1 -o ./foobars-1.json
```

## Markdown 워크플로우

Markdown에서 직접 생성:

```bash
payload create posts --md --input ./post.md
```

frontmatter 권장 예시:

```md
---
title: 글 제목
slug: my-post
excerpt: 요약
publishedAt: 2026-02-22T13:00:00.000Z
_status: draft
coverImage: ./cover.png
coverAlt: 커버 이미지 설명
---

본문 단락

![본문 이미지](./body.png)
```

지원 포인트:
- `coverImage`는 본문 이미지와 분리된 cover 업로드 용도다.
- `--md` 모드에서 본문 첫 이미지를 cover로 자동 추론하지 않는다.
- 본문 `![alt](./local.png)` 이미지는 `media`에 업로드 후 `upload` 노드로 치환한다.
- 원격 이미지 URL(`http/https`)은 업로드하지 않고 텍스트로 남길 수 있다.

## 실무 가이드

- 컬렉션/필드가 확정되지 않은 요청이면 먼저 `payload collections list`와 `payload schema <collection>`를 실행하라.
- `publish/unpublish` 전에는 상태 필드명이 `status`인지 확인하라.
- 운영 계정 대신 전용 서비스 계정 사용을 우선 제안하라.
- 사용자 비밀번호/토큰/쿠키는 출력하지 말고 마스킹하라.
- `create --md` 실패 시에는 필수 필드(`cover`, `publishedAt`)를 frontmatter 또는 `--data`로 채우도록 안내하라.

## 장애 대응

- `401/403`이면 `payload auth login` 재실행 후 재시도하라.
- `404`이면 도메인, 컬렉션 slug, 문서 id를 순서대로 점검하라.
- `schema` 응답이 빈 값이면 GraphQL 접근 제한 여부를 확인하고 fallback 결과로 진행하라.
- CLI 실행 오류 시 `payload --help`와 하위 명령 `--help`로 옵션 오타를 먼저 확인하라.
- `payload list`가 서버 500이면 REST 직접 호출 또는 `export <id>` 경로로 우회 검증하라.

## 릴리즈 메모

`@unlimiting/payload-cli` 릴리즈는 GitHub Actions Trusted Publish를 사용한다.
private repo 환경에서는 provenance 제약이 있을 수 있으므로, 현재 프로젝트 정책에 맞는 워크플로 설정을 우선 따르라.
