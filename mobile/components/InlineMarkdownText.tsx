import { parseInlineMarkdown } from "@reason/core/inline-markdown"
import { Text, type StyleProp, type TextStyle } from "react-native"

import { fonts } from "@/lib/theme"

export function InlineMarkdownText({
  source,
  color,
  codeBackground,
  style,
  selectable,
}: {
  source: string
  color: string
  codeBackground: string
  style?: StyleProp<TextStyle>
  selectable?: boolean
}) {
  return (
    <Text selectable={selectable} style={[style, { color }]}>
      {parseInlineMarkdown(source).map((segment, index) => (
        <Text
          key={`${index}-${segment.text}`}
          style={[
            segment.marks.includes("bold") && {
              fontFamily: fonts.sansSemibold,
            },
            segment.marks.includes("italic") && { fontStyle: "italic" },
            segment.marks.includes("strike") && {
              textDecorationLine: "line-through",
            },
            segment.marks.includes("code") && {
              backgroundColor: codeBackground,
              fontFamily: fonts.mono,
              fontSize: 14,
            },
          ]}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  )
}
