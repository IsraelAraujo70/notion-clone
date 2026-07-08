-- Páginas de topo: `workspace_page_roots.root_page_id` deixa de ser uma página
-- editável e passa a ser um *container* invisível. As páginas diretamente sob
-- ele são as páginas de topo do workspace; a antiga raiz vira a primeira delas.
--
-- Nada muda no engine de blocos: o container é um bloco `page` como qualquer
-- outro, só que a API nunca o devolve como página e nunca deixa navegar até ele.

WITH container AS (
    INSERT INTO blocks (id, workspace_id, type, properties, content, created_by)
    SELECT gen_random_uuid(),
           b.workspace_id,
           'page',
           '{}'::jsonb,
           ARRAY[b.id]::uuid[],
           b.created_by
    FROM workspace_page_roots r
    JOIN blocks b ON b.id = r.root_page_id
    RETURNING id, workspace_id, content
), reparented AS (
    UPDATE blocks
    SET parent_id = container.id
    FROM container
    WHERE blocks.id = container.content[1]
)
UPDATE workspace_page_roots
SET root_page_id = container.id
FROM container
WHERE workspace_page_roots.workspace_id = container.workspace_id;
