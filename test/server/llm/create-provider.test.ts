import assert from "node:assert/strict";
import test from "node:test";
import { createLlmProviderFromEnvironment } from "../../../server/llm/create-provider";
import { GeminiLlmProvider } from "../../../server/llm/gemini-provider";
import { GroqLlmProvider } from "../../../server/llm/groq-provider";
import { OpenAiLlmProvider } from "../../../server/llm/openai-provider";
import {
  InvalidLlmConfigurationError,
  MissingLlmApiKeyError,
  UnsupportedLlmProviderError,
} from "../../../server/llm/types";

test("LLM_PROVIDER未指定時はOpenAIプロバイダーを選択する", () => {
  const provider = createLlmProviderFromEnvironment({
    OPENAI_API_KEY: "test-api-key",
  });

  assert.ok(provider instanceof OpenAiLlmProvider);
});

test("LLM_PROVIDER=geminiではGeminiプロバイダーを選択する", () => {
  const provider = createLlmProviderFromEnvironment({
    LLM_PROVIDER: "gemini",
    GEMINI_API_KEY: "test-api-key",
  });

  assert.ok(provider instanceof GeminiLlmProvider);
});

test("LLM_PROVIDER=groqではGroqプロバイダーを選択する", () => {
  const provider = createLlmProviderFromEnvironment({
    LLM_PROVIDER: "groq",
    GROQ_API_KEY: "test-api-key",
  });

  assert.ok(provider instanceof GroqLlmProvider);
});

test("GroqではGPT-OSS 120Bを明示指定できる", () => {
  const provider = createLlmProviderFromEnvironment({
    LLM_PROVIDER: "groq",
    GROQ_API_KEY: "test-api-key",
    GROQ_MODEL: "openai/gpt-oss-120b",
  });

  assert.ok(provider instanceof GroqLlmProvider);
});

test("選択済みプロバイダーのAPIキーがない場合は設定エラーにする", () => {
  assert.throws(
    () => createLlmProviderFromEnvironment({ LLM_PROVIDER: "gemini" }),
    (error: unknown) =>
      error instanceof MissingLlmApiKeyError && error.provider === "gemini",
  );
});

test("Groq指定でGROQ_API_KEYがない場合は設定エラーにする", () => {
  assert.throws(
    () => createLlmProviderFromEnvironment({ LLM_PROVIDER: "groq" }),
    (error: unknown) =>
      error instanceof MissingLlmApiKeyError && error.provider === "groq",
  );
});

test("GroqではGPT-OSS 120B以外のGROQ_MODELを設定エラーにする", () => {
  for (const value of ["", "qwen/qwen3.6-27b", "other-model"]) {
    assert.throws(
      () =>
        createLlmProviderFromEnvironment({
          LLM_PROVIDER: "groq",
          GROQ_API_KEY: "test-api-key",
          GROQ_MODEL: value,
        }),
      (error: unknown) =>
        error instanceof InvalidLlmConfigurationError &&
        error.variableName === "GROQ_MODEL",
    );
  }
});

test("Groqの最大出力トークン数が無効な場合は設定エラーにする", () => {
  for (const value of ["0", "65537", "1.5", "not-a-number"]) {
    assert.throws(
      () =>
        createLlmProviderFromEnvironment({
          LLM_PROVIDER: "groq",
          GROQ_API_KEY: "test-api-key",
          GROQ_MAX_OUTPUT_TOKENS: value,
        }),
      (error: unknown) =>
        error instanceof InvalidLlmConfigurationError &&
        error.variableName === "GROQ_MAX_OUTPUT_TOKENS",
    );
  }
});

test("未対応のLLM_PROVIDERは設定エラーにする", () => {
  assert.throws(
    () => createLlmProviderFromEnvironment({ LLM_PROVIDER: "unknown" }),
    (error: unknown) =>
      error instanceof UnsupportedLlmProviderError &&
      error.provider === "unknown",
  );
});
