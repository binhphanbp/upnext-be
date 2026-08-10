import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmAdapter } from './adapters/gemini/gemini-llm.adapter';
import { FallbackLlmAdapter } from './adapters/http/fallback-llm.adapter';
import { HttpLlmAdapter } from './adapters/http/http-llm.adapter';
import { CandidateContextAssembler } from './context/candidate-context.assembler';
import { AiActionsService } from './copilot/ai-actions.service';
import { AiBudgetService } from './copilot/ai-budget.service';
import { AiConversationsService } from './copilot/ai-conversations.service';
import { AiCopilotController } from './copilot/ai-copilot.controller';
import { AiCopilotService } from './copilot/ai-copilot.service';
import { AiRunTrackerService } from './copilot/ai-run-tracker.service';
import { LLM_PROVIDER, LlmProviderPort } from './ports/llm-provider.port';
import { ToolRegistryService } from './tools/tool-registry.service';

/**
 * Module AI theo ADR-001.
 *
 * `LLM_PROVIDER` là điểm tách duy nhất. Chuyển traffic sang upnext-ai bằng
 * `AI_LLM_PROVIDER=upnext-ai`; tắt flag là quay lại Gemini trực tiếp mà không
 * đổi controller, prompt, quota hay công cụ nghiệp vụ.
 *
 * `exports` cố ý chỉ có `CandidateContextAssembler` và `ToolRegistryService` —
 * hai thứ module khác có thể cần tái dùng. Adapter **không** được export: ADR §5.1
 * cấm module nghiệp vụ inject adapter trực tiếp, và cách rẻ nhất để thực thi điều
 * đó là không cho nó ra khỏi đây.
 */
@Module({
  controllers: [AiCopilotController],
  providers: [
    GeminiLlmAdapter,
    HttpLlmAdapter,
    {
      provide: LLM_PROVIDER,
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpLlmAdapter,
        geminiAdapter: GeminiLlmAdapter,
      ): LlmProviderPort => {
        if (configService.get<string>('aiLlmProvider') !== 'upnext-ai') {
          return geminiAdapter;
        }
        if (configService.get<boolean>('aiServiceFallbackToGemini') === false) {
          return httpAdapter;
        }
        return new FallbackLlmAdapter(httpAdapter, geminiAdapter);
      },
      inject: [ConfigService, HttpLlmAdapter, GeminiLlmAdapter],
    },
    AiCopilotService,
    AiConversationsService,
    AiActionsService,
    AiBudgetService,
    AiRunTrackerService,
    CandidateContextAssembler,
    ToolRegistryService,
  ],
  exports: [CandidateContextAssembler, ToolRegistryService],
})
export class AiModule {}
