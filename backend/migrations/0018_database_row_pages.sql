-- Existing database rows predate page content. Give each empty row one editable paragraph.
WITH empty_rows AS (
    SELECT id, workspace_id, created_by, gen_random_uuid() AS paragraph_id
    FROM blocks
    WHERE type = 'database_row' AND cardinality(content) = 0
), inserted AS (
    INSERT INTO blocks (id, workspace_id, type, properties, parent_id, created_by)
    SELECT paragraph_id, workspace_id, 'paragraph', '{"text": ""}'::jsonb, id, created_by
    FROM empty_rows
    RETURNING id, parent_id
)
UPDATE blocks AS database_row
SET content = ARRAY[inserted.id]::uuid[], updated_at = now()
FROM inserted
WHERE database_row.id = inserted.parent_id;
