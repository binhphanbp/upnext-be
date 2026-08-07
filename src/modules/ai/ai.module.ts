import { Module } from '@nestjs/common';
import { GeminiLlmAdapter } from './adapters/gemini/gemini-llm.adapter';
import { CandidateContextAssembler } from './context/candidate-context.assembler';
import { AiActionsService } from './copilot/ai-actions.service';
import { AiBudgetService } from './copilot/ai-budget.service';
import { AiConversationsService } from './copilot/ai-conversations.service';
import { AiCopilotController } from './copilot/ai-copilot.controller';
import { AiCopilotService } from './copilot/ai-copilot.service';
import { AiRunTrackerService } from './copilot/ai-run-tracker.service';
import { LLM_PROVIDER } from './ports/llm-provider.port';
import { ToolRegistryService } from './tools/tool-registry.service';

/**
 * Module AI theo ADR-001.
 *
 * `LLM_PROVIDER` là điểm tách duy nhất: hôm nay trỏ tới `GeminiLlmAdapter`, khi
 * tách service Python thì trỏ tới một `HttpLlmAdapter` và không dòng nào khác
 * trong module phải sửa.
 *
 * `exports` cố ý chỉ có `CandidateContextAssembler` và `ToolRegistryService` —
 * hai thứ module khác có thể cần tái dùng. Adapter **không** được export: ADR §5.1
 * cấm module nghiệp vụ inject adapter trực tiếp, và cách rẻ nhất để thực thi điều
 * đó là không cho nó ra khỏi đây.
 */
@Module({
  controllers: [AiCopilotController],
  providers: [
    { provide: LLM_PROVIDER, useClass: GeminiLlmAdapter },
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
