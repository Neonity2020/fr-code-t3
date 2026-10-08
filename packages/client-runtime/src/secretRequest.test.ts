import { SecretRequestError, ThreadId, TurnItemId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  secretRequestAnswerInput,
  secretRequestDisplay,
  secretRequestFailureMessage,
  type SecretRequestItem,
} from "./secretRequest.ts";

const item = {
  id: TurnItemId.make("turn-item:secret-request:1"),
  threadId: ThreadId.make("thread-1"),
};

describe("secretRequestDisplay", () => {
  it("shows the form only while pending and maps every answer to its outcome copy", () => {
    const display = (secretStatus: SecretRequestItem["secretStatus"]) =>
      secretRequestDisplay({ secretStatus }, "local");
    expect(display("pending")).toEqual({ kind: "pending" });
    expect(display("saved")).toEqual({
      kind: "answered",
      outcome: "saved",
      label: "安全保存并保持私密",
    });
    expect(display("declined")).toEqual({
      kind: "answered",
      outcome: "declined",
      label: "已拒绝",
    });
    expect(display("cancelled")).toEqual({
      kind: "answered",
      outcome: "ended",
      label: "请求已结束",
    });
  });

  it("never offers the form for a request inherited from another thread", () => {
    expect(secretRequestDisplay({ secretStatus: "pending" }, "inherited")).toEqual({
      kind: "pending-elsewhere",
      label: "等待原会话中的答复",
    });
    expect(secretRequestDisplay({ secretStatus: "saved" }, "inherited")).toMatchObject({
      outcome: "saved",
    });
  });
});

describe("secretRequestAnswerInput", () => {
  it("refuses a blank save and trims the value the server will store", () => {
    expect(secretRequestAnswerInput(item, { type: "save", secret: "   " })).toBeNull();
    expect(secretRequestAnswerInput(item, { type: "save", secret: " whsec_1 " })).toEqual({
      threadId: item.threadId,
      turnItemId: item.id,
      answer: { type: "save", secret: "whsec_1" },
    });
    expect(secretRequestAnswerInput(item, { type: "decline" })).toEqual({
      threadId: item.threadId,
      turnItemId: item.id,
      answer: { type: "decline" },
    });
  });
});

describe("secretRequestFailureMessage", () => {
  it("passes through server errors but hides anything that could echo the payload", () => {
    expect(
      secretRequestFailureMessage(new SecretRequestError({ reason: "already_answered" })),
    ).toBe("This secret request was already answered.");
    expect(secretRequestFailureMessage(new Error('Expected string, got "whsec_1"'))).toBe(
      "无法回答请求。请重试。",
    );
    expect(secretRequestFailureMessage(undefined)).toBe("无法回答请求。请重试。");
  });
});
