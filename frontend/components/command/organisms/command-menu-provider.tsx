"use client"

import {
  createContext,
  useContext,
  useEffect,
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
import { useAuth } from "@/lib/auth"

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

export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

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

  const runCommand = (action: () => void | Promise<void>) => {
    setOpen(false)
    void action()
  }

  const openMenu = () => setOpen(true)

  return (
    <CommandMenuContext.Provider value={{ open, setOpen, openMenu }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Ir para paginas ou gerenciar sua conta.
        </DialogDescription>
        <DialogContent
          showCloseButton={false}
          className="top-1/4 translate-y-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <Command>
            <CommandInput
              data-cy="command-input"
              placeholder="Buscar comandos..."
            />
            <CommandList>
              <CommandGroup heading="Ir para">
                <CommandItem
                  data-cy="command-go-page"
                  value="sem titulo documento dashboard"
                  onSelect={() => runCommand(() => router.push("/dashboard"))}
                >
                  <FileTextIcon />
                  Sem título
                  <CommandShortcut>G P</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Conta">
                <CommandItem
                  data-cy="command-log-out"
                  value="sair logout"
                  onSelect={() =>
                    runCommand(() => logout().then(() => router.replace("/")))
                  }
                >
                  <LogOutIcon />
                  Sair
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </CommandMenuContext.Provider>
  )
}
