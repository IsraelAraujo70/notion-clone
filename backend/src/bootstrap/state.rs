use std::sync::Arc;

use sqlx::PgPool;

use crate::adapters::email::noop::NoopEmailSender;
use crate::adapters::email::resend::ResendEmailSender;
use crate::adapters::postgres::{
    PostgresAuthRepository, PostgresPageRepository, PostgresWorkspaceRepository,
};
use crate::adapters::storage::{NoopObjectStorage, S3Config, S3ObjectStorage};
use crate::application::auth::{
    ChangePasswordUseCase, GetCurrentUserUseCase, LoginUseCase, LogoutUseCase,
    PresignAvatarUseCase, RequestPasswordResetUseCase, ResetPasswordUseCase, SignupUseCase,
    UpdateProfileUseCase,
};
use crate::application::pages::{
    ApplyOperationUseCase, GetPageUseCase, ListOperationsUseCase, ListPagesUseCase,
    ListTrashUseCase, PresignPageImageUseCase,
};
use crate::application::ports::auth::AuthRepository;
use crate::application::ports::clock::{Clock, SystemClock};
use crate::application::ports::email::EmailSender;
use crate::application::ports::page::PageRepository;
use crate::application::ports::storage::ObjectStorage;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::realtime::RealtimeHub;
use crate::application::workspaces::{
    AcceptInviteUseCase, CreateWorkspaceUseCase, DeleteWorkspaceUseCase, InviteMemberUseCase,
    ListInvitesUseCase, ListMembersUseCase, ListWorkspacesUseCase, RemoveMemberUseCase,
    RevokeInviteUseCase, UpdateMemberRoleUseCase,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub hub: RealtimeHub,
    pub storage: Arc<dyn ObjectStorage>,
    pub signup: SignupUseCase,
    pub login: LoginUseCase,
    pub logout: LogoutUseCase,
    pub request_password_reset: RequestPasswordResetUseCase,
    pub reset_password: ResetPasswordUseCase,
    pub change_password: ChangePasswordUseCase,
    pub get_current_user: GetCurrentUserUseCase,
    pub update_profile: UpdateProfileUseCase,
    pub presign_avatar: PresignAvatarUseCase,
    pub list_workspaces: ListWorkspacesUseCase,
    pub create_workspace: CreateWorkspaceUseCase,
    pub delete_workspace: DeleteWorkspaceUseCase,
    pub list_members: ListMembersUseCase,
    pub list_invites: ListInvitesUseCase,
    pub invite_member: InviteMemberUseCase,
    pub revoke_invite: RevokeInviteUseCase,
    pub update_member_role: UpdateMemberRoleUseCase,
    pub remove_member: RemoveMemberUseCase,
    pub accept_invite: AcceptInviteUseCase,
    pub list_pages: ListPagesUseCase,
    pub get_page: GetPageUseCase,
    pub apply_operation: ApplyOperationUseCase,
    pub list_operations: ListOperationsUseCase,
    pub list_trash: ListTrashUseCase,
    pub presign_page_image: PresignPageImageUseCase,
}

impl AppState {
    pub fn from_parts(
        pool: PgPool,
        public_web_url: String,
        resend_api_key: Option<String>,
        resend_from_email: String,
        s3: Option<S3Config>,
    ) -> Self {
        let auth_repository: Arc<dyn AuthRepository> =
            Arc::new(PostgresAuthRepository::new(pool.clone()));
        let workspace_repository: Arc<dyn WorkspaceRepository> =
            Arc::new(PostgresWorkspaceRepository::new(pool.clone()));
        let page_repository: Arc<dyn PageRepository> =
            Arc::new(PostgresPageRepository::new(pool.clone()));
        let clock: Arc<dyn Clock> = Arc::new(SystemClock);
        let hub = RealtimeHub::new();
        let storage: Arc<dyn ObjectStorage> = match s3 {
            Some(config) => Arc::new(S3ObjectStorage::new(config)),
            None => Arc::new(NoopObjectStorage),
        };
        let email_sender: Arc<dyn EmailSender> = match resend_api_key {
            Some(api_key) => Arc::new(ResendEmailSender::new(api_key, resend_from_email)),
            None => Arc::new(NoopEmailSender),
        };

        Self {
            pool,
            hub: hub.clone(),
            storage: storage.clone(),
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
            update_profile: UpdateProfileUseCase::new(auth_repository.clone(), storage.clone()),
            presign_avatar: PresignAvatarUseCase::new(storage.clone()),
            list_workspaces: ListWorkspacesUseCase::new(workspace_repository.clone()),
            create_workspace: CreateWorkspaceUseCase::new(workspace_repository.clone()),
            delete_workspace: DeleteWorkspaceUseCase::new(workspace_repository.clone()),
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
            list_pages: ListPagesUseCase::new(
                page_repository.clone(),
                workspace_repository.clone(),
            ),
            get_page: GetPageUseCase::new(page_repository.clone(), workspace_repository.clone()),
            apply_operation: ApplyOperationUseCase::new(
                page_repository.clone(),
                workspace_repository.clone(),
                clock.clone(),
                hub,
            ),
            list_operations: ListOperationsUseCase::new(
                page_repository.clone(),
                workspace_repository.clone(),
            ),
            list_trash: ListTrashUseCase::new(page_repository, workspace_repository.clone()),
            presign_page_image: PresignPageImageUseCase::new(workspace_repository, storage),
        }
    }
}
