"use client"

import Link from "next/link"
import {
  ArrowRightIcon,
  BlocksIcon,
  CheckIcon,
  CommandIcon,
  DownloadIcon,
  GitBranchIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  SearchIcon,
  SparklesIcon,
  UsersRoundIcon,
} from "lucide-react"

import { Brand } from "@/components/atoms/brand"
import { LanguageSelector } from "@/components/atoms/language-selector"
import { ThemeToggleButton } from "@/components/atoms/theme-toggle-button"
import { MiniFaces } from "@/components/landing/molecules/mini-faces"
import { RotatingWord } from "@/components/landing/molecules/rotating-word"
import { EditorPreview } from "@/components/landing/organisms/editor-preview"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useI18n } from "@/lib/i18n/i18n-provider"

const androidApkUrl =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL ??
  "https://github.com/IsraelAraujo70/notion-clone/releases/download/android-beta/reason-beta.apk"

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
] as const

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
] as const

export function LandingPage() {
  const { t } = useI18n()

  return (
    <main className="min-h-svh overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <nav
          aria-label={t("Primary navigation")}
          className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex"
        >
          <a
            href="#editor"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("Editor")}
          </a>
          <a
            href="#product"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("Product")}
          </a>
          <a
            href="#architecture"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("Architecture")}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSelector compact />
          <ThemeToggleButton />
          <Button asChild>
            <Link href="/signup">
              {t("Start")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 pt-10 pb-14 text-center sm:px-8">
        <MiniFaces />
        <p className="mt-7 rounded-full border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
          {t("A workspace shaped by blocks")}
        </p>
        <h1 className="mt-7 min-h-[calc(2em+0.5rem)] max-w-5xl text-5xl font-semibold text-balance sm:text-6xl">
          <span className="sr-only">
            {t("Where every idea can become a page.")}
          </span>
          <span aria-hidden="true">
            {t("Where every idea can")} <RotatingWord /> {t("a page.")}
          </span>
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          {t(
            "Reason is a block-first workspace for writing, arranging pages, protecting private work, and building toward real-time sync without treating the editor as a costume."
          )}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">
              {t("Create account")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">{t("Sign in")}</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="border border-[#a8d7b3] bg-[#e8f8ec] text-[#176b2c] hover:bg-[#dcf4e2] dark:border-[#315f3b] dark:bg-[#1d3d25] dark:text-[#a6efb6] dark:hover:bg-[#254b2e]"
          >
            <a
              href={androidApkUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={t("Download Android beta APK")}
            >
              <DownloadIcon data-icon="inline-start" />
              {t("Download Android beta")}
              <span className="rounded bg-current/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider">
                APK
              </span>
            </a>
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
            <h2 className="font-heading text-xl font-semibold">
              {t(item.label)}
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {t(item.text)}
            </p>
          </article>
        ))}
      </section>

      <section id="architecture" className="scroll-mt-20 border-y bg-card/55">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-semibold text-muted-foreground">
              {t("Architecture")}
            </p>
            <h2 className="font-heading text-4xl font-semibold text-balance">
              {t("Built around the same path for people, sync, and AI.")}
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
                <span className="font-medium">{t(item.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2">
          <CheckIcon className="size-4" aria-hidden="true" />
          {t("Private by default")}
        </div>
        <div className="flex gap-4">
          <Link
            href="/login"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("Sign in")}
          </Link>
          <Link
            href="/signup"
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("Create account")}
          </Link>
        </div>
      </footer>
    </main>
  )
}
