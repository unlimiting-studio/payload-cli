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

function createHeadingNode(text, tag = 'h1') {
  return {
    type: 'heading',
    tag,
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

function createListItemNode(text, value = 1) {
  return {
    type: 'listitem',
    value,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: [createParagraphNode(text)],
  }
}

function createListNode(items, listType = 'bullet') {
  return {
    type: 'list',
    listType,
    tag: listType === 'number' ? 'ol' : 'ul',
    start: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: items.map((item, index) => createListItemNode(item, index + 1)),
  }
}

function isHeadingLine(line) {
  return /^#{1,6}\s+.+$/.test(line)
}

function parseHeadingLine(line) {
  const match = line.match(/^(#{1,6})\s+(.+)$/)
  if (!match) return null

  return {
    level: Math.min(match[1].length, 6),
    text: match[2].trim(),
  }
}

function isImageLine(line) {
  return /^!\[([^\]]*)\]\(([^)]+)\)$/.test(line)
}

function parseImageLine(line) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  if (!match) return null

  return {
    alt: match[1].trim() || 'image',
    src: match[2].trim(),
  }
}

function parseListItemLine(line) {
  const unordered = line.match(/^[-*+]\s+(.+)$/)
  if (unordered) {
    return {
      listType: 'bullet',
      text: unordered[1].trim(),
    }
  }

  const ordered = line.match(/^\d+\.\s+(.+)$/)
  if (ordered) {
    return {
      listType: 'number',
      text: ordered[1].trim(),
    }
  }

  return null
}

function parseBlocks(markdownText) {
  const lines = markdownText.split(/\r?\n/)
  const blocks = []

  for (let index = 0; index < lines.length; ) {
    const currentLine = lines[index].trim()
    if (!currentLine) {
      index += 1
      continue
    }

    const heading = parseHeadingLine(currentLine)
    if (heading) {
      blocks.push({ type: 'heading', ...heading })
      index += 1
      continue
    }

    const image = parseImageLine(currentLine)
    if (image) {
      blocks.push({ type: 'image', ...image })
      index += 1
      continue
    }

    const firstListItem = parseListItemLine(currentLine)
    if (firstListItem) {
      const items = [firstListItem.text]
      const listType = firstListItem.listType
      index += 1

      while (index < lines.length) {
        const nextLine = lines[index].trim()
        if (!nextLine) {
          index += 1
          break
        }

        const nextListItem = parseListItemLine(nextLine)
        if (!nextListItem || nextListItem.listType !== listType) break
        items.push(nextListItem.text)
        index += 1
      }

      blocks.push({ type: 'list', listType, items })
      continue
    }

    const paragraphLines = [currentLine]
    index += 1

    while (index < lines.length) {
      const nextLine = lines[index].trim()
      if (
        !nextLine ||
        isHeadingLine(nextLine) ||
        isImageLine(nextLine) ||
        parseListItemLine(nextLine)
      ) {
        break
      }

      paragraphLines.push(nextLine)
      index += 1
    }

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' ').trim(),
    })
  }

  return blocks
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

function extractListItemText(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.children)) return ''

  return node.children
    .map((child) => extractPlainTextFromNode(child).trim())
    .filter(Boolean)
    .join(' ')
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
    if (block.type === 'heading') {
      const headingText = block.text
      if (!title) {
        title = headingText
      } else {
        children.push(createHeadingNode(headingText, `h${block.level}`))
      }
      continue
    }

    if (block.type === 'image') {
      const alt = block.alt
      const src = block.src
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

    if (block.type === 'list') {
      if (!excerpt && block.items.length > 0) excerpt = block.items[0]
      children.push(createListNode(block.items, block.listType))
      continue
    }

    if (block.type === 'paragraph') {
      const paragraph = block.text.trim()
      if (!paragraph) continue
      if (!excerpt) excerpt = paragraph
      children.push(createParagraphNode(paragraph))
    }
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
      const level = Number(String(node.tag || '').replace(/^h/i, ''))
      const prefix = '#'.repeat(level >= 1 && level <= 6 ? level : 2)
      if (text) lines.push(`${prefix} ${text}`, '')
      continue
    }

    if (node?.type === 'list') {
      const items = Array.isArray(node.children) ? node.children : []
      const isOrdered = node.listType === 'number' || node.tag === 'ol'
      items.forEach((item, index) => {
        const text = extractListItemText(item)
        if (!text) return
        const marker = isOrdered ? `${index + 1}.` : '-'
        lines.push(`${marker} ${text}`)
      })
      if (items.length) lines.push('')
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
