import type { ReviewFile } from "./contracts"

export type FileTreeNode =
  | {
      kind: "directory"
      name: string
      path: string
      children: FileTreeNode[]
    }
  | {
      kind: "file"
      name: string
      path: string
      file: ReviewFile
    }

type MutableDirectory = {
  name: string
  path: string
  directories: Map<string, MutableDirectory>
  files: ReviewFile[]
}

export function buildFileTree(files: ReviewFile[]): FileTreeNode[] {
  const root: MutableDirectory = {
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  }

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean)
    const filename = parts.pop()
    if (!filename) continue
    let directory = root

    for (const part of parts) {
      const path = directory.path ? `${directory.path}/${part}` : part
      let child = directory.directories.get(part)
      if (!child) {
        child = {
          name: part,
          path,
          directories: new Map(),
          files: [],
        }
        directory.directories.set(part, child)
      }
      directory = child
    }

    directory.files.push(file)
  }

  return directoryChildren(root)
}

export function directoryPaths(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "directory"
      ? [node.path, ...directoryPaths(node.children)]
      : []
  )
}

function directoryChildren(directory: MutableDirectory): FileTreeNode[] {
  const directories = [...directory.directories.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map<FileTreeNode>((child) => ({
      kind: "directory",
      name: child.name,
      path: child.path,
      children: directoryChildren(child),
    }))
  const files = directory.files
    .toSorted((left, right) => left.path.localeCompare(right.path))
    .map<FileTreeNode>((file) => ({
      kind: "file",
      name: file.path.split("/").at(-1) ?? file.path,
      path: file.path,
      file,
    }))

  return [...directories, ...files]
}
