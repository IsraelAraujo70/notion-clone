import { aiPt } from "@/lib/i18n/locales/pt/ai"
import { authPt } from "@/lib/i18n/locales/pt/auth"
import { commonPt } from "@/lib/i18n/locales/pt/common"
import { editorPt } from "@/lib/i18n/locales/pt/editor"
import { landingPt } from "@/lib/i18n/locales/pt/landing"
import { pagesPt } from "@/lib/i18n/locales/pt/pages"
import { settingsPt } from "@/lib/i18n/locales/pt/settings"
import { workspacePt } from "@/lib/i18n/locales/pt/workspace"

export const ptMessages = {
  ...commonPt,
  ...authPt,
  ...landingPt,
  ...workspacePt,
  ...pagesPt,
  ...editorPt,
  ...aiPt,
  ...settingsPt,
} as const

export type Message = keyof typeof ptMessages
