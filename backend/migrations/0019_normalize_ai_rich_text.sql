WITH normalized AS (
    SELECT
        b.id,
        b.workspace_id,
        CASE WHEN b.type = 'page' THEN 'title' ELSE 'text' END AS target,
        string_agg(
            COALESCE(
                segment.value->>'plain_text',
                segment.value->'text'->>'content',
                CASE
                    WHEN jsonb_typeof(segment.value) = 'string'
                    THEN segment.value #>> '{}'
                END,
                ''
            ),
            '' ORDER BY segment.ordinality
        ) AS text
    FROM blocks b
    CROSS JOIN LATERAL jsonb_array_elements(b.properties->'rich_text')
        WITH ORDINALITY AS segment(value, ordinality)
    WHERE jsonb_typeof(b.properties->'rich_text') = 'array'
      AND NOT (b.properties ? CASE WHEN b.type = 'page' THEN 'title' ELSE 'text' END)
    GROUP BY b.id, b.workspace_id, b.type
)
UPDATE blocks b
SET properties = (b.properties - 'rich_text')
    || jsonb_build_object(normalized.target, normalized.text)
FROM normalized
WHERE b.id = normalized.id
  AND b.workspace_id = normalized.workspace_id;
