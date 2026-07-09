import Link from "next/link"
import {
  ArrowRightIcon,
  BlocksIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  CommandIcon,
  FileTextIcon,
  GitBranchIcon,
  GripVerticalIcon,
  Heading1Icon,
  KeyRoundIcon,
  ListChecksIcon,
  LockKeyholeIcon,
  MousePointer2Icon,
  QuoteIcon,
  SearchIcon,
  SparklesIcon,
  SquarePenIcon,
  UsersRoundIcon,
} from "lucide-react"

import { Brand } from "@/components/atoms/brand"
import { ThemeToggleButton } from "@/components/atoms/theme-toggle-button"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const productPillars = [
  {
    label: "Block editor",
    text: "Paragraphs, headings, lists, tasks, toggles, quotes, code, callouts, dividers, drag, and undo.",
    icon: BlocksIcon,
  },
  {
    label: "Protected workspace",
    text: "Real signup, login, logout, password reset, password reveal, and strength feedback.",
    icon: LockKeyholeIcon,
  },
  {
    label: "Fast command surface",
    text: "A keyboard-first shell with command search, page navigation, and account actions.",
    icon: CommandIcon,
  },
]

const editorBlocks = [
  {
    icon: Heading1Icon,
    label: "Heading",
    content: "Launch notes",
  },
  {
    icon: ListChecksIcon,
    label: "Task",
    content: "Turn every edit into an operation",
  },
  {
    icon: QuoteIcon,
    label: "Quote",
    content: "A page is a block with children.",
  },
  {
    icon: BracesIcon,
    label: "Code",
    content: "apply(operation)",
  },
]

const architectureItems = [
  {
    icon: GitBranchIcon,
    text: "Operation-based sync",
  },
  {
    icon: UsersRoundIcon,
    text: "Real-time convergence",
  },
  {
    icon: KeyRoundIcon,
    text: "Workspace permissions",
  },
  {
    icon: SearchIcon,
    text: "Scoped search",
  },
  {
    icon: SparklesIcon,
    text: "AI writes through blocks",
  },
]

const miniFaces = [
  "bg-[#e8f1ff] text-[#1459a8]",
  "bg-[#fff3bf] text-[#6b4e00]",
  "bg-[#ffe1d6] text-[#9b321b]",
  "bg-[#e4f7dc] text-[#276221]",
  "bg-[#f2e6ff] text-[#6b35a8]",
]

function MiniFaces() {
  return (
    <div
      aria-hidden="true"
      className="flex justify-center -space-x-2 text-sm font-semibold"
    >
      {miniFaces.map((className, index) => (
        <span
          key={className}
          className={`grid size-12 rotate-[-4deg] place-items-center rounded-full border-2 border-background ${className}`}
        >
          {index === 0 ? "r" : index + 1}
        </span>
      ))}
    </div>
  )
}

function EditorPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -top-8 left-3 hidden rotate-[-12deg] items-center gap-2 rounded-full border bg-[#fff3bf] px-3 py-2 text-sm font-medium text-[#443100] shadow-sm sm:flex">
        <MousePointer2Icon className="size-4" aria-hidden="true" />
        drag blocks
      </div>
      <div className="absolute -top-7 right-4 hidden rotate-[8deg] items-center gap-2 rounded-full border bg-[#e8f1ff] px-3 py-2 text-sm font-medium text-[#124d91] shadow-sm sm:flex">
        <CommandIcon className="size-4" aria-hidden="true" />
        Slash commands
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-[0_24px_80px_rgba(15,15,15,0.10)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex h-10 items-center justify-between border-b bg-muted/70 px-4">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <FileTextIcon className="size-3.5" aria-hidden="true" />
            Workspace page
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            Blocks
          </div>
        </div>

        <div className="grid min-h-[420px] bg-card md:grid-cols-[180px_1fr]">
          <aside className="hidden border-r bg-muted/45 p-4 md:block">
            <div className="mb-5 text-xs font-medium text-muted-foreground">
              Workspace
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5 font-medium shadow-sm">
                <FileTextIcon className="size-4" aria-hidden="true" />
                Home
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                <SquarePenIcon className="size-4" aria-hidden="true" />
                Drafts
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                <CommandIcon className="size-4" aria-hidden="true" />
                Commands
              </div>
            </div>
          </aside>

          <div className="p-5 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <FileTextIcon aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">reason workspace</p>
                  <p className="truncate text-sm text-muted-foreground">
                    A block-native writing surface.
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="hidden sm:flex">
                Commands
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </div>

            <div className="mx-auto max-w-2xl">
              <h2 className="mb-3 font-heading text-4xl font-semibold">
                Untitled
              </h2>
              <p className="mb-7 leading-7 text-muted-foreground">
                Write, reorder, and reshape ideas one block at a time.
              </p>

              <div className="space-y-3">
                {editorBlocks.map((block) => (
                  <div
                    key={block.label}
                    className="group flex min-h-12 items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/50"
                  >
                    <GripVerticalIcon
                      className="size-4 text-muted-foreground opacity-60"
                      aria-hidden="true"
                    />
                    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-xs font-medium">
                      <block.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        {block.label}
                      </p>
                      <p className="font-medium break-words">{block.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <main className="min-h-svh overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex"
        >
          <a
            href="#editor"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Editor
          </a>
          <a
            href="#product"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Product
          </a>
          <a
            href="#architecture"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Architecture
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <Button asChild>
            <Link href="/signup">
              Start
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 pt-10 pb-14 text-center sm:px-8">
        <MiniFaces />
        <p className="mt-7 rounded-full border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
          A workspace shaped by blocks
        </p>
        <h1 className="mt-7 max-w-5xl text-5xl font-semibold text-balance sm:text-6xl">
          Where every idea can{" "}
          <span className="inline-flex rounded-full bg-[#cdf4d6] px-4 py-1 text-[#0f7b2d] dark:bg-[#204b2b] dark:text-[#a6efb6]">
            become
          </span>{" "}
          a page.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          Reason is a block-first workspace for writing, arranging pages,
          protecting private work, and building toward real-time sync without
          treating the editor as a costume.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">
              Create account
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section id="editor" className="scroll-mt-20 px-5 pb-20 sm:px-8">
        <EditorPreview />
      </section>

      <Separator />

      <section
        id="product"
        className="mx-auto grid w-full max-w-7xl scroll-mt-20 gap-4 px-5 py-16 sm:px-8 md:grid-cols-3"
      >
        {productPillars.map((item) => (
          <article
            key={item.label}
            className="rounded-lg border bg-card p-5 shadow-sm"
          >
            <div className="mb-5 grid size-10 place-items-center rounded-lg bg-secondary text-foreground">
              <item.icon aria-hidden="true" />
            </div>
            <h2 className="font-heading text-xl font-semibold">{item.label}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{item.text}</p>
          </article>
        ))}
      </section>

      <section id="architecture" className="scroll-mt-20 border-y bg-card/55">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-semibold text-muted-foreground">
              Architecture
            </p>
            <h2 className="font-heading text-4xl font-semibold text-balance">
              Built around the same path for people, sync, and AI.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {architectureItems.map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-3 rounded-lg border bg-background p-4"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e8f1ff] text-[#1459a8] dark:bg-[#26374f] dark:text-[#9fcaff]">
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2">
          <CheckIcon className="size-4" aria-hidden="true" />
          Private by default
        </div>
        <div className="flex gap-4">
          <Link
            href="/login"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Create account
          </Link>
        </div>
      </footer>
    </main>
  )
}
