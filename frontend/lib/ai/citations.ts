import type { AiCitation } from "@reason/core/ai/contracts"

export function citationPath(citation: AiCitation) {
  const params = new URLSearchParams({ block: citation.block_id })
  return `/dashboard/pages/${citation.page_id}?${params}`
}
