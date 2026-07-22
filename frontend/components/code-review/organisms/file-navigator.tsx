"use client"

import {
  ChevronRightIcon,
  FileCode2Icon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import type { ReviewFile } from "@/lib/code-review/contracts"
import {
  buildFileTree,
  directoryPaths,
  type FileTreeNode,
} from "@/lib/code-review/file-tree"
import { cn } from "@/lib/utils"

interface FileNavigatorProps {
  files: ReviewFile[]
  activePath: string | null
  onSelectFile: (path: string) => void
}

export function FileNavigator({
  files,
  activePath,
  onSelectFile,
}: FileNavigatorProps) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [expanded, setExpanded] = useState(() => new Set(directoryPaths(tree)))

  const toggleDirectory = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <nav
      aria-label="Changed files"
      className="flex min-h-0 flex-col border-b bg-muted/10 md:h-full md:border-r md:border-b-0"
    >
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
        <div>
          <h2 className="text-xs font-semibold tracking-wide uppercase">
            Files
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {files.length} changed
          </p>
        </div>
      </div>
      <div
        role="tree"
        aria-label="Pull request file tree"
        className="code-review-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5 max-md:max-h-52"
      >
        <TreeNodes
          nodes={tree}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          onToggleDirectory={toggleDirectory}
          onSelectFile={onSelectFile}
        />
      </div>
    </nav>
  )
}

function TreeNodes({
  nodes,
  depth,
  expanded,
  activePath,
  onToggleDirectory,
  onSelectFile,
}: {
  nodes: FileTreeNode[]
  depth: number
  expanded: Set<string>
  activePath: string | null
  onToggleDirectory: (path: string) => void
  onSelectFile: (path: string) => void
}) {
  return nodes.map((node) => {
    const paddingLeft = `${0.45 + depth * 0.85}rem`
    if (node.kind === "directory") {
      const open = expanded.has(node.path)
      return (
        <div key={node.path} role="none">
          <button
            type="button"
            role="treeitem"
            aria-expanded={open}
            aria-selected={false}
            className="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            style={{ paddingLeft }}
            onClick={() => onToggleDirectory(node.path)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                open && "rotate-90"
              )}
            />
            {open ? (
              <FolderOpenIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <FolderIcon aria-hidden="true" className="size-3.5" />
            )}
            <span className="truncate" title={node.path}>
              {node.name}
            </span>
          </button>
          {open ? (
            <div role="group">
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                activePath={activePath}
                onToggleDirectory={onToggleDirectory}
                onSelectFile={onSelectFile}
              />
            </div>
          ) : null}
        </div>
      )
    }

    const file = node.file
    return (
      <button
        key={node.path}
        type="button"
        role="treeitem"
        aria-selected={activePath === file.path}
        aria-label={`${file.path}, ${file.status}, ${file.additions} additions, ${file.deletions} deletions`}
        aria-current={activePath === file.path ? "page" : undefined}
        className={cn(
          "group flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          activePath === file.path && "bg-muted font-medium text-foreground"
        )}
        style={{ paddingLeft: `${1.8 + depth * 0.85}rem` }}
        onClick={() => onSelectFile(file.path)}
      >
        <FileCode2Icon
          aria-hidden="true"
          className={cn("size-3.5 shrink-0", statusColor(file.status))}
        />
        <span className="min-w-0 flex-1 truncate" title={file.path}>
          {node.name}
        </span>
        <span className="flex shrink-0 gap-1 font-mono text-[10px] opacity-80 group-hover:opacity-100">
          <span className="text-emerald-700 dark:text-emerald-400">
            +{file.additions}
          </span>
          <span className="text-red-700 dark:text-red-400">
            -{file.deletions}
          </span>
        </span>
      </button>
    )
  })
}

function statusColor(status: ReviewFile["status"]): string {
  if (status === "added") return "text-emerald-600"
  if (status === "removed") return "text-red-600"
  if (status === "renamed" || status === "copied") return "text-blue-600"
  return "text-amber-600"
}
