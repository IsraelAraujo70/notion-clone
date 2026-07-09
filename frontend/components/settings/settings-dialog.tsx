"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChangePasswordForm } from "@/components/settings/change-password-form"
import { ProfileForm } from "@/components/settings/profile-form"
import { ThemeSelector } from "@/components/settings/theme-selector"
import { WorkspaceMembersPanel } from "@/components/settings/workspace-members-panel"
import { useAuth } from "@/lib/auth"

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
  const displayName = user?.display_name || "Usuário"
  const email = user?.email || "Sessão ativa"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-cy="settings-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            Gerencie sua conta, workspace e aparência.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="account" className="gap-5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="account">Conta</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="appearance">Aparência</TabsTrigger>
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
          <TabsContent value="appearance" className="flex flex-col gap-3">
            <div>
              <h3 className="font-medium">Tema</h3>
              <p className="text-sm text-muted-foreground">
                Escolha a aparência do app.
              </p>
            </div>
            <ThemeSelector />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
