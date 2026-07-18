use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::domain::error::DomainError;

// Espelho Rust de `frontend/lib/engine/tree.ts`. O contrato canônico está em
// `docs/protocolo.md`; os testes daqui replicam os testes do engine TS.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    Page,
    Paragraph,
    Heading1,
    Heading2,
    Heading3,
    BulletedListItem,
    NumberedListItem,
    ToDo,
    Toggle,
    Quote,
    Code,
    Callout,
    Divider,
    Image,
    Mermaid,
    Database,
    DatabaseRow,
}

impl BlockType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Page => "page",
            Self::Paragraph => "paragraph",
            Self::Heading1 => "heading1",
            Self::Heading2 => "heading2",
            Self::Heading3 => "heading3",
            Self::BulletedListItem => "bulleted_list_item",
            Self::NumberedListItem => "numbered_list_item",
            Self::ToDo => "to_do",
            Self::Toggle => "toggle",
            Self::Quote => "quote",
            Self::Code => "code",
            Self::Callout => "callout",
            Self::Divider => "divider",
            Self::Image => "image",
            Self::Mermaid => "mermaid",
            Self::Database => "database",
            Self::DatabaseRow => "database_row",
        }
    }
}

pub fn parse_block_type(value: &str) -> Result<BlockType, DomainError> {
    match value {
        "page" => Ok(BlockType::Page),
        "paragraph" => Ok(BlockType::Paragraph),
        "heading1" => Ok(BlockType::Heading1),
        "heading2" => Ok(BlockType::Heading2),
        "heading3" => Ok(BlockType::Heading3),
        "bulleted_list_item" => Ok(BlockType::BulletedListItem),
        "numbered_list_item" => Ok(BlockType::NumberedListItem),
        "to_do" => Ok(BlockType::ToDo),
        "toggle" => Ok(BlockType::Toggle),
        "quote" => Ok(BlockType::Quote),
        "code" => Ok(BlockType::Code),
        "callout" => Ok(BlockType::Callout),
        "divider" => Ok(BlockType::Divider),
        "image" => Ok(BlockType::Image),
        "mermaid" => Ok(BlockType::Mermaid),
        "database" => Ok(BlockType::Database),
        "database_row" => Ok(BlockType::DatabaseRow),
        _ => Err(DomainError::Validation("Unknown block type")),
    }
}

/// Versão sintética para LWW de `block_type` (não colide com props do produto).
pub const TYPE_PROP_VERSION_KEY: &str = "_type";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: Uuid,
    pub workspace_id: Uuid,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub properties: Map<String, Value>,
    /// Contadores LWW por chave de propriedade (e `_type` para mudança de tipo).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub prop_versions: HashMap<String, i64>,
    pub content: Vec<Uuid>,
    pub parent_id: Option<Uuid>,
    pub trashed_at: Option<DateTime<Utc>>,
    pub trashed_index: Option<i32>,
}

impl Block {
    pub fn title(&self) -> String {
        self.properties
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Operation {
    InsertBlock {
        op_id: Uuid,
        block: Block,
        parent_id: Uuid,
        index: i64,
    },
    UpdateBlock {
        op_id: Uuid,
        block_id: Uuid,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        block_type: Option<BlockType>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        properties: Option<Map<String, Value>>,
        /// Versão que o cliente está escrevendo por propriedade. Menor que a
        /// armazenada = patch daquela chave é ignorado (LWW).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prop_versions: Option<HashMap<String, i64>>,
    },
    MoveBlock {
        op_id: Uuid,
        block_id: Uuid,
        new_parent_id: Uuid,
        index: i64,
    },
    DeleteBlock {
        op_id: Uuid,
        block_id: Uuid,
    },
    RestoreBlock {
        op_id: Uuid,
        block_id: Uuid,
    },
    TransferSubtreeOut {
        op_id: Uuid,
        transfer_id: Uuid,
        block_id: Uuid,
        destination_workspace_id: Uuid,
    },
    TransferSubtreeIn {
        op_id: Uuid,
        transfer_id: Uuid,
        blocks: Vec<Block>,
        parent_id: Uuid,
        index: i64,
        source_workspace_id: Uuid,
    },
}

impl Operation {
    pub fn op_id(&self) -> Uuid {
        match self {
            Self::InsertBlock { op_id, .. }
            | Self::UpdateBlock { op_id, .. }
            | Self::MoveBlock { op_id, .. }
            | Self::DeleteBlock { op_id, .. }
            | Self::RestoreBlock { op_id, .. }
            | Self::TransferSubtreeOut { op_id, .. }
            | Self::TransferSubtreeIn { op_id, .. } => *op_id,
        }
    }
}

/// Todos os blocos de um workspace (vivos e trashed), indexados por id.
#[derive(Debug, Default, Clone)]
pub struct BlockTree {
    pub blocks: HashMap<Uuid, Block>,
}

impl BlockTree {
    pub fn from_blocks(blocks: Vec<Block>) -> Self {
        Self {
            blocks: blocks.into_iter().map(|block| (block.id, block)).collect(),
        }
    }

    fn get(&self, id: Uuid) -> Result<&Block, DomainError> {
        self.blocks
            .get(&id)
            .ok_or(DomainError::Validation("Block not found"))
    }

    fn is_descendant(&self, ancestor_id: Uuid, id: Uuid) -> bool {
        let mut seen = 0usize;
        let mut current = self.blocks.get(&id);
        while let Some(block) = current {
            let Some(parent_id) = block.parent_id else {
                return false;
            };
            if parent_id == ancestor_id {
                return true;
            }
            seen += 1;
            if seen > self.blocks.len() {
                return false;
            }
            current = self.blocks.get(&parent_id);
        }
        false
    }
}

fn clamp_index(index: i64, length: usize) -> usize {
    index.clamp(0, length as i64) as usize
}

/// LWW: aplica se `op_version >= stored` (empate vence por ordem de chegada).
/// Sem versão na op, trata como `stored + 1` (compat scripts M2).
fn lww_accept(
    stored: &HashMap<String, i64>,
    op_versions: Option<&HashMap<String, i64>>,
    key: &str,
) -> Option<i64> {
    let current = stored.get(key).copied().unwrap_or(0);
    let incoming = match op_versions.and_then(|versions| versions.get(key).copied()) {
        Some(version) => version,
        None => current + 1,
    };
    if incoming < current {
        None
    } else {
        Some(incoming)
    }
}

fn validate_database_relationship(parent: BlockType, child: BlockType) -> Result<(), DomainError> {
    if parent == BlockType::Database && child != BlockType::DatabaseRow {
        return Err(DomainError::Validation(
            "database only accepts database_row children",
        ));
    }
    if child == BlockType::DatabaseRow && parent != BlockType::Database {
        return Err(DomainError::Validation(
            "database_row must belong to a database",
        ));
    }
    Ok(())
}

fn validate_block_type_change(
    tree: &BlockTree,
    block: &Block,
    next_type: BlockType,
) -> Result<(), DomainError> {
    if let Some(parent_id) = block.parent_id {
        validate_database_relationship(tree.get(parent_id)?.block_type, next_type)?;
    } else if next_type == BlockType::DatabaseRow {
        return Err(DomainError::Validation(
            "database_row must belong to a database",
        ));
    }
    for child in tree
        .blocks
        .values()
        .filter(|child| child.parent_id == Some(block.id))
    {
        validate_database_relationship(next_type, child.block_type)?;
    }
    Ok(())
}

/// Aplica a operação in-place e devolve os ids dos blocos que mudaram (para persistir).
pub fn apply_operation(
    tree: &mut BlockTree,
    operation: &Operation,
    workspace_id: Uuid,
    now: DateTime<Utc>,
) -> Result<Vec<Uuid>, DomainError> {
    match operation {
        Operation::InsertBlock {
            block,
            parent_id,
            index,
            ..
        } => {
            if tree.blocks.contains_key(&block.id) {
                return Err(DomainError::Validation("Duplicate block id"));
            }
            if !block.content.is_empty() {
                return Err(DomainError::Validation(
                    "insert_block requires empty content",
                ));
            }
            let parent = tree.get(*parent_id)?;
            if parent.trashed_at.is_some() {
                return Err(DomainError::Validation("Cannot insert into trashed block"));
            }
            validate_database_relationship(parent.block_type, block.block_type)?;
            let at = clamp_index(*index, parent.content.len());
            let mut inserted = block.clone();
            inserted.workspace_id = workspace_id;
            inserted.parent_id = Some(*parent_id);
            inserted.trashed_at = None;
            inserted.trashed_index = None;
            tree.blocks.insert(inserted.id, inserted);

            let parent = tree.blocks.get_mut(parent_id).expect("parent exists");
            parent.content.insert(at, block.id);
            Ok(vec![block.id, *parent_id])
        }

        Operation::UpdateBlock {
            block_id,
            block_type,
            properties,
            prop_versions,
            ..
        } => {
            let block = tree.get(*block_id)?;
            if block.trashed_at.is_some() {
                return Err(DomainError::Validation("Cannot update trashed block"));
            }
            let op_versions = prop_versions.as_ref();
            let accepted_type_change = block_type.and_then(|next_type| {
                lww_accept(&block.prop_versions, op_versions, TYPE_PROP_VERSION_KEY)
                    .map(|version| (next_type, version))
            });
            if let Some((next_type, _)) = accepted_type_change {
                validate_block_type_change(tree, block, next_type)?;
            }
            let block = tree.blocks.get_mut(block_id).expect("block exists");
            if let Some((next_type, version)) = accepted_type_change {
                block.block_type = next_type;
                block
                    .prop_versions
                    .insert(TYPE_PROP_VERSION_KEY.to_string(), version);
            }
            if let Some(patch) = properties {
                for (key, value) in patch {
                    let Some(version) = lww_accept(&block.prop_versions, op_versions, key) else {
                        continue;
                    };
                    if value.is_null() {
                        block.properties.remove(key);
                    } else {
                        block.properties.insert(key.clone(), value.clone());
                    }
                    block.prop_versions.insert(key.clone(), version);
                }
            }
            Ok(vec![*block_id])
        }

        Operation::MoveBlock {
            block_id,
            new_parent_id,
            index,
            ..
        } => {
            let block = tree.get(*block_id)?;
            if block.trashed_at.is_some() {
                return Err(DomainError::Validation("Cannot move trashed block"));
            }
            let Some(old_parent_id) = block.parent_id else {
                return Err(DomainError::Validation("Cannot move the root block"));
            };
            if block_id == new_parent_id {
                return Err(DomainError::Validation("Cannot move block into itself"));
            }
            if tree.is_descendant(*block_id, *new_parent_id) {
                return Err(DomainError::Validation("Move would create a cycle"));
            }
            let new_parent = tree.get(*new_parent_id)?;
            if new_parent.trashed_at.is_some() {
                return Err(DomainError::Validation("Cannot move into trashed block"));
            }
            validate_database_relationship(new_parent.block_type, block.block_type)?;

            let old_parent = tree.get(old_parent_id)?;
            if !old_parent.content.contains(block_id) {
                return Err(DomainError::Validation("content/parentId mismatch"));
            }

            let old_parent_mut = tree.blocks.get_mut(&old_parent_id).expect("parent exists");
            old_parent_mut.content.retain(|id| id != block_id);
            let same_parent = old_parent_id == *new_parent_id;

            let new_parent_mut = tree.blocks.get_mut(new_parent_id).expect("parent exists");
            let at = clamp_index(*index, new_parent_mut.content.len());
            new_parent_mut.content.insert(at, *block_id);

            let moved = tree.blocks.get_mut(block_id).expect("block exists");
            moved.parent_id = Some(*new_parent_id);

            Ok(if same_parent {
                vec![*block_id, old_parent_id]
            } else {
                vec![*block_id, old_parent_id, *new_parent_id]
            })
        }

        Operation::DeleteBlock { block_id, .. } => {
            let block = tree.get(*block_id)?;
            if block.trashed_at.is_some() {
                return Err(DomainError::Validation("Block already trashed"));
            }
            let Some(parent_id) = block.parent_id else {
                return Err(DomainError::Validation("Cannot trash the root block"));
            };
            let parent = tree.get(parent_id)?;
            let Some(at) = parent.content.iter().position(|id| id == block_id) else {
                return Err(DomainError::Validation("content/parentId mismatch"));
            };

            let parent_mut = tree.blocks.get_mut(&parent_id).expect("parent exists");
            parent_mut.content.remove(at);

            let block_mut = tree.blocks.get_mut(block_id).expect("block exists");
            block_mut.trashed_at = Some(now);
            block_mut.trashed_index = Some(at as i32);

            Ok(vec![*block_id, parent_id])
        }

        Operation::RestoreBlock { block_id, .. } => {
            let block = tree.get(*block_id)?;
            if block.trashed_at.is_none() {
                return Err(DomainError::Validation("Block is not trashed"));
            }
            let Some(parent_id) = block.parent_id else {
                return Err(DomainError::Validation("Block is not trashed"));
            };
            let trashed_index = block.trashed_index;
            // O pai pode estar trashed (deletado depois do filho): o restore ainda vale,
            // o bloco só reaparece quando o ancestral voltar.
            let parent = tree.get(parent_id)?;
            validate_database_relationship(parent.block_type, block.block_type)?;
            let at = clamp_index(
                trashed_index.map(i64::from).unwrap_or(i64::MAX),
                parent.content.len(),
            );

            let parent_mut = tree.blocks.get_mut(&parent_id).expect("parent exists");
            parent_mut.content.insert(at, *block_id);

            let block_mut = tree.blocks.get_mut(block_id).expect("block exists");
            block_mut.trashed_at = None;
            block_mut.trashed_index = None;

            Ok(vec![*block_id, parent_id])
        }

        Operation::TransferSubtreeOut { block_id, .. } => {
            let block = tree.get(*block_id)?;
            let Some(parent_id) = block.parent_id else {
                return Err(DomainError::Validation("Cannot transfer the root block"));
            };
            let parent = tree.get(parent_id)?;
            if !parent.content.contains(block_id) {
                return Err(DomainError::Validation("content/parentId mismatch"));
            }
            let removed: Vec<_> = tree
                .blocks
                .keys()
                .copied()
                .filter(|id| *id == *block_id || tree.is_descendant(*block_id, *id))
                .collect();
            for id in removed {
                tree.blocks.remove(&id);
            }
            tree.blocks
                .get_mut(&parent_id)
                .expect("parent exists")
                .content
                .retain(|id| id != block_id);
            Ok(vec![parent_id])
        }

        Operation::TransferSubtreeIn {
            blocks,
            parent_id,
            index,
            ..
        } => {
            if blocks.is_empty() {
                return Err(DomainError::Validation("Transfer requires a subtree"));
            }
            let parent = tree.get(*parent_id)?;
            if parent.trashed_at.is_some() {
                return Err(DomainError::Validation(
                    "Cannot transfer into trashed block",
                ));
            }
            let incoming: HashMap<_, _> = blocks.iter().map(|block| (block.id, block)).collect();
            let roots: Vec<_> = blocks
                .iter()
                .filter(|block| block.parent_id.is_none_or(|id| !incoming.contains_key(&id)))
                .collect();
            if roots.len() != 1 {
                return Err(DomainError::Validation(
                    "Transfer requires exactly one subtree root",
                ));
            }
            for block in blocks {
                if tree.blocks.contains_key(&block.id) {
                    return Err(DomainError::Validation("Duplicate block id"));
                }
                if let Some(parent) = block.parent_id.and_then(|id| incoming.get(&id)) {
                    let listed = parent.content.contains(&block.id);
                    if block.trashed_at.is_none() != listed {
                        return Err(DomainError::Validation("Invalid transferred subtree"));
                    }
                    validate_database_relationship(parent.block_type, block.block_type)?;
                }
                for child_id in &block.content {
                    if incoming.get(child_id).and_then(|child| child.parent_id) != Some(block.id) {
                        return Err(DomainError::Validation("Invalid transferred subtree"));
                    }
                }
            }
            let root_id = roots[0].id;
            validate_database_relationship(parent.block_type, roots[0].block_type)?;
            for block in blocks {
                for child_id in &block.content {
                    validate_database_relationship(
                        block.block_type,
                        incoming[child_id].block_type,
                    )?;
                }
            }
            for block in blocks {
                let mut inserted = block.clone();
                inserted.workspace_id = workspace_id;
                if inserted.id == root_id {
                    inserted.parent_id = Some(*parent_id);
                }
                tree.blocks.insert(inserted.id, inserted);
            }
            let parent = tree.blocks.get_mut(parent_id).expect("parent exists");
            let at = clamp_index(*index, parent.content.len());
            parent.content.insert(at, root_id);
            let mut touched: Vec<_> = blocks.iter().map(|block| block.id).collect();
            touched.push(*parent_id);
            Ok(touched)
        }
    }
}

/// Applies a batch atomically in memory. Persistence uses this before writing rows,
/// so a later invalid operation cannot leave earlier operations partially applied.
pub fn apply_operation_batch(
    tree: &mut BlockTree,
    operations: &[Operation],
    workspace_id: Uuid,
    now: DateTime<Utc>,
) -> Result<Vec<Vec<Uuid>>, DomainError> {
    let mut candidate = tree.clone();
    let mut touched = Vec::with_capacity(operations.len());
    for operation in operations {
        touched.push(apply_operation(
            &mut candidate,
            operation,
            workspace_id,
            now,
        )?);
    }
    *tree = candidate;
    Ok(touched)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 8, 12, 0, 0).unwrap()
    }

    fn block(id: Uuid, workspace_id: Uuid, block_type: BlockType) -> Block {
        Block {
            id,
            workspace_id,
            block_type,
            properties: Map::new(),
            prop_versions: HashMap::new(),
            content: Vec::new(),
            parent_id: None,
            trashed_at: None,
            trashed_index: None,
        }
    }

    struct Fixture {
        workspace_id: Uuid,
        tree: BlockTree,
        root: Uuid,
        first: Uuid,
        second: Uuid,
    }

    /// root(page) → [first(paragraph), second(paragraph)]
    fn fixture() -> Fixture {
        let workspace_id = Uuid::new_v4();
        let root = Uuid::new_v4();
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let mut tree = BlockTree::from_blocks(vec![block(root, workspace_id, BlockType::Page)]);
        for (id, index) in [(first, 0), (second, 1)] {
            apply_operation(
                &mut tree,
                &Operation::InsertBlock {
                    op_id: Uuid::new_v4(),
                    block: block(id, workspace_id, BlockType::Paragraph),
                    parent_id: root,
                    index,
                },
                workspace_id,
                now(),
            )
            .unwrap();
        }
        Fixture {
            workspace_id,
            tree,
            root,
            first,
            second,
        }
    }

    // Macro, não função: `f.tree` (mut) e `f.first` (shared) são campos disjuntos,
    // o que o borrow checker só aceita se a expansão acontecer no local da chamada.
    macro_rules! apply {
        ($f:expr, $operation:expr $(,)?) => {
            apply_operation(&mut $f.tree, &$operation, $f.workspace_id, now())
        };
    }

    #[test]
    fn insert_clamps_index_and_forces_workspace() {
        let mut f = fixture();
        let id = Uuid::new_v4();
        let mut fresh = block(id, Uuid::new_v4(), BlockType::Paragraph);
        fresh.parent_id = Some(Uuid::new_v4());
        apply!(
            f,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: fresh,
                parent_id: f.root,
                index: 99,
            },
        )
        .unwrap();

        let root = &f.tree.blocks[&f.root];
        assert_eq!(root.content, vec![f.first, f.second, id]);
        assert_eq!(f.tree.blocks[&id].workspace_id, f.workspace_id);
        assert_eq!(f.tree.blocks[&id].parent_id, Some(f.root));
    }

    #[test]
    fn insert_rejects_duplicate_id_and_non_empty_content() {
        let mut f = fixture();
        let duplicate = block(f.first, f.workspace_id, BlockType::Paragraph);
        assert!(
            apply!(
                f,
                Operation::InsertBlock {
                    op_id: Uuid::new_v4(),
                    block: duplicate,
                    parent_id: f.root,
                    index: 0
                }
            )
            .is_err()
        );

        let mut with_children = block(Uuid::new_v4(), f.workspace_id, BlockType::Paragraph);
        with_children.content = vec![Uuid::new_v4()];
        assert!(
            apply!(
                f,
                Operation::InsertBlock {
                    op_id: Uuid::new_v4(),
                    block: with_children,
                    parent_id: f.root,
                    index: 0
                }
            )
            .is_err()
        );
    }

    #[test]
    fn update_patches_and_removes_properties() {
        let mut f = fixture();
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: Some(BlockType::ToDo),
                properties: Some(
                    [
                        ("text".to_string(), Value::from("comprar pão")),
                        ("checked".to_string(), Value::Bool(false)),
                    ]
                    .into_iter()
                    .collect(),
                ),
                prop_versions: None,
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.first].block_type, BlockType::ToDo);

        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: Some(BlockType::Paragraph),
                properties: Some([("checked".to_string(), Value::Null)].into_iter().collect()),
                prop_versions: None,
            },
        )
        .unwrap();

        let first = &f.tree.blocks[&f.first];
        assert_eq!(first.block_type, BlockType::Paragraph);
        assert!(!first.properties.contains_key("checked"));
        assert_eq!(first.properties["text"], Value::from("comprar pão"));
    }

    #[test]
    fn lww_drops_stale_property_writes() {
        let mut f = fixture();
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: None,
                properties: Some(
                    [("text".to_string(), Value::from("v1"))]
                        .into_iter()
                        .collect()
                ),
                prop_versions: Some([("text".to_string(), 1)].into_iter().collect()),
            },
        )
        .unwrap();
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: None,
                properties: Some(
                    [("text".to_string(), Value::from("v2"))]
                        .into_iter()
                        .collect()
                ),
                prop_versions: Some([("text".to_string(), 2)].into_iter().collect()),
            },
        )
        .unwrap();
        // Stale write with version 1 must not overwrite version 2.
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: None,
                properties: Some(
                    [
                        ("text".to_string(), Value::from("stale")),
                        ("checked".to_string(), Value::Bool(true)),
                    ]
                    .into_iter()
                    .collect(),
                ),
                prop_versions: Some(
                    [("text".to_string(), 1), ("checked".to_string(), 1)]
                        .into_iter()
                        .collect(),
                ),
            },
        )
        .unwrap();
        let first = &f.tree.blocks[&f.first];
        assert_eq!(first.properties["text"], Value::from("v2"));
        assert_eq!(first.properties["checked"], Value::Bool(true));
        assert_eq!(first.prop_versions.get("text"), Some(&2));
        assert_eq!(first.prop_versions.get("checked"), Some(&1));
    }

    #[test]
    fn lww_equal_version_wins_by_arrival_order() {
        let mut f = fixture();
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: None,
                properties: Some(
                    [("text".to_string(), Value::from("a"))]
                        .into_iter()
                        .collect()
                ),
                prop_versions: Some([("text".to_string(), 5)].into_iter().collect()),
            },
        )
        .unwrap();
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: None,
                properties: Some(
                    [("text".to_string(), Value::from("b"))]
                        .into_iter()
                        .collect()
                ),
                prop_versions: Some([("text".to_string(), 5)].into_iter().collect()),
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.first].properties["text"], Value::from("b"));
    }

    #[test]
    fn move_rejects_cycles_and_root() {
        let mut f = fixture();
        // first → filho de second
        apply!(
            f,
            Operation::MoveBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                new_parent_id: f.second,
                index: 0,
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.root].content, vec![f.second]);
        assert_eq!(f.tree.blocks[&f.second].content, vec![f.first]);

        // second não pode virar filho do próprio descendente.
        assert!(
            apply!(
                f,
                Operation::MoveBlock {
                    op_id: Uuid::new_v4(),
                    block_id: f.second,
                    new_parent_id: f.first,
                    index: 0
                }
            )
            .is_err()
        );
        assert!(
            apply!(
                f,
                Operation::MoveBlock {
                    op_id: Uuid::new_v4(),
                    block_id: f.root,
                    new_parent_id: f.second,
                    index: 0
                }
            )
            .is_err()
        );
        assert!(
            apply!(
                f,
                Operation::MoveBlock {
                    op_id: Uuid::new_v4(),
                    block_id: f.first,
                    new_parent_id: f.first,
                    index: 0
                }
            )
            .is_err()
        );
    }

    #[test]
    fn move_inside_same_parent_reindexes() {
        let mut f = fixture();
        apply!(
            f,
            Operation::MoveBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                new_parent_id: f.root,
                index: 1,
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.root].content, vec![f.second, f.first]);
    }

    #[test]
    fn delete_removes_from_parent_content_and_stores_index() {
        let mut f = fixture();
        apply!(
            f,
            Operation::DeleteBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
            },
        )
        .unwrap();

        // Sem slot fantasma: o id sai do content do pai (bug pego pelo fuzz do M1).
        assert_eq!(f.tree.blocks[&f.root].content, vec![f.second]);
        assert_eq!(f.tree.blocks[&f.first].trashed_index, Some(0));
        assert!(f.tree.blocks[&f.first].trashed_at.is_some());

        assert!(
            apply!(
                f,
                Operation::DeleteBlock {
                    op_id: Uuid::new_v4(),
                    block_id: f.first
                }
            )
            .is_err()
        );
        assert!(
            apply!(
                f,
                Operation::DeleteBlock {
                    op_id: Uuid::new_v4(),
                    block_id: f.root
                }
            )
            .is_err()
        );
    }

    #[test]
    fn delete_keeps_descendants_and_restore_brings_them_back() {
        let mut f = fixture();
        let child = Uuid::new_v4();
        apply!(
            f,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(child, f.workspace_id, BlockType::Paragraph),
                parent_id: f.first,
                index: 0,
            },
        )
        .unwrap();

        apply!(
            f,
            Operation::DeleteBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.first].content, vec![child]);
        assert!(f.tree.blocks[&child].trashed_at.is_none());

        apply!(
            f,
            Operation::RestoreBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.root].content, vec![f.first, f.second]);
        assert_eq!(f.tree.blocks[&f.first].content, vec![child]);
    }

    #[test]
    fn restore_clamps_when_siblings_disappeared() {
        let mut f = fixture();
        apply!(
            f,
            Operation::DeleteBlock {
                op_id: Uuid::new_v4(),
                block_id: f.second,
            },
        )
        .unwrap();
        apply!(
            f,
            Operation::DeleteBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
            },
        )
        .unwrap();
        // second foi deletado do índice 1, mas o pai agora tem 0 filhos.
        apply!(
            f,
            Operation::RestoreBlock {
                op_id: Uuid::new_v4(),
                block_id: f.second,
            },
        )
        .unwrap();
        assert_eq!(f.tree.blocks[&f.root].content, vec![f.second]);

        assert!(
            apply!(
                f,
                Operation::RestoreBlock {
                    op_id: Uuid::new_v4(),
                    block_id: f.second
                }
            )
            .is_err()
        );
    }

    #[test]
    fn transfer_out_and_in_preserve_the_complete_subtree() {
        let mut source = fixture();
        let child = Uuid::new_v4();
        apply!(
            source,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(child, source.workspace_id, BlockType::Paragraph),
                parent_id: source.first,
                index: 0,
            },
        )
        .unwrap();
        let transferred = vec![
            source.tree.blocks[&source.first].clone(),
            source.tree.blocks[&child].clone(),
        ];
        let transfer_id = Uuid::new_v4();
        apply!(
            source,
            Operation::TransferSubtreeOut {
                op_id: transfer_id,
                transfer_id,
                block_id: source.first,
                destination_workspace_id: Uuid::new_v4(),
            },
        )
        .unwrap();
        assert!(!source.tree.blocks.contains_key(&source.first));
        assert!(!source.tree.blocks.contains_key(&child));

        let mut destination = fixture();
        apply!(
            destination,
            Operation::TransferSubtreeIn {
                op_id: Uuid::new_v4(),
                transfer_id,
                blocks: transferred,
                parent_id: destination.root,
                index: 0,
                source_workspace_id: source.workspace_id,
            },
        )
        .unwrap();
        assert_eq!(
            destination.tree.blocks[&destination.root].content[0],
            source.first
        );
        assert_eq!(destination.tree.blocks[&source.first].content, vec![child]);
        assert_eq!(
            destination.tree.blocks[&source.first].workspace_id,
            destination.workspace_id
        );
    }

    #[test]
    fn unknown_block_id_is_rejected() {
        let mut f = fixture();
        assert_eq!(
            apply!(
                f,
                Operation::UpdateBlock {
                    op_id: Uuid::new_v4(),
                    block_id: Uuid::new_v4(),
                    block_type: None,
                    properties: None,
                    prop_versions: None,
                }
            ),
            Err(DomainError::Validation("Block not found"))
        );
    }

    #[test]
    fn batch_is_atomic_when_a_later_operation_fails() {
        let mut f = fixture();
        let before = f.tree.blocks[&f.root].content.clone();
        let fresh = Uuid::new_v4();
        let operations = vec![
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(fresh, f.workspace_id, BlockType::Paragraph),
                parent_id: f.root,
                index: 0,
            },
            Operation::MoveBlock {
                op_id: Uuid::new_v4(),
                block_id: f.root,
                new_parent_id: f.first,
                index: 0,
            },
        ];
        assert!(apply_operation_batch(&mut f.tree, &operations, f.workspace_id, now()).is_err());
        assert_eq!(f.tree.blocks[&f.root].content, before);
        assert!(!f.tree.blocks.contains_key(&fresh));
    }

    #[test]
    fn operation_json_matches_the_typescript_contract() {
        let json = serde_json::json!({
            "type": "update_block",
            "opId": "0f9d1a4e-0000-4000-8000-000000000001",
            "blockId": "0f9d1a4e-0000-4000-8000-000000000002",
            "blockType": "heading1",
            "properties": {"text": "Oi", "checked": null},
            "propVersions": {"text": 3}
        });
        let operation: Operation = serde_json::from_value(json).unwrap();
        match operation {
            Operation::UpdateBlock {
                block_type,
                properties,
                ..
            } => {
                assert_eq!(block_type, Some(BlockType::Heading1));
                assert_eq!(properties.unwrap()["checked"], Value::Null);
            }
            other => panic!("unexpected operation: {other:?}"),
        }
    }

    #[test]
    fn block_json_matches_the_typescript_contract() {
        let json = serde_json::json!({
            "id": "0f9d1a4e-0000-4000-8000-000000000003",
            "workspaceId": "0f9d1a4e-0000-4000-8000-000000000004",
            "type": "to_do",
            "properties": {"text": "", "checked": false},
            "content": [],
            "parentId": null,
            "trashedAt": null,
            "trashedIndex": null
        });
        let block: Block = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(block.block_type, BlockType::ToDo);
        assert_eq!(serde_json::to_value(&block).unwrap(), json);
    }

    #[test]
    fn mermaid_block_type_and_source_match_the_typescript_contract() {
        let json = serde_json::json!({
            "id": "0f9d1a4e-0000-4000-8000-000000000005",
            "workspaceId": "0f9d1a4e-0000-4000-8000-000000000006",
            "type": "mermaid",
            "properties": {"text": "graph TD; A-->B"},
            "content": [],
            "parentId": null,
            "trashedAt": null,
            "trashedIndex": null
        });

        let block: Block = serde_json::from_value(json.clone()).unwrap();

        assert_eq!(parse_block_type("mermaid").unwrap(), BlockType::Mermaid);
        assert_eq!(block.block_type.as_str(), "mermaid");
        assert_eq!(block.properties["text"], "graph TD; A-->B");
        assert_eq!(serde_json::to_value(&block).unwrap(), json);
    }

    #[test]
    fn database_block_types_match_the_typescript_contract() {
        assert_eq!(parse_block_type("database").unwrap(), BlockType::Database);
        assert_eq!(
            parse_block_type("database_row").unwrap(),
            BlockType::DatabaseRow
        );
        assert_eq!(BlockType::Database.as_str(), "database");
        assert_eq!(BlockType::DatabaseRow.as_str(), "database_row");
    }

    #[test]
    fn database_rows_accept_page_content_but_stay_inside_the_database() {
        let mut f = fixture();
        let database_id = Uuid::new_v4();
        let row_id = Uuid::new_v4();
        apply!(
            f,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(database_id, f.workspace_id, BlockType::Database),
                parent_id: f.root,
                index: 0,
            },
        )
        .unwrap();

        apply!(
            f,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(row_id, f.workspace_id, BlockType::DatabaseRow),
                parent_id: database_id,
                index: 0,
            },
        )
        .unwrap();

        let row_content_id = Uuid::new_v4();
        apply!(
            f,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(row_content_id, f.workspace_id, BlockType::Paragraph),
                parent_id: row_id,
                index: 0,
            },
        )
        .unwrap();

        let invalid_child = apply!(
            f,
            Operation::InsertBlock {
                op_id: Uuid::new_v4(),
                block: block(Uuid::new_v4(), f.workspace_id, BlockType::Paragraph),
                parent_id: database_id,
                index: 1,
            },
        );
        assert!(invalid_child.is_err());

        let invalid_move = apply!(
            f,
            Operation::MoveBlock {
                op_id: Uuid::new_v4(),
                block_id: row_id,
                new_parent_id: f.root,
                index: 0,
            },
        );
        assert!(invalid_move.is_err());

        let invalid_conversion = apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: database_id,
                block_type: Some(BlockType::Paragraph),
                properties: None,
                prop_versions: None,
            },
        );
        assert!(invalid_conversion.is_err());
        assert_eq!(f.tree.get(row_id).unwrap().content, vec![row_content_id]);
    }

    #[test]
    fn transfer_rejects_a_child_missing_from_parent_content() {
        let mut f = fixture();
        let parent_id = Uuid::new_v4();
        let row_id = Uuid::new_v4();
        let parent = block(parent_id, f.workspace_id, BlockType::Paragraph);
        let mut hidden_row = block(row_id, f.workspace_id, BlockType::DatabaseRow);
        hidden_row.parent_id = Some(parent_id);

        let result = apply!(
            f,
            Operation::TransferSubtreeIn {
                op_id: Uuid::new_v4(),
                transfer_id: Uuid::new_v4(),
                blocks: vec![parent, hidden_row],
                parent_id: f.root,
                index: 0,
                source_workspace_id: Uuid::new_v4(),
            },
        );

        assert!(result.is_err());
    }

    #[test]
    fn transfer_accepts_a_trashed_row_missing_from_database_content() {
        let mut f = fixture();
        let database_id = Uuid::new_v4();
        let mut trashed_row = block(Uuid::new_v4(), f.workspace_id, BlockType::DatabaseRow);
        trashed_row.parent_id = Some(database_id);
        trashed_row.trashed_at = Some(now());
        trashed_row.trashed_index = Some(0);

        let result = apply!(
            f,
            Operation::TransferSubtreeIn {
                op_id: Uuid::new_v4(),
                transfer_id: Uuid::new_v4(),
                blocks: vec![
                    block(database_id, f.workspace_id, BlockType::Database),
                    trashed_row,
                ],
                parent_id: f.root,
                index: 0,
                source_workspace_id: Uuid::new_v4(),
            },
        );

        assert!(result.is_ok());
    }

    #[test]
    fn update_to_the_current_type_advances_lww() {
        let mut f = fixture();
        apply!(
            f,
            Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: f.first,
                block_type: Some(BlockType::Paragraph),
                properties: None,
                prop_versions: Some(HashMap::from([(TYPE_PROP_VERSION_KEY.to_string(), 9)])),
            },
        )
        .unwrap();

        assert_eq!(
            f.tree.blocks[&f.first].prop_versions[TYPE_PROP_VERSION_KEY],
            9
        );
    }
}
