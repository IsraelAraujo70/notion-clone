export type AiCitation = {
  workspace_id: string
  page_id: string
  page_title: string
  block_id: string
  snippet: string
}

export type AiConversation = {
  id: string
  workspace_id: string
  title: string
  created_at: string
  updated_at: string
}

export type AiMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: AiCitation[]
  created_at: string
}

export type AiConversationHistory = {
  conversation: AiConversation
  messages: AiMessage[]
}

export type AiAction =
  | { type: "continue_writing"; anchor_block_id: string }
  | { type: "summarize_page"; page_id: string }
  | {
      type: "transform_selection"
      block_ids: string[]
      instruction: string
    }
  | {
      type: "workspace_agent"
      prompt: string
      page_id: string
      mentioned_page_ids: string[]
      selection: string[]
      anchor_block_id?: string
    }

export type AiRunEvent =
  | { type: "run_started"; run_id: string; group_id?: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_started"; tool: string; label?: string }
  | { type: "tool_completed"; tool: string; label?: string }
  | { type: "usage"; input_tokens: number; output_tokens: number }
  | {
      type: "run_completed"
      run_id: string
      group_id?: string
      last_seq?: number | null
      citations?: AiCitation[]
      message?: AiMessage
    }
  | {
      type: "run_failed"
      run_id?: string
      message: string
      group_id?: string
      last_seq?: number | null
    }

export type SendAiMessageInput = {
  prompt: string
  action: AiAction
}

export type AiRun = {
  id: string
  workspace_id: string
  conversation_id: string | null
  action: string
  status: string
  model: string
  operation_group_id: string | null
  error: string | null
  last_seq: number | null
  created_at: string
  completed_at: string | null
}
