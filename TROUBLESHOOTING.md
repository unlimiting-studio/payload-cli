# Payload CLI Troubleshooting

## 2026-02-23 - Markdown image upload renders as file link instead of image

### 증상
- `payload create posts --md --input <file>`로 이미지를 포함해 글을 만들면, 블로그 본문에서 이미지가 `<img>` 대신 파일 링크(`<a>filename</a>`)로 렌더링됨.

### 원인
- CLI의 `uploadMedia`가 `openAsBlob(filePath)`를 타입 지정 없이 사용해서 업로드 파트의 MIME이 `application/octet-stream`으로 저장됨.
- Payload richtext 렌더러가 업로드 미디어의 `mimeType`이 `image/*`가 아니면 이미지가 아니라 파일 링크로 표시함.

### 조치
- `src/lib/payload.js`에서 파일 확장자 기반 MIME 추론(`inferMimeType`)을 추가.
- `openAsBlob(filePath, { type: inferredMime })`로 업로드 시 명시적 MIME 전달.

### 검증
1. PNG/JPG/WebP 파일을 Markdown 본문 이미지로 포함해 문서 생성.
2. 생성된 media 문서의 `mimeType`이 `image/*`인지 확인.
3. 상세 페이지 본문에서 링크가 아닌 이미지 태그로 렌더링되는지 확인.
