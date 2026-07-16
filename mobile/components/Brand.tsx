import { StyleSheet, Text, View } from "react-native"
import Svg, { G, Path, Rect } from "react-native-svg"

import { fonts, useAppTheme } from "@/lib/theme"

export function ReasonMark({ size = 28 }: { size?: number }) {
  const { tokens } = useAppTheme()
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Rect
        x="16"
        y="16"
        width="224"
        height="224"
        rx="47"
        stroke={tokens.foreground}
        strokeWidth="14"
      />
      <G fill={tokens.foreground}>
        <Rect x="58" y="58" width="40" height="40" rx="2" />
        <Rect x="58" y="108" width="40" height="40" rx="2" />
        <Rect x="58" y="158" width="40" height="40" rx="2" />
        <Path d="M114 58h39c35 0 61 26 61 59s-26 59-61 59h-39z" />
        <Path d="M114 158h47l56 58h-52z" />
      </G>
    </Svg>
  )
}

export function Brand({ size = 28 }: { size?: number }) {
  const { tokens } = useAppTheme()
  return (
    <View style={styles.brand}>
      <ReasonMark size={size} />
      <Text style={[styles.wordmark, { color: tokens.foreground }]}>
        reason
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  wordmark: { fontFamily: fonts.sansSemibold, fontSize: 20 },
})
