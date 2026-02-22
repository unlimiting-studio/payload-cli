---
name: payload-cli
description: Payload CMS 콘텐츠를 CLI로 다룰 때 사용하는 스킬이다. 인증/컬렉션 조회/문서 생성·조회·상태변경·내보내기와, Markdown 기반 작성/내보내기(create --md --input, export --md --output)를 빠르게 수행해야 할 때 사용한다.
---

# payload-cli

`payload` CLI를 사용자 관점의 콘텐츠 작업 흐름으로 실행한다.

## 기본 흐름

1. 인증 상태 확인: `payload auth status`
2. 컬렉션 파악: `payload collections list`, `payload schema <collection>`
3. 작업 실행: `create/list/publish/unpublish/export`
4. Markdown 작업 시 `--md`와 파일 입출력 옵션 사용

## 핵심 명령

```bash
payload auth login --domain https://your-payload-domain.com --email you@example.com
payload auth status

payload collections list
payload schema posts

payload create posts --title "제목" --content "본문"
payload list posts --page 1 --limit 20

payload publish posts 1
payload unpublish posts 1

payload export posts 1
payload export posts 1 -o ./post-1.json
payload export posts 1 --md --output ./post-1.md
```

## Markdown 작성/내보내기

작성:

```bash
payload create posts --md --input ./post.md
```

내보내기:

```bash
payload export posts 1 --md --output ./post-1.md
```

frontmatter 예시:

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

노트:
- `coverImage`는 cover 전용이며, 본문 이미지와 분리된다.
- `--md` 모드에서 본문 첫 이미지를 cover로 자동 지정하지 않는다.
- 본문의 로컬 이미지(`![alt](./file.png)`)는 자동 업로드되어 본문 `upload` 노드로 변환된다.
