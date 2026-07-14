export type ActivePageMention = {
  start: number
  end: number
  query: string
}

export function activePageMention(
  value: string,
  cursor: number
): ActivePageMention | null {
  const beforeCursor = value.slice(0, cursor)
  const match = /(?:^|\s)@([^@\s]*)$/.exec(beforeCursor)
  if (!match) return null
  const query = match[1]
  const start = cursor - query.length - 1
  return { start, end: cursor, query }
}

export function insertPageMention(
  value: string,
  mention: ActivePageMention,
  title: string
) {
  const suffix = value.slice(mention.end)
  const token = `@${title}${/^\s/.test(suffix) ? "" : " "}`
  return {
    value: `${value.slice(0, mention.start)}${token}${suffix}`,
    cursor: mention.start + token.length,
  }
}

export function hasPageMention(value: string, title: string) {
  const token = `@${title}`
  let index = value.indexOf(token)
  while (index >= 0) {
    const next = value[index + token.length]
    if (next === undefined || /\s|[.,;:!?)]/.test(next)) return true
    index = value.indexOf(token, index + token.length)
  }
  return false
}
