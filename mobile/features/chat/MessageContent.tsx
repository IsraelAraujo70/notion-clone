import type { ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"

import { InlineMarkdownText } from "@/components/InlineMarkdownText"
import { fonts, useAppTheme } from "@/lib/theme"

export function MessageContent({ content }: { content: string }) {
  const { tokens } = useAppTheme()
  const nodes: ReactNode[] = []
  let code: string[] | null = null

  const flushCode = (key: number) => {
    if (!code) return
    nodes.push(
      <View
        key={`code-${key}`}
        style={[
          styles.codeBlock,
          { backgroundColor: tokens.muted, borderColor: tokens.border },
        ]}
      >
        <Text
          selectable
          style={[styles.codeText, { color: tokens.foreground }]}
        >
          {code.join("\n")}
        </Text>
      </View>
    )
    code = null
  }

  content.split("\n").forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      if (code) flushCode(index)
      else code = []
      return
    }
    if (code) {
      code.push(line)
      return
    }
    if (!line.trim()) {
      nodes.push(<View key={`space-${index}`} style={styles.space} />)
      return
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      nodes.push(
        <InlineMarkdownText
          selectable
          key={`heading-${index}`}
          source={heading[2]}
          color={tokens.foreground}
          codeBackground={tokens.muted}
          style={[
            styles.heading,
            heading[1].length === 1 && styles.heading1,
            heading[1].length === 2 && styles.heading2,
          ]}
        />
      )
      return
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line)
    const numbered = /^(\d+)\.\s+(.+)$/.exec(line)
    if (bullet || numbered) {
      const marker = bullet ? "-" : `${numbered?.[1]}.`
      const value = bullet?.[1] ?? numbered?.[2] ?? ""
      nodes.push(
        <View key={`list-${index}`} style={styles.listRow}>
          <Text style={[styles.marker, { color: tokens.mutedForeground }]}>
            {marker}
          </Text>
          <InlineMarkdownText
            selectable
            source={value}
            color={tokens.foreground}
            codeBackground={tokens.muted}
            style={styles.body}
          />
        </View>
      )
      return
    }

    const quote = /^>\s?(.+)$/.exec(line)
    if (quote) {
      nodes.push(
        <View
          key={`quote-${index}`}
          style={[styles.quote, { borderLeftColor: tokens.ring }]}
        >
          <InlineMarkdownText
            selectable
            source={quote[1]}
            color={tokens.mutedForeground}
            codeBackground={tokens.muted}
            style={[styles.body, { color: tokens.mutedForeground }]}
          />
        </View>
      )
      return
    }

    nodes.push(
      <InlineMarkdownText
        selectable
        key={`line-${index}`}
        source={line}
        color={tokens.foreground}
        codeBackground={tokens.muted}
        style={styles.body}
      />
    )
  })
  flushCode(content.length)

  return <View style={styles.content}>{nodes}</View>
}

const styles = StyleSheet.create({
  content: { gap: 5 },
  body: { flex: 1, fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  heading: {
    fontFamily: fonts.heading,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 7,
  },
  heading1: { fontFamily: fonts.headingBold, fontSize: 24, lineHeight: 30 },
  heading2: { fontSize: 20, lineHeight: 26 },
  codeBlock: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginVertical: 5,
  },
  codeText: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  marker: {
    width: 20,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 24,
  },
  quote: { borderLeftWidth: 3, paddingLeft: 11, marginVertical: 4 },
  space: { height: 5 },
})
