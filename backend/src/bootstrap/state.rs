use std::sync::Arc;

use sqlx::PgPool;

use crate::adapters::email::noop::NoopEmailSender;
use crate::adapters::email::resend::ResendEmailSender;
use crate::adapters::postgres::{PostgresAuthRepository, PostgresWorkspaceRepository};
use crate::application::auth::{
    ChangePasswordUseCase, GetCurrentUserUseCase, LoginUseCase, LogoutUseCase,
    RequestPasswordResetUseCase, ResetPasswordUseCase, SignupUseCase,
};
use crate::application::ports::auth::AuthRepository;
use crate::application::ports::clock::{Clock, SystemClock};
use crate::application::ports::email::EmailSender;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::{
    AcceptInviteUseCase, CreateWorkspaceUseCase, InviteMemberUseCase, ListInvitesUseCase,
    ListMembersUseCase, ListWorkspacesUseCase, RemoveMemberUseCase, RevokeInviteUseCase,
    UpdateMemberRoleUseCase,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub signup: SignupUseCase,
    pub login: LoginUseCase,
    pub logout: LogoutUseCase,
    pub request_password_reset: RequestPasswordResetUseCase,
    pub reset_password: ResetPasswordUseCase,
    pub change_password: ChangePasswordUseCase,
    pub get_current_user: GetCurrentUserUseCase,
    pub list_workspaces: ListWorkspacesUseCase,
    pub create_workspace: CreateWorkspaceUseCase,
    pub list_members: ListMembersUseCase,
    pub list_invites: ListInvitesUseCase,
    pub invite_member: InviteMemberUseCase,
    pub revoke_invite: RevokeInviteUseCase,
    pub update_member_role: UpdateMemberRoleUseCase,
    pub remove_member: RemoveMemberUseCase,
    pub accept_invite: AcceptInviteUseCase,
}

impl AppState {
    pub fn from_parts(
        pool: PgPool,
        public_web_url: String,
        resend_api_key: Option<String>,
        resend_from_email: String,
    ) -> Self {
        let auth_repository: Arc<dyn AuthRepository> =
            Arc::new(PostgresAuthRepository::new(pool.clone()));
        let workspace_repository: Arc<dyn WorkspaceRepository> =
            Arc::new(PostgresWorkspaceRepository::new(pool.clone()));
        let clock: Arc<dyn Clock> = Arc::new(SystemClock);
        let email_sender: Arc<dyn EmailSender> = match resend_api_key {
            Some(api_key) => Arc::new(ResendEmailSender::new(api_key, resend_from_email)),
            None => Arc::new(NoopEmailSender),
        };

        Self {
            pool,
            signup: SignupUseCase::new(auth_repository.clone(), clock.clone()),
            login: LoginUseCase::new(auth_repository.clone(), clock.clone()),
            logout: LogoutUseCase::new(auth_repository.clone()),
            request_password_reset: RequestPasswordResetUseCase::new(
                auth_repository.clone(),
                email_sender.clone(),
                clock.clone(),
                public_web_url.clone(),
            ),
            reset_password: ResetPasswordUseCase::new(auth_repository.clone(), clock.clone()),
            change_password: ChangePasswordUseCase::new(auth_repository.clone()),
            get_current_user: GetCurrentUserUseCase::new(auth_repository.clone(), clock.clone()),
            list_workspaces: ListWorkspacesUseCase::new(workspace_repository.clone()),
            create_workspace: CreateWorkspaceUseCase::new(workspace_repository.clone()),
            list_members: ListMembersUseCase::new(workspace_repository.clone()),
            list_invites: ListInvitesUseCase::new(workspace_repository.clone(), clock.clone()),
            invite_member: InviteMemberUseCase::new(
                workspace_repository.clone(),
                email_sender.clone(),
                clock.clone(),
                public_web_url,
            ),
            revoke_invite: RevokeInviteUseCase::new(workspace_repository.clone(), clock.clone()),
            update_member_role: UpdateMemberRoleUseCase::new(workspace_repository.clone()),
            remove_member: RemoveMemberUseCase::new(workspace_repository.clone()),
            accept_invite: AcceptInviteUseCase::new(workspace_repository.clone(), clock.clone()),
        }
    }
}
