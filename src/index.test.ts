import { describe, it, expect } from "vitest";
import { formatMessages, validateRequest } from "./index.js";
import type { Message, CompletionRequest } from "./index.js";

describe("formatMessages", () => {
  it("formats a single message", () => {
    const messages: Message[] = [{ role: "user", content: "Hello" }];
    expect(formatMessages(messages)).toBe("[user]: Hello");
  });

  it("formats multiple messages", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];
    const result = formatMessages(messages);
    expect(result).toBe(
      "[system]: You are helpful.\n[user]: Hi\n[assistant]: Hello!"
    );
  });

  it("returns empty string for empty array", () => {
    expect(formatMessages([])).toBe("");
  });
});

describe("validateRequest", () => {
  it("returns no errors for a valid request", () => {
    const request: CompletionRequest = {
      messages: [{ role: "user", content: "Hello" }],
    };
    expect(validateRequest(request)).toEqual([]);
  });

  it("returns error for empty messages", () => {
    const request: CompletionRequest = { messages: [] };
    const errors = validateRequest(request);
    expect(errors).toContain("Messages array must not be empty");
  });

  it("returns error for invalid maxTokens", () => {
    const request: CompletionRequest = {
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: -1,
    };
    const errors = validateRequest(request);
    expect(errors).toContain("maxTokens must be a positive number");
  });
});
