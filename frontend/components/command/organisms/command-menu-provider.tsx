"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { FileTextIcon, LogOutIcon } from "lucide-react"

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { pagePath } from "@/components/pages/page-provider"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { api, type PageSummary, type SearchResult } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

type CommandMenuContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  openMenu: () => void
}

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null)

export function useCommandMenu(): CommandMenuContextValue {
  const context = useContext(CommandMenuContext)
  if (!context) {
    throw new Error("useCommandMenu must be used inside CommandMenuProvider")
  }
  return context
}

export function CommandMenuProvider({
  children,
  // Recebidas por prop, não por contexto: o menu também renderiza fora do PageProvider.
  pages = [],
}: {
  children: ReactNode
  pages?: PageSummary[]
}) {
  const router = useRouter()
  const { logout, token } = useAuth()
  const { t } = useI18n()
  const { selectWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const searchSequence = useRef(0)
  const normalizedQuery = query.trim()
  const remoteSearch = normalizedQuery.length >= 2

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>()
    for (const result of results) {
      const key = `${result.workspace_id}:${result.workspace_name}`
      groups.set(key, [...(groups.get(key) ?? []), result])
    }
    return [...groups.entries()].map(([key, items]) => ({ key, items }))
  }, [results])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!open || !remoteSearch || !token) {
      const sequence = ++searchSequence.current
      queueMicrotask(() => {
        if (searchSequence.current !== sequence) return
        setResults([])
        setSearching(false)
        setSearchError(false)
      })
      return
    }

    const sequence = ++searchSequence.current
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setSearching(true)
      setSearchError(false)
      void api
        .search(token, normalizedQuery, 50, controller.signal)
        .then((nextResults) => {
          if (searchSequence.current === sequence) setResults(nextResults)
        })
        .catch((error: unknown) => {
          if (
            searchSequence.current === sequence &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setResults([])
            setSearchError(true)
          }
        })
        .finally(() => {
          if (searchSequence.current === sequence) setSearching(false)
        })
    }, 200)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [normalizedQuery, open, remoteSearch, token])

  const runCommand = (action: () => void | Promise<void>) => {
    setOpen(false)
    void action()
  }

  const openMenu = () => setOpen(true)

  return (
    <CommandMenuContext.Provider value={{ open, setOpen, openMenu }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">{t("Command palette")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("Go to pages or manage your account.")}
        </DialogDescription>
        <DialogContent
          showCloseButton={false}
          className="top-1/4 translate-y-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <Command shouldFilter={false}>
            <CommandInput
              data-cy="command-input"
              placeholder={t("Search pages and content...")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {!remoteSearch ? (
                <CommandGroup heading={t("Go to")}>
                  {pages.map((page, index) => (
                    <CommandItem
                      key={page.id}
                      data-cy={`command-go-page-${page.id}`}
                      value={`${page.title || t("Untitled")} ${page.id}`}
                      onSelect={() =>
                        runCommand(() => router.push(pagePath(page.id)))
                      }
                    >
                      {page.icon ? (
                        <span
                          aria-hidden="true"
                          className="text-base leading-none"
                        >
                          {page.icon}
                        </span>
                      ) : (
                        <FileTextIcon />
                      )}
                      {page.title || t("Untitled")}
                      {index === 0 ? (
                        <CommandShortcut>G P</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : searching ? (
                <p
                  className="py-6 text-center text-sm text-muted-foreground"
                  data-cy="command-search-loading"
                >
                  {t("Searching...")}
                </p>
              ) : searchError ? (
                <p
                  role="alert"
                  className="py-6 text-center text-sm text-destructive"
                  data-cy="command-search-error"
                >
                  {t("Could not search. Try again.")}
                </p>
              ) : groupedResults.length === 0 ? (
                <p
                  className="py-6 text-center text-sm text-muted-foreground"
                  data-cy="command-search-empty"
                >
                  {t("No results found.")}
                </p>
              ) : (
                groupedResults.map(({ key, items }) => (
                  <CommandGroup key={key} heading={items[0].workspace_name}>
                    {items.map((result) => (
                      <CommandItem
                        key={`${result.page_id}:${result.block_id}`}
                        data-cy={`command-search-result-${result.block_id}`}
                        value={`${result.page_title} ${result.snippet} ${result.block_id}`}
                        onSelect={() =>
                          runCommand(() => {
                            selectWorkspace(result.workspace_id)
                            router.push(
                              `/dashboard/pages/${result.page_id}?block=${result.block_id}`
                            )
                          })
                        }
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2 font-medium">
                            <span aria-hidden="true">
                              {result.page_icon || "📄"}
                            </span>
                            <span className="truncate">
                              {result.page_title || t("Untitled")}
                            </span>
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {result.snippet}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))
              )}
              <CommandSeparator />
              <CommandGroup heading={t("Account")}>
                <CommandItem
                  data-cy="command-log-out"
                  value={`${t("Log out")} logout`}
                  onSelect={() =>
                    runCommand(() => logout().then(() => router.replace("/")))
                  }
                >
                  <LogOutIcon />
                  {t("Log out")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </CommandMenuContext.Provider>
  )
}
