import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmAdapter } from './adapters/gemini/gemini-llm.adapter';
import { GeminiEmbeddingAdapter } from './adapters/gemini/gemini-embedding.adapter';
import { FallbackEmbeddingAdapter } from './adapters/http/fallback-embedding.adapter';
import { HttpEmbeddingAdapter } from './adapters/http/http-embedding.adapter';
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
import { EMBEDDING_PROVIDER, EmbeddingProviderPort } from './ports/embedding-provider.port';
import { ToolRegistryService } from './tools/tool-registry.service';
import { CandidateKnowledgeRetrievalService } from './retrieval/candidate-knowledge-retrieval.service';
import { CandidateKnowledgeIndexerService } from './retrieval/candidate-knowledge-indexer.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

/**
 * Module AI theo ADR-001.
 *
 * `LLM_PROVIDER` là điểm tách duy nhất. Chuyển traffic sang upnext-ai bằng
 * `AI_LLM_PROVIDER=upnext-ai`; tắt flag là quay lại Gemini trực tiếp mà không
 * đổi controller, prompt, quota hay công cụ nghiệp vụ.
 *
 * Module nghiệp vụ khác chỉ được inject `LLM_PROVIDER`; các adapter cụ thể vẫn
 * không được export để giữ đúng ranh giới ADR §5.1.
 */
@Module({
  imports: [SubscriptionsModule],
  controllers: [AiCopilotController],
  providers: [
    GeminiLlmAdapter,
    GeminiEmbeddingAdapter,
    HttpEmbeddingAdapter,
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
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (
        config: ConfigService,
        http: HttpEmbeddingAdapter,
        gemini: GeminiEmbeddingAdapter,
      ): EmbeddingProviderPort => {
        if (config.get<string>('aiEmbeddingProvider') !== 'upnext-ai') return gemini;
        if (config.get<boolean>('aiEmbeddingFallbackToGemini') === false) return http;
        return new FallbackEmbeddingAdapter(http, gemini);
      },
      inject: [ConfigService, HttpEmbeddingAdapter, GeminiEmbeddingAdapter],
    },
    AiCopilotService,
    AiConversationsService,
    AiActionsService,
    AiBudgetService,
    AiRunTrackerService,
    CandidateContextAssembler,
    ToolRegistryService,
    CandidateKnowledgeRetrievalService,
    CandidateKnowledgeIndexerService,
  ],
  exports: [
    LLM_PROVIDER,
    EMBEDDING_PROVIDER,
    CandidateContextAssembler,
    ToolRegistryService,
    CandidateKnowledgeRetrievalService,
    CandidateKnowledgeIndexerService,
  ],
})
export class AiModule {}
