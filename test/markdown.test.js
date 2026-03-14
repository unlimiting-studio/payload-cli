import test from 'node:test'
import assert from 'node:assert/strict'

import { markdownToPayloadDocument, payloadDocumentToMarkdown } from '../src/lib/markdown.js'

test('markdown importer preserves heading depth and list structure', async () => {
  const markdown = `---
title: 테스트 글
---

# 테스트 글

## 섹션 제목

첫 문단입니다.

- 항목 A
- 항목 B

1. 순서 1
2. 순서 2
`

  const doc = await markdownToPayloadDocument({
    markdownText: markdown,
    markdownFilePath: '/tmp/post.md',
    uploadImage: async () => null,
  })

  assert.equal(doc.title, '테스트 글')
  assert.equal(doc.content.root.children[0].type, 'heading')
  assert.equal(doc.content.root.children[0].tag, 'h2')
  assert.equal(doc.content.root.children[1].type, 'paragraph')
  assert.equal(doc.content.root.children[2].type, 'list')
  assert.equal(doc.content.root.children[2].listType, 'bullet')
  assert.deepEqual(
    doc.content.root.children[2].children.map((item) => item.children[0].children[0].text),
    ['항목 A', '항목 B'],
  )
  assert.equal(doc.content.root.children[3].type, 'list')
  assert.equal(doc.content.root.children[3].listType, 'number')
})

test('markdown exporter serializes headings and lists back to markdown', () => {
  const markdown = payloadDocumentToMarkdown({
    domain: 'https://example.com',
    doc: {
      title: '내보내기 테스트',
      content: {
        root: {
          type: 'root',
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'heading',
              tag: 'h3',
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: '소제목', version: 1 },
              ],
            },
            {
              type: 'list',
              listType: 'bullet',
              tag: 'ul',
              start: 1,
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                {
                  type: 'listitem',
                  value: 1,
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                  children: [
                    {
                      type: 'paragraph',
                      direction: 'ltr',
                      format: '',
                      indent: 0,
                      version: 1,
                      children: [
                        { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: '항목 하나', version: 1 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  })

  assert.match(markdown, /# 내보내기 테스트/)
  assert.match(markdown, /### 소제목/)
  assert.match(markdown, /- 항목 하나/)
})
