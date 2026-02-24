import { highlight } from 'cli-highlight'

const fenceRegex = /```(\w+)?\n([\s\S]*?)```/g

export function highlightCodeBlocks(text: string): string {
  if (!text.includes('```')) {
    return text
  }

  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(text)) !== null) {
    const [block, lang, code] = match
    result += text.slice(lastIndex, match.index)
    const highlighted = highlight(code, {
      language: lang || undefined,
      ignoreIllegals: true
    })
    result += `\n${highlighted}\n`
    lastIndex = match.index + block.length
  }

  result += text.slice(lastIndex)
  return result
}
