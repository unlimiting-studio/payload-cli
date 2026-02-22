import path from 'node:path'

function createTextNode(text) {
  return {
    type: 'text',
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text,
    version: 1,
  }
}

function createParagraphNode(text) {
  return {
    type: 'paragraph',
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: [createTextNode(text)],
  }
}

function createHeadingNode(text) {
  return {
    type: 'heading',
    tag: 'h1',
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: [createTextNode(text)],
  }
}

function createUploadNode(mediaId) {
  return {
    type: 'upload',
    version: 1,
    relationTo: 'media',
    value: mediaId,
  }
}

function parseBlocks(markdownText) {
  return markdownText
    .split(/\r?\n\r?\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

function stripQuotes(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(markdownText) {
  const match = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) {
    return {
      frontmatter: {},
      body: markdownText,
    }
  }

  const frontmatter = {}
  const lines = match[1].split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    frontmatter[key] = stripQuotes(rawValue)
  }

  return {
    frontmatter,
    body: markdownText.slice(match[0].length),
  }
}

function extractHeading(text) {
  const match = text.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

function extractPlainTextFromNode(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return node.text || ''
  if (Array.isArray(node.children)) {
    return node.children.map(extractPlainTextFromNode).join('')
  }
  return ''
}

function toAbsoluteUrl(domain, maybePath) {
  if (!maybePath || typeof maybePath !== 'string') return ''
  if (maybePath.startsWith('http://') || maybePath.startsWith('https://')) return maybePath
  if (maybePath.startsWith('/')) return `${domain}${maybePath}`
  return maybePath
}

export async function markdownToPayloadDocument({
  markdownText,
  markdownFilePath,
  uploadImage,
}) {
  const { frontmatter, body } = parseFrontmatter(markdownText)
  const blocks = parseBlocks(body)
  const children = []
  let title = null
  let excerpt = null

  for (const block of blocks) {
    const heading = block.match(/^#\s+(.+)$/)
    if (heading) {
      const headingText = heading[1].trim()
      if (!title) {
        title = headingText
      } else {
        children.push(createHeadingNode(headingText))
      }
      continue
    }

    const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) {
      const alt = image[1].trim() || 'image'
      const src = image[2].trim()
      const resolvedPath =
        src.startsWith('http://') || src.startsWith('https://') || path.isAbsolute(src)
          ? src
          : path.resolve(path.dirname(markdownFilePath), src)

      const uploaded = await uploadImage({ alt, src, resolvedPath })
      if (uploaded?.id) {
        children.push(createUploadNode(uploaded.id))
      } else {
        children.push(createParagraphNode(`![${alt}](${src})`))
      }
      continue
    }

    const paragraph = block.replace(/\r?\n/g, ' ').trim()
    if (!paragraph) continue
    if (!excerpt) excerpt = paragraph
    children.push(createParagraphNode(paragraph))
  }

  return {
    frontmatter,
    title:
      title ||
      extractHeading(body) ||
      path.basename(markdownFilePath, path.extname(markdownFilePath)),
    excerpt: excerpt || '',
    content: {
      root: {
        type: 'root',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children,
      },
    },
  }
}

export function payloadDocumentToMarkdown({ doc, domain }) {
  const lines = []
  const title = doc?.title || ''
  if (title) lines.push(`# ${title}`, '')

  const children = doc?.content?.root?.children || []
  for (const node of children) {
    if (node?.type === 'paragraph') {
      const text = extractPlainTextFromNode(node).trim()
      if (text) lines.push(text, '')
      continue
    }

    if (node?.type === 'heading') {
      const text = extractPlainTextFromNode(node).trim()
      if (text) lines.push(`## ${text}`, '')
      continue
    }

    if (node?.type === 'upload') {
      const media = typeof node.value === 'object' ? node.value : null
      const url = toAbsoluteUrl(domain, media?.url || '')
      const alt = media?.alt || 'image'
      if (url) {
        lines.push(`![${alt}](${url})`, '')
      } else {
        lines.push(`![${alt}](media:${String(node.value)})`, '')
      }
    }
  }

  return lines.join('\n').trim() + '\n'
}
