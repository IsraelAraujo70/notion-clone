use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::domain::error::DomainError;

// Espelho Rust de `frontend/lib/engine/tree.ts`. O contrato canônico está em
// `contracts/README.md`; os testes daqui replicam os testes do engine TS.

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
        _ => Err(DomainError::Validation("Unknown block type")),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: Uuid,
    pub workspace_id: Uuid,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub properties: Map<String, Value>,
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
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
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
}

impl Operation {
    pub fn op_id(&self) -> Uuid {
        match self {
            Self::InsertBlock { op_id, .. }
            | Self::UpdateBlock { op_id, .. }
            | Self::MoveBlock { op_id, .. }
            | Self::DeleteBlock { op_id, .. }
            | Self::RestoreBlock { op_id, .. } => *op_id,
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
                return Err(DomainError::Validation("insert_block requires empty content"));
            }
            let parent = tree.get(*parent_id)?;
            if parent.trashed_at.is_some() {
                return Err(DomainError::Validation("Cannot insert into trashed block"));
            }
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
            ..
        } => {
            let block = tree.get(*block_id)?;
            if block.trashed_at.is_some() {
                return Err(DomainError::Validation("Cannot update trashed block"));
            }
            let block = tree.blocks.get_mut(block_id).expect("block exists");
            if let Some(next_type) = block_type {
                block.block_type = *next_type;
            }
            if let Some(patch) = properties {
                for (key, value) in patch {
                    if value.is_null() {
                        block.properties.remove(key);
                    } else {
                        block.properties.insert(key.clone(), value.clone());
                    }
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
    }
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
            },
        )
        .unwrap();

        let first = &f.tree.blocks[&f.first];
        assert_eq!(first.block_type, BlockType::Paragraph);
        assert!(!first.properties.contains_key("checked"));
        assert_eq!(first.properties["text"], Value::from("comprar pão"));
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
                }
            ),
            Err(DomainError::Validation("Block not found"))
        );
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
}
