import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { Block, BlockType, Operation } from "@reason/core/contracts"
import {
  createOpQueue,
  type OpQueue,
  type SaveState,
} from "@reason/core/engine/op-queue"
import {
  applyOperation,
  newBlock,
  stampPropVersions,
  treeFromBlocks,
  type BlockTree,
} from "@reason/core/engine/tree"
import { createId } from "@reason/core/id"
import * as Haptics from "expo-haptics"
import { useLocalSearchParams, useNavigation } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import { ScreenState } from "@/components/ScreenState"
import { BlockActionSheet } from "@/features/editor/BlockActionSheet"
import { EditorBlock } from "@/features/editor/EditorBlock"
import {
  duplicateSubtreeOperations,
  indentOperation,
  outdentOperation,
} from "@/features/editor/block-operations"
import { api, type PageResponse } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { readCache, writeCache } from "@/lib/cache"
import { fonts, useAppTheme } from "@/lib/theme"

function flattenTree(tree: BlockTree): { block: Block; depth: number }[] {
  const root = tree.blocks.get(tree.rootId)
  if (!root) return []
  const rows: { block: Block; depth: number }[] = []
  const visit = (id: string, depth: number) => {
    const block = tree.blocks.get(id)
    if (!block || block.trashedAt) return
    rows.push({ block, depth })
    for (const childId of block.content) visit(childId, depth + 1)
  }
  for (const childId of root.content) visit(childId, 0)
  return rows
}

export default function PageScreen() {
  const { workspaceId, pageId, role } = useLocalSearchParams<{
    workspaceId: string
    pageId: string
    role?: string
  }>()
  const navigation = useNavigation()
  const { token } = useAuth()
  const { tokens } = useAppTheme()
  const [data, setData] = useState<PageResponse | null>(null)
  const [tree, setTree] = useState<BlockTree | null>(null)
  const [offline, setOffline] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [menuBlockId, setMenuBlockId] = useState<string | null>(null)
  const treeRef = useRef<BlockTree | null>(null)
  const queueRef = useRef<OpQueue | null>(null)

  useEffect(() => {
    if (!token || !workspaceId) return
    const queue = createOpQueue({
      send: (operation) => api.applyOperation(token, workspaceId, operation),
      onStateChange: (state) => setSaveState(state),
    })
    queueRef.current = queue
    return () => {
      queue.flush().catch(() => undefined)
      queueRef.current = null
    }
  }, [token, workspaceId])

  useEffect(() => {
    if (!token || !workspaceId || !pageId) return
    let active = true
    const key = `page:${workspaceId}:${pageId}`
    const applyPage = (next: PageResponse) => {
      const nextTree = treeFromBlocks(next.page.rootId, next.page.blocks)
      treeRef.current = nextTree
      setTree(nextTree)
      setData(next)
    }

    readCache<PageResponse>(key).then((cached) => {
      if (active && cached) applyPage(cached)
      api.getPage(token, workspaceId, pageId).then(
        (remote) => {
          if (!active) return
          applyPage(remote)
          setOffline(false)
          writeCache(key, remote)
        },
        () => {
          if (active) setOffline(true)
        }
      )
    })
    return () => {
      active = false
    }
  }, [token, workspaceId, pageId])

  const root = tree?.blocks.get(tree.rootId)
  const canEdit = !offline && role !== "viewer" && saveState !== "error"

  useEffect(() => {
    navigation.setOptions({
      title: String(root?.properties.title ?? "Pagina"),
      headerRight: () => (
        <Text
          style={{
            color:
              saveState === "error"
                ? tokens.destructive
                : tokens.mutedForeground,
            fontFamily: fonts.sans,
            fontSize: 12,
          }}
        >
          {saveState === "saving"
            ? "Salvando..."
            : saveState === "error"
              ? "Erro"
              : "Salvo"}
        </Text>
      ),
    })
  }, [navigation, root?.properties.title, saveState, tokens])

  function applyBatch(operations: Operation[], coalesceKey?: string) {
    const currentTree = treeRef.current
    if (
      !currentTree ||
      operations.length === 0 ||
      offline ||
      role === "viewer" ||
      !queueRef.current
    )
      return

    let nextTree = currentTree
    const stampedOperations: Operation[] = []
    for (const operation of operations) {
      const stamped = stampPropVersions(nextTree, operation)
      nextTree = applyOperation(nextTree, stamped).tree
      stampedOperations.push(stamped)
    }
    treeRef.current = nextTree
    setTree(nextTree)
    queueRef.current.push(stampedOperations, coalesceKey)
  }

  function applyLocal(operation: Operation, coalesceKey?: string) {
    applyBatch([operation], coalesceKey)
  }

  function updateProperty(
    blockId: string,
    property: "text" | "title" | "checked",
    value: string | boolean
  ) {
    applyLocal(
      {
        type: "update_block",
        opId: createId(),
        blockId,
        properties: { [property]: value },
      },
      `property:${blockId}:${property}`
    )
  }

  function addParagraph(afterBlockId: string | null = focusedBlockId) {
    if (!root) return
    const anchor = afterBlockId
      ? treeRef.current?.blocks.get(afterBlockId)
      : null
    const parent = anchor?.parentId
      ? treeRef.current?.blocks.get(anchor.parentId)
      : root
    if (!parent) return
    const block = newBlock(
      "paragraph",
      { text: "" },
      createId(),
      root.workspaceId
    )
    applyLocal({
      type: "insert_block",
      opId: createId(),
      block,
      parentId: parent.id,
      index: anchor
        ? parent.content.indexOf(anchor.id) + 1
        : parent.content.length,
    })
    setFocusedBlockId(block.id)
  }

  function openBlockMenu(blockId: string) {
    if (!canEdit) return
    Keyboard.dismiss()
    setMenuBlockId(blockId)
    void Haptics.selectionAsync()
  }

  function closeBlockMenu() {
    setMenuBlockId(null)
  }

  function deleteSelectedBlock() {
    if (!menuBlockId) return
    applyLocal({
      type: "delete_block",
      opId: createId(),
      blockId: menuBlockId,
    })
    closeBlockMenu()
  }

  function duplicateSelectedBlock() {
    const currentTree = treeRef.current
    if (!currentTree || !menuBlockId) return
    applyBatch(duplicateSubtreeOperations(currentTree, menuBlockId, createId))
    closeBlockMenu()
  }

  function turnSelectedBlockInto(blockType: BlockType) {
    const block = menuBlockId ? treeRef.current?.blocks.get(menuBlockId) : null
    if (!block) return
    applyLocal({
      type: "update_block",
      opId: createId(),
      blockId: block.id,
      blockType,
      properties: {
        text: String(block.properties.text ?? ""),
        checked:
          blockType === "to_do" ? Boolean(block.properties.checked) : null,
        language:
          blockType === "code"
            ? typeof block.properties.language === "string"
              ? block.properties.language
              : "plaintext"
            : null,
      },
    })
    closeBlockMenu()
  }

  function indentSelectedBlock() {
    const currentTree = treeRef.current
    if (!currentTree || !menuBlockId) return
    const operation = indentOperation(currentTree, menuBlockId, createId)
    if (operation) applyLocal(operation)
    closeBlockMenu()
  }

  function outdentSelectedBlock() {
    const currentTree = treeRef.current
    if (!currentTree || !menuBlockId) return
    const operation = outdentOperation(currentTree, menuBlockId, createId)
    if (operation) applyLocal(operation)
    closeBlockMenu()
  }

  if (!data || !tree || !root) {
    return offline ? (
      <ScreenState
        message="Esta pagina ainda nao esta salva neste aparelho."
        error
      />
    ) : (
      <ScreenState message="Carregando blocos..." />
    )
  }

  const rows = flattenTree(tree)
  const menuBlock = menuBlockId ? (tree.blocks.get(menuBlockId) ?? null) : null
  const menuParent = menuBlock?.parentId
    ? tree.blocks.get(menuBlock.parentId)
    : null
  const menuIndex =
    menuParent && menuBlock ? menuParent.content.indexOf(menuBlock.id) : -1

  return (
    <ScrollView
      style={{ backgroundColor: tokens.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {offline ? (
        <View style={[styles.banner, { backgroundColor: tokens.muted }]}>
          <Text style={[styles.bannerText, { color: tokens.foreground }]}>
            Leitura offline. Conecte-se para editar.
          </Text>
        </View>
      ) : null}

      <Text style={styles.pageIcon}>{String(root.properties.icon ?? "#")}</Text>
      <TextInput
        editable={canEdit}
        multiline
        scrollEnabled={false}
        value={String(root.properties.title ?? "")}
        onChangeText={(title) => updateProperty(root.id, "title", title)}
        placeholder="Sem titulo"
        placeholderTextColor={tokens.mutedForeground}
        style={[styles.pageTitle, { color: tokens.foreground }]}
      />

      <View style={styles.blocks}>
        {rows.map(({ block, depth }) => (
          <EditorBlock
            key={block.id}
            block={block}
            depth={depth}
            editable={canEdit}
            focusRequested={focusedBlockId === block.id}
            selected={menuBlockId === block.id}
            onChangeText={(text) => updateProperty(block.id, "text", text)}
            onFocus={() => setFocusedBlockId(block.id)}
            onLongPress={() => openBlockMenu(block.id)}
            onSubmit={() => addParagraph(block.id)}
            onToggle={() =>
              updateProperty(
                block.id,
                "checked",
                !Boolean(block.properties.checked)
              )
            }
          />
        ))}
      </View>

      {canEdit ? (
        <Pressable
          onPress={() => addParagraph()}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: pressed ? tokens.muted : tokens.background },
          ]}
        >
          <MaterialCommunityIcons
            name="plus"
            size={18}
            color={tokens.mutedForeground}
          />
          <Text style={[styles.addText, { color: tokens.mutedForeground }]}>
            Novo bloco
          </Text>
        </Pressable>
      ) : null}

      <BlockActionSheet
        block={menuBlock}
        visible={Boolean(menuBlock)}
        canIndent={menuIndex > 0}
        canOutdent={Boolean(menuParent && menuParent.id !== tree.rootId)}
        onClose={closeBlockMenu}
        onDelete={deleteSelectedBlock}
        onDuplicate={duplicateSelectedBlock}
        onIndent={indentSelectedBlock}
        onOutdent={outdentSelectedBlock}
        onTurnInto={turnSelectedBlockInto}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  banner: { borderRadius: 10, padding: 11, marginBottom: 16 },
  bannerText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  pageIcon: {
    fontFamily: fonts.sans,
    fontSize: 30,
    marginTop: 8,
    marginBottom: 8,
  },
  pageTitle: {
    padding: 0,
    fontFamily: fonts.headingBold,
    fontSize: 38,
    lineHeight: 44,
  },
  blocks: { marginTop: 18, gap: 2 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 11,
    paddingLeft: 24,
    marginTop: 8,
    borderRadius: 8,
  },
  addText: { fontFamily: fonts.sans, fontSize: 14 },
})
