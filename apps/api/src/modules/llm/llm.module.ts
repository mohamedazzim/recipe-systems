// RS-US servings — the API/BFF LLM adapter provider. Resolves the
// provider-neutral LlmAdapter from the environment (null when no provider is
// configured). The API uses it ONLY for optional capabilities (servings
// estimation); analysis generation stays with the worker. Mirror of OcrModule:
// a @Global module exposing a single token, so any module can inject it.

import { Global, Module } from '@nestjs/common';
import { LlmAdapter, resolveLlmAdapter } from '@recipe-systems/llm-adapter';

export const LLM_ADAPTER = 'LLM_ADAPTER';

@Global()
@Module({
  providers: [
    {
      provide: LLM_ADAPTER,
      useFactory: (): LlmAdapter | null => resolveLlmAdapter(process.env),
    },
  ],
  exports: [LLM_ADAPTER],
})
export class LlmModule {}
