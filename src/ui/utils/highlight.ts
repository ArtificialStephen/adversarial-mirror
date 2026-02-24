import { highlight } from 'cli-highlight'

// IMPORTANT: Do NOT declare the regex at module scope with the /g flag.
// A module-level /g regex retains its lastIndex between calls, causing every
// other invocation of highlightCodeBlocks to silently skip all matches.
// The regex is created fresh inside the function to avoid this.

export function highlightCodeBlocks(text: string): string {
  if (!text.includes('```')) {
    return text
  }

  // Fresh regex instance per call — no shared lastIndex state
  const fenceRegex = /```(\w+)?\n([\s\S]*?)```/g

  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(text)) !== null) {
    const [block, lang, code] = match
    result += text.slice(lastIndex, match.index)
    try {
      const highlighted = highlight(code, {
        language: lang || undefined,
        ignoreIllegals: true,
      })
      result += `\n${highlighted}\n`
    } catch {
      // Fallback: emit the raw code block if highlighting fails
      result += `\n${code}\n`
    }
    lastIndex = match.index + block.length
  }

  result += text.slice(lastIndex)
  return result
}
