"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChangePasswordForm } from "@/components/settings/change-password-form"
import { McpIntegrationsPanel } from "@/components/settings/mcp-integrations-panel"
import { ProfileForm } from "@/components/settings/profile-form"
import { ThemeSelector } from "@/components/settings/theme-selector"
import { WorkspaceMembersPanel } from "@/components/settings/workspace-members-panel"
import { LanguageSelector } from "@/components/atoms/language-selector"
import { usePageLayout } from "@/components/editor/page-layout-provider"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

function initials(displayName: string) {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function SettingsDialog({
  onOpenChange,
  open,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const { t } = useI18n()
  const { fullWidth, setFullWidth } = usePageLayout()
  const displayName = user?.display_name || t("User")
  const email = user?.email || t("Active session")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-cy="settings-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>{t("Settings")}</DialogTitle>
          <DialogDescription>
            {t(
              "Manage your account, workspaces, integrations, and appearance."
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="account" className="gap-5">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="account">{t("Account")}</TabsTrigger>
            <TabsTrigger value="workspace">{t("Workspace")}</TabsTrigger>
            <TabsTrigger value="integrations">{t("Integrations")}</TabsTrigger>
            <TabsTrigger value="appearance">{t("Appearance")}</TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="flex flex-col gap-6">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Avatar className="size-10 rounded-lg">
                {user?.avatar_url ? (
                  <AvatarImage src={user.avatar_url} alt={displayName} />
                ) : null}
                <AvatarFallback className="rounded-lg">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{displayName}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {email}
                </p>
              </div>
            </div>
            <ProfileForm />
            <ChangePasswordForm />
          </TabsContent>
          <TabsContent value="workspace">
            <WorkspaceMembersPanel />
          </TabsContent>
          <TabsContent value="integrations">
            <McpIntegrationsPanel />
          </TabsContent>
          <TabsContent value="appearance" className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium">{t("Theme")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("Choose the app's appearance.")}
              </p>
            </div>
            <ThemeSelector />
            <div className="flex items-start gap-3 border-t pt-5">
              <Checkbox
                id="page-full-width"
                data-cy="page-full-width"
                checked={fullWidth}
                onCheckedChange={(checked) => setFullWidth(checked === true)}
              />
              <div className="grid gap-1">
                <label htmlFor="page-full-width" className="font-medium">
                  {t("Full width")}
                </label>
                <p className="text-sm text-muted-foreground">
                  {t("Use all available width for page content.")}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t pt-5">
              <div>
                <h3 className="font-medium">{t("Language")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("Choose the language used by the app.")}
                </p>
              </div>
              <LanguageSelector />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
