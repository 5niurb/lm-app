export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  model?: string;
  maxTokens?: number;
}

export interface CompletionResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export function formatMessages(messages: Message[]): string {
  return messages
    .map((msg) => `[${msg.role}]: ${msg.content}`)
    .join("\n");
}

export function validateRequest(request: CompletionRequest): string[] {
  const errors: string[] = [];

  if (!request.messages || request.messages.length === 0) {
    errors.push("Messages array must not be empty");
  }

  for (const msg of request.messages ?? []) {
    if (!msg.role || !msg.content) {
      errors.push("Each message must have a role and content");
    }
  }

  if (request.maxTokens !== undefined && request.maxTokens <= 0) {
    errors.push("maxTokens must be a positive number");
  }

  return errors;
}
