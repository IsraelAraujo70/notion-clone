import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { WebView, type WebViewMessageEvent } from "react-native-webview"

import { fonts, useAppTheme } from "@/lib/theme"

const mermaidSource: string = require("mermaid/dist/mermaid.min.js")
const MAX_SOURCE_LENGTH = 50_000

const rendererHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-reason-mermaid'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
    <style>
      html, body { margin: 0; padding: 0; overflow: auto; background: transparent; }
      #diagram { box-sizing: border-box; min-width: 100%; padding: 12px; }
      #diagram svg { display: block; max-width: none; height: auto; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="diagram"></div>
    <script nonce="reason-mermaid">${mermaidSource}
      ;(() => {
        const diagram = document.getElementById("diagram");
        let renderSequence = 0;
        window.open = () => null;

        const send = (message) => {
          window.ReactNativeWebView?.postMessage(JSON.stringify(message));
        };
        const reportHeight = () => requestAnimationFrame(() => {
          send({ type: "height", height: Math.ceil(document.documentElement.scrollHeight) });
        });
        const render = async (source, dark) => {
          const sequence = ++renderSequence;
          if (!source.trim()) {
            diagram.replaceChildren();
            send({ type: "error", message: null });
            reportHeight();
            return;
          }
          try {
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: "strict",
              htmlLabels: false,
              maxTextSize: 50000,
              maxEdges: 500,
              theme: "base",
              themeVariables: dark ? {
                background: "#202124",
                primaryColor: "#2f3136",
                primaryBorderColor: "#73767d",
                primaryTextColor: "#f1f3f5",
                lineColor: "#a7abb2",
              } : {
                background: "#ffffff",
                primaryColor: "#f7f7f5",
                primaryBorderColor: "#c8c8c5",
                primaryTextColor: "#37352f",
                lineColor: "#787774",
              },
              flowchart: { htmlLabels: false, useMaxWidth: true },
            });
            const result = await mermaid.render("reason-mermaid-" + sequence, source);
            if (sequence !== renderSequence) return;
            diagram.innerHTML = result.svg;
            send({ type: "error", message: null });
            reportHeight();
          } catch (error) {
            if (sequence !== renderSequence) return;
            send({
              type: "error",
              message: error instanceof Error ? error.message : "Diagrama Mermaid invalido.",
            });
            reportHeight();
          }
        };
        const receive = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message?.type === "render" && typeof message.source === "string") {
              void render(message.source, message.dark === true);
            }
          } catch {
            send({ type: "error", message: "Nao foi possivel ler o diagrama." });
          }
        };
        window.addEventListener("message", receive);
        document.addEventListener("message", receive);
        send({ type: "ready" });
      })();
    </script>
  </body>
</html>`

type RendererMessage =
  | { type: "ready" }
  | { type: "height"; height: number }
  | { type: "error"; message: string | null }

export function MermaidBlock({
  editable,
  focusRequested,
  onChangeText,
  onFocus,
  onLongPress,
  selected,
  text,
}: {
  editable: boolean
  focusRequested: boolean
  onChangeText: (text: string) => void
  onFocus: () => void
  onLongPress: () => void
  selected: boolean
  text: string
}) {
  const { mode, tokens } = useAppTheme()
  const inputRef = useRef<TextInput>(null)
  const webViewRef = useRef<WebView>(null)
  const [rendererReady, setRendererReady] = useState(false)
  const [editing, setEditing] = useState(() => !text.trim())
  const [height, setHeight] = useState(140)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!focusRequested) return
    setEditing(true)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusRequested])

  useEffect(() => {
    if (!rendererReady) return
    if (text.length > MAX_SOURCE_LENGTH) {
      setError("A fonte Mermaid e grande demais.")
      return
    }
    const timer = setTimeout(() => {
      webViewRef.current?.postMessage(
        JSON.stringify({ type: "render", source: text, dark: mode === "dark" })
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [mode, rendererReady, text])

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as RendererMessage
      if (message.type === "ready") {
        setRendererReady(true)
      } else if (message.type === "height" && Number.isFinite(message.height)) {
        setHeight(Math.min(640, Math.max(96, message.height)))
      } else if (message.type === "error") {
        setError(message.message)
      }
    } catch {
      setError("Nao foi possivel ler a resposta do diagrama.")
    }
  }

  return (
    <View
      style={[
        styles.container,
        { borderColor: selected ? tokens.ring : tokens.border },
        selected && { backgroundColor: tokens.accent },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Opcoes do bloco Mermaid"
          onPress={onLongPress}
          style={styles.handle}
        >
          <MaterialCommunityIcons
            name="drag-vertical"
            size={18}
            color={tokens.mutedForeground}
          />
        </Pressable>
        <Text style={[styles.label, { color: tokens.mutedForeground }]}>
          MERMAID
        </Text>
        {editable ? (
          <Pressable
            accessibilityLabel={
              editing ? "Visualizar diagrama" : "Editar diagrama"
            }
            onPress={() => setEditing((current) => !current)}
            style={styles.modeButton}
          >
            <MaterialCommunityIcons
              name={editing ? "eye-outline" : "code-tags"}
              size={16}
              color={tokens.mutedForeground}
            />
            <Text style={[styles.modeLabel, { color: tokens.mutedForeground }]}>
              {editing ? "Visualizar" : "Editar"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {editing && editable ? (
        <TextInput
          ref={inputRef}
          editable
          multiline
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={"graph TD\n  A[Inicio] --> B[Fim]"}
          placeholderTextColor={tokens.mutedForeground}
          scrollEnabled={false}
          style={[
            styles.source,
            { backgroundColor: tokens.muted, color: tokens.foreground },
          ]}
          value={text}
        />
      ) : null}
      <View
        style={[
          styles.preview,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <WebView
          ref={webViewRef}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowsLinkPreview={false}
          cacheEnabled={false}
          domStorageEnabled={false}
          incognito
          javaScriptCanOpenWindowsAutomatically={false}
          mixedContentMode="never"
          onMessage={handleMessage}
          onOpenWindow={() => undefined}
          onShouldStartLoadWithRequest={({ url }) => url === "about:blank"}
          originWhitelist={["about:*"]}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled={false}
          source={{ html: rendererHtml, baseUrl: "about:blank" }}
          style={[styles.webView, { height }]}
          thirdPartyCookiesEnabled={false}
        />
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: tokens.destructive }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  header: { height: 34, flexDirection: "row", alignItems: "center" },
  handle: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: fonts.sansSemibold, fontSize: 10, letterSpacing: 1.2 },
  modeButton: {
    marginLeft: "auto",
    height: 30,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  modeLabel: { fontFamily: fonts.sansSemibold, fontSize: 11 },
  source: {
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 19,
  },
  preview: { margin: 10, borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  webView: { width: "100%", backgroundColor: "transparent" },
  error: {
    marginHorizontal: 12,
    marginBottom: 10,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
})
