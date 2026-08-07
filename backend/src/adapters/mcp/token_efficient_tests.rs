use super::*;

use serde_json::json;

fn principal(scopes: Vec<IntegrationScope>) -> IntegrationPrincipal {
    IntegrationPrincipal {
        token_id: Uuid::new_v4(),
        user_id: Uuid::new_v4(),
        scopes,
        workspace_ids: vec![Uuid::new_v4()],
    }
}

fn schema_for(principal: &IntegrationPrincipal, name: &str) -> Value {
    tools_for(principal)
        .into_iter()
        .find(|tool| tool["name"] == name)
        .unwrap_or_else(|| panic!("{name} should be visible for this token"))["inputSchema"]
        .clone()
}

#[test]
fn compact_envelope_has_one_machine_readable_copy_and_a_short_safe_summary() {
    let result = json!({
        "items": [{"id": Uuid::new_v4(), "properties": {"text": "private draft"}}],
        "next_cursor": null
    });
    let response = compact_result("Returned 1 block.", result.clone()).unwrap();

    let summary = response["content"][0]["text"].as_str().unwrap();
    assert!(summary.len() <= 200);
    assert!(!summary.contains("private draft"));
    assert_eq!(response["structuredContent"]["result"], result);
    assert_ne!(summary, response["structuredContent"]["result"].to_string());
    assert_eq!(response["isError"], false);
}

#[test]
fn compact_envelope_rejects_or_truncates_overlong_summaries_without_echoing_result_data() {
    let secret = "not-for-content".repeat(30);
    let response = compact_result(&secret, json!({"properties": {"text": secret}})).unwrap();

    let summary = response["content"][0]["text"].as_str().unwrap();
    assert!(summary.len() <= 200);
    assert!(!summary.contains("not-for-content"));
}

#[test]
fn tool_catalog_is_reduced_to_the_scopes_granted_to_the_integration() {
    let read_only = principal(vec![IntegrationScope::ContentRead]);
    let names = tools_for(&read_only)
        .into_iter()
        .map(|tool| tool["name"].as_str().unwrap().to_owned())
        .collect::<Vec<_>>();

    assert!(names.contains(&"reason_list_workspaces".to_owned()));
    assert!(names.contains(&"reason_list_pages".to_owned()));
    assert!(names.contains(&"reason_read_page".to_owned()));
    assert!(names.contains(&"reason_query_blocks".to_owned()));
    assert!(!names.contains(&"reason_apply_operations".to_owned()));
    assert!(!names.contains(&"reason_apply_operations_compact".to_owned()));
    assert!(!names.contains(&"reason_search".to_owned()));
    assert!(!names.contains(&"reason_get_image".to_owned()));
    assert!(!names.contains(&"reason_list_pull_requests".to_owned()));

    let writer = principal(vec![
        IntegrationScope::ContentRead,
        IntegrationScope::ContentWrite,
        IntegrationScope::SearchRead,
        IntegrationScope::MediaRead,
        IntegrationScope::GitHubRead,
        IntegrationScope::GitHubWrite,
    ]);
    let writer_names = tools_for(&writer)
        .into_iter()
        .map(|tool| tool["name"].as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    assert!(writer_names.contains(&"reason_apply_operations".to_owned()));
    assert!(writer_names.contains(&"reason_apply_operations_compact".to_owned()));
    assert!(writer_names.contains(&"reason_search".to_owned()));
    assert!(writer_names.contains(&"reason_get_image".to_owned()));
    assert!(writer_names.contains(&"reason_list_pull_requests".to_owned()));
    assert!(writer_names.contains(&"reason_link_pull_request".to_owned()));
}

#[test]
fn denied_workspace_grants_return_permission_denied() {
    let principal = principal(vec![IntegrationScope::ContentRead]);
    let outside_grant = Uuid::new_v4();

    let error = authorize(&principal, IntegrationScope::ContentRead, outside_grant).unwrap_err();
    assert_eq!(
        error["structuredContent"]["error"]["code"],
        "permission_denied"
    );
}

#[test]
fn structured_errors_keep_a_stable_code_and_the_correctable_argument_path() {
    let response = structured_tool_error(
        "invalid_arguments",
        "Invalid tool arguments",
        Some("operations[1].parent_ref"),
        Some("a previously declared client_ref"),
    );

    assert_eq!(response["isError"], true);
    assert_eq!(
        response["structuredContent"]["error"]["code"],
        "invalid_arguments"
    );
    assert_eq!(
        response["structuredContent"]["error"]["path"],
        "operations[1].parent_ref"
    );
    assert_eq!(
        response["structuredContent"]["error"]["expected"],
        "a previously declared client_ref"
    );
    assert_eq!(response["content"][0]["text"], "Invalid tool arguments");
}

#[test]
fn argument_deserialization_reports_the_failing_field_path() {
    let error = parse_arguments::<SearchInput>(json!({
        "workspace_id": Uuid::new_v4(),
        "query": "blocks",
        "limit": "many"
    }))
    .unwrap_err();

    assert_eq!(
        error["structuredContent"]["error"]["code"],
        "invalid_arguments"
    );
    assert_eq!(error["structuredContent"]["error"]["path"], "limit");
}

#[test]
fn canonical_replay_conflicts_have_a_stable_operation_conflict_code() {
    let error = app_tool_error(AppError::Domain(
        crate::domain::error::DomainError::Validation(
            "Operation replay conflicts with persisted operation",
        ),
    ));

    assert_eq!(
        error["structuredContent"]["error"]["code"],
        "operation_conflict"
    );
}

#[test]
fn query_blocks_schema_carries_exact_filter_order_and_pagination_contract() {
    let schema = schema_for(
        &principal(vec![IntegrationScope::ContentRead]),
        "reason_query_blocks",
    );
    let properties = &schema["properties"];

    assert_eq!(schema["required"], json!(["workspace_id", "parent_id"]));
    assert_eq!(properties["parent_id"]["format"], "uuid");
    assert_eq!(
        properties["block_type"]["enum"],
        block_type_schema()["enum"]
    );
    assert_eq!(properties["property_equals"]["maxProperties"], 8);
    assert_eq!(properties["limit"]["minimum"], 1);
    assert_eq!(properties["limit"]["maximum"], 100);
    assert_eq!(properties["cursor"]["type"], json!(["string", "null"]));
    assert!(properties["include_trashed"].is_object());
    assert_eq!(
        properties["fields"]["items"]["enum"],
        json!([
            "id",
            "type",
            "parentId",
            "properties",
            "content",
            "propVersions",
            "trashedAt",
            "trashedIndex"
        ])
    );
}

#[test]
fn compact_page_read_schema_requires_compact_mode_and_bounded_projection() {
    let schema = schema_for(
        &principal(vec![IntegrationScope::ContentRead]),
        "reason_read_page",
    );
    let properties = &schema["properties"];

    assert_eq!(
        properties["response_mode"]["enum"],
        json!(["legacy", "compact"])
    );
    assert_eq!(properties["max_depth"]["minimum"], 0);
    assert_eq!(properties["max_depth"]["maximum"], 32);
    assert_eq!(properties["max_chars"]["minimum"], 1000);
    assert_eq!(properties["max_chars"]["maximum"], 100000);
    assert_eq!(properties["cursor"]["type"], json!(["string", "null"]));
    assert!(properties["fields"].is_object());
    assert!(properties["property_keys"].is_object());
}

#[test]
fn compact_operation_schema_uses_references_and_hides_server_owned_metadata() {
    let schema = schema_for(
        &principal(vec![IntegrationScope::ContentWrite]),
        "reason_apply_operations_compact",
    );
    let properties = &schema["properties"];
    let insert = &properties["operations"]["items"]["oneOf"][0];

    assert_eq!(
        schema["required"],
        json!(["workspace_id", "request_id", "operations"])
    );
    assert_eq!(properties["operations"]["minItems"], 1);
    assert_eq!(properties["operations"]["maxItems"], 50);
    assert_eq!(
        insert["properties"]["client_ref"]["pattern"],
        "^[A-Za-z][A-Za-z0-9_-]{0,63}$"
    );
    assert!(insert["properties"].get("opId").is_none());
    assert!(insert["properties"].get("workspaceId").is_none());
    assert!(insert["properties"].get("id").is_none());
    assert!(insert["properties"].get("content").is_none());
    assert!(insert["properties"].get("trashedAt").is_none());
}

#[test]
fn signed_cursor_detects_tampering_stale_workspaces_and_filter_mismatches() {
    let key = b"unit-test-cursor-signing-key";
    let workspace_id = Uuid::new_v4();
    let parent_id = Uuid::new_v4();
    let payload = CursorPayload {
        workspace_id,
        subject_id: parent_id,
        workspace_seq: 41,
        position: 3,
        fingerprint: "status=todo|type=database_row".to_owned(),
    };
    let cursor = encode_cursor(&payload, key).unwrap();
    assert_eq!(decode_cursor(&cursor, key).unwrap(), payload);

    let mut tampered = cursor.into_bytes();
    let last = tampered.len() - 1;
    tampered[last] ^= 1;
    let tampered = String::from_utf8(tampered).unwrap();
    assert_eq!(
        decode_cursor(&tampered, key).unwrap_err()["code"],
        "invalid_arguments"
    );

    assert_eq!(
        validate_cursor(&payload, workspace_id, parent_id, 42, &payload.fingerprint).unwrap_err()["code"],
        "stale_cursor"
    );
    assert_eq!(
        validate_cursor(
            &payload,
            workspace_id,
            parent_id,
            41,
            "status=done|type=database_row"
        )
        .unwrap_err()["code"],
        "invalid_arguments"
    );
}

#[test]
fn compact_drafts_resolve_backward_references_to_stable_canonical_operations() {
    let workspace_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let database_id = Uuid::new_v4();
    let drafts = json!([
        {
            "type": "insert_block",
            "client_ref": "post",
            "parent_id": database_id,
            "index": 0,
            "block_type": "database_row",
            "properties": {"title": "Harness", "status": "todo"},
            "prop_versions": {"status": 1}
        },
        {
            "type": "insert_block",
            "client_ref": "intro",
            "parent_ref": "post",
            "index": 0,
            "block_type": "paragraph",
            "properties": {"text": "Opening"}
        }
    ]);

    let first = compile_compact_operations(workspace_id, request_id, drafts.clone()).unwrap();
    let replay = compile_compact_operations(workspace_id, request_id, drafts).unwrap();

    assert_eq!(first.created, replay.created);
    assert_eq!(
        serde_json::to_value(&first.operations).unwrap(),
        serde_json::to_value(&replay.operations).unwrap()
    );
    assert_eq!(first.operations.len(), 2);
    assert!(matches!(
        &first.operations[0],
        Operation::InsertBlock { block, parent_id, .. }
            if *parent_id == database_id && block.workspace_id == workspace_id && block.content.is_empty()
                && block.trashed_at.is_none() && block.trashed_index.is_none()
    ));
    let post_id = *first.created.get("post").unwrap();
    assert!(matches!(
        &first.operations[1],
        Operation::InsertBlock { block, parent_id, .. }
            if *parent_id == post_id && block.parent_id == Some(post_id)
    ));
}

#[test]
fn compact_drafts_reject_duplicate_and_forward_references_before_any_canonical_operation() {
    let workspace_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let parent_id = Uuid::new_v4();
    let forward = json!([
        {"type":"insert_block","client_ref":"child","parent_ref":"post","index":0,"block_type":"paragraph","properties":{}},
        {"type":"insert_block","client_ref":"post","parent_id":parent_id,"index":0,"block_type":"paragraph","properties":{}}
    ]);
    let duplicate = json!([
        {"type":"insert_block","client_ref":"post","parent_id":parent_id,"index":0,"block_type":"paragraph","properties":{}},
        {"type":"insert_block","client_ref":"post","parent_id":parent_id,"index":1,"block_type":"paragraph","properties":{}}
    ]);

    assert_eq!(
        compile_compact_operations(workspace_id, request_id, forward).unwrap_err()["path"],
        "operations[0].parent_ref"
    );
    assert_eq!(
        compile_compact_operations(workspace_id, request_id, duplicate).unwrap_err()["path"],
        "operations[1].client_ref"
    );
}

#[test]
fn compact_drafts_reject_server_owned_or_unknown_fields() {
    let workspace_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let parent_id = Uuid::new_v4();
    let drafts = json!([{
        "type": "insert_block",
        "client_ref": "post",
        "parent_id": parent_id,
        "index": 0,
        "block_type": "paragraph",
        "properties": {},
        "opId": Uuid::new_v4()
    }]);

    assert_eq!(
        compile_compact_operations(workspace_id, request_id, drafts).unwrap_err()["path"],
        "operations[0].opId"
    );
}

#[test]
fn deleted_blocks_are_not_read_back_after_the_canonical_commit() {
    let deleted_id = Uuid::new_v4();
    let updated_id = Uuid::new_v4();
    let operations = vec![
        Operation::DeleteBlock {
            op_id: Uuid::new_v4(),
            block_id: deleted_id,
        },
        Operation::UpdateBlock {
            op_id: Uuid::new_v4(),
            block_id: updated_id,
            block_type: None,
            properties: None,
            prop_versions: Some(Default::default()),
        },
    ];

    assert_eq!(snapshot_candidate_ids(&operations), vec![updated_id]);
}

#[test]
fn compact_payload_for_a_twenty_paragraph_post_is_at_least_thirty_five_percent_smaller() {
    let workspace_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let database_id = Uuid::new_v4();
    let compact = compact_post_fixture(workspace_id, request_id, database_id, 20);
    let canonical = canonical_post_fixture(workspace_id, request_id, database_id, 20);

    let compact_len = serde_json::to_vec(&compact).unwrap().len();
    let canonical_len = serde_json::to_vec(&canonical).unwrap().len();
    assert!(
        compact_len * 100 <= canonical_len * 65,
        "compact={compact_len} canonical={canonical_len}"
    );
}

#[test]
fn compact_one_hundred_block_response_is_at_least_forty_percent_smaller_than_legacy() {
    let value = hundred_block_fixture();
    let legacy_len = serde_json::to_vec(&text_result(&value).unwrap())
        .unwrap()
        .len();
    let compact_len = serde_json::to_vec(&compact_result("Returned 100 blocks.", value).unwrap())
        .unwrap()
        .len();
    assert!(
        compact_len * 100 <= legacy_len * 60,
        "compact={compact_len} legacy={legacy_len}"
    );
}

fn compact_post_fixture(
    workspace_id: Uuid,
    request_id: Uuid,
    database_id: Uuid,
    paragraphs: usize,
) -> Value {
    let mut operations = vec![json!({
        "type": "insert_block",
        "client_ref": "post",
        "parent_id": database_id,
        "index": 0,
        "block_type": "database_row",
        "properties": {"title": "A token-efficient draft", "status": "todo"},
        "prop_versions": {"status": 1}
    })];
    operations.extend((0..paragraphs).map(|index| {
        json!({
            "type": "insert_block",
            "client_ref": format!("paragraph_{index}"),
            "parent_ref": "post",
            "index": index,
            "block_type": "paragraph",
            "properties": {"text": format!("Paragraph {index}: useful post content.")}
        })
    }));
    json!({"workspace_id": workspace_id, "request_id": request_id, "operations": operations})
}

fn canonical_post_fixture(
    workspace_id: Uuid,
    _request_id: Uuid,
    database_id: Uuid,
    paragraphs: usize,
) -> Value {
    let post_id = Uuid::new_v4();
    let mut operations = vec![json!({
        "type": "insert_block",
        "opId": Uuid::new_v4(),
        "block": {
            "id": post_id,
            "workspaceId": workspace_id,
            "type": "database_row",
            "properties": {"title": "A token-efficient draft", "status": "todo"},
            "propVersions": {"status": 1},
            "content": [],
            "parentId": database_id,
            "trashedAt": null,
            "trashedIndex": null
        },
        "parentId": database_id,
        "index": 0
    })];
    operations.extend((0..paragraphs).map(|index| {
        let block_id = Uuid::new_v4();
        json!({
            "type": "insert_block",
            "opId": Uuid::new_v4(),
            "block": {
                "id": block_id,
                "workspaceId": workspace_id,
                "type": "paragraph",
                "properties": {"text": format!("Paragraph {index}: useful post content.")},
                "propVersions": {},
                "content": [],
                "parentId": post_id,
                "trashedAt": null,
                "trashedIndex": null
            },
            "parentId": post_id,
            "index": index
        })
    }));
    json!({"workspace_id": workspace_id, "operations": operations})
}

fn hundred_block_fixture() -> Value {
    json!({
        "blocks": (0..100)
            .map(|index| json!({
                "id": Uuid::new_v4(),
                "type": "paragraph",
                "parentId": Uuid::new_v4(),
                "properties": {"text": format!("Block {index} with enough text to make duplication meaningful.")},
                "content": [],
                "propVersions": {},
                "trashedAt": null,
                "trashedIndex": null
            }))
            .collect::<Vec<_>>(),
        "next_cursor": null,
        "workspace_seq": 44,
        "truncated": false
    })
}
