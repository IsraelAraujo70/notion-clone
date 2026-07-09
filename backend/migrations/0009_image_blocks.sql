-- Bloco de imagem embutido nas páginas.
ALTER TABLE blocks DROP CONSTRAINT IF EXISTS blocks_type_check;
ALTER TABLE blocks ADD CONSTRAINT blocks_type_check CHECK (
    type IN (
        'page',
        'paragraph',
        'heading1',
        'heading2',
        'heading3',
        'bulleted_list_item',
        'numbered_list_item',
        'to_do',
        'toggle',
        'quote',
        'code',
        'callout',
        'divider',
        'image'
    )
);
