import type { ReviewFile } from "@/lib/code-review/contracts"
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
  return (
    <nav
      aria-label="Changed files"
      className="min-w-0 border-b bg-background lg:border-r lg:border-b-0"
    >
      <div className="border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Changed files</h2>
        <p className="text-xs text-muted-foreground">{files.length} total</p>
      </div>
      <ul className="flex max-w-full gap-1 overflow-x-auto p-2 lg:max-h-[calc(100vh-11rem)] lg:flex-col lg:overflow-y-auto">
        {files.map((file) => (
          <li key={file.path} className="min-w-52 lg:min-w-0">
            <button
              type="button"
              aria-label={`${file.path}, ${file.status}, ${file.additions} additions, ${file.deletions} deletions`}
              aria-current={activePath === file.path ? "page" : undefined}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                activePath === file.path && "bg-muted font-medium"
              )}
              onClick={() => onSelectFile(file.path)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  statusColor(file.status)
                )}
              />
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate font-mono text-xs"
                  title={file.path}
                >
                  {file.path}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  <span className="text-emerald-700 dark:text-emerald-400">
                    +{file.additions}
                  </span>{" "}
                  <span className="text-red-700 dark:text-red-400">
                    -{file.deletions}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function statusColor(status: ReviewFile["status"]): string {
  if (status === "added") return "bg-emerald-500"
  if (status === "removed") return "bg-red-500"
  if (status === "renamed" || status === "copied") return "bg-blue-500"
  return "bg-amber-500"
}
