import { ActorType, AiConversationContext, AiRunStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmProviderPort } from '../ports/llm-provider.port';
import { ToolExecutionResult, ToolRegistryService } from '../tools/tool-registry.service';
import { AiActionsService } from './ai-actions.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiCopilotService, CopilotRunInput } from './ai-copilot.service';
import { CandidateContextAssembler } from '../context/candidate-context.assembler';
import { CandidateKnowledgeRetrievalService } from '../retrieval/candidate-knowledge-retrieval.service';

describe('AiCopilotService — business orchestration', () => {
  const generateStructured = jest.fn();
  const streamText = jest.fn();
  const listFor = jest.fn();
  const labelFor = jest.fn();
  const execute = jest.fn();
  const createAssistantPlaceholder = jest.fn();
  const recentTurns = jest.fn();
  const finalizeAssistantMessage = jest.fn();
  const propose = jest.fn();
  const createRun = jest.fn();
  const createAiUsageLog = jest.fn();
  const searchKnowledge = jest.fn();

  const llm = {
    modelName: 'test-model',
    isConfigured: () => true,
    generateStructured,
    streamText,
  } as unknown as LlmProviderPort;
  const tools = { listFor, labelFor, execute } as unknown as ToolRegistryService;
  const context = {
    profile: jest.fn(),
    isJobSaved: jest.fn(),
  } as unknown as CandidateContextAssembler;
  const conversations = {
    createAssistantPlaceholder,
    recentTurns,
    finalizeAssistantMessage,
  } as unknown as AiConversationsService;
  const actions = { propose } as unknown as AiActionsService;
  const prisma = {
    aIRun: { create: createRun },
    aiUsageLog: { create: createAiUsageLog },
  } as unknown as PrismaService;
  const knowledge = { search: searchKnowledge } as unknown as CandidateKnowledgeRetrievalService;

  let service: AiCopilotService;

  const input = (overrides: Partial<CopilotRunInput> = {}): CopilotRunInput => ({
    conversationId: 'conversation-1',
    candidateProfileId: 'candidate-profile-1',
    candidateAccountId: 'candidate-account-1',
    prompt: 'Hello',
    contextType: AiConversationContext.GENERAL,
    contextId: null,
    locale: 'en',
    signal: new AbortController().signal,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiCopilotService(llm, tools, context, conversations, actions, prisma, knowledge);
    createAssistantPlaceholder.mockResolvedValue({ id: 'assistant-1' });
    recentTurns.mockResolvedValue([{ role: 'USER', content: 'Hello' }]);
    listFor.mockReturnValue([]);
    labelFor.mockImplementation((_role: ActorType, name: string) => name);
    finalizeAssistantMessage.mockResolvedValue(undefined);
    createRun.mockResolvedValue(undefined);
    createAiUsageLog.mockResolvedValue(undefined);
    searchKnowledge.mockResolvedValue([]);
    streamText.mockImplementation(async function* () {
      yield { kind: 'text' as const, text: 'A grounded answer.' };
      yield { kind: 'usage' as const, inputTokens: 7, outputTokens: 4, modelName: 'test-model' };
    });
  });

  it('does not duplicate the prompt already persisted by the controller', async () => {
    generateStructured.mockResolvedValue({
      value: { intent: 'GENERAL_GUIDANCE', toolCalls: [] },
      inputTokens: 3,
      outputTokens: 2,
    });

    const events = await collect(service.run(input()));

    const routerRequest = generateStructured.mock.calls[0]?.[0] as {
      messages: { role: string; text: string }[];
    };
    expect(routerRequest.messages).toHaveLength(1);
    expect(routerRequest.messages[0]?.text).toContain('QUESTION: Hello');
    expect(events.at(-1)).toMatchObject({ event: 'done' });
    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: AiRunStatus.COMPLETED, content: 'A grounded answer.' }),
    );
  });

  it('grounds general guidance in candidate knowledge and emits only permitted citations', async () => {
    generateStructured.mockResolvedValue({
      value: { intent: 'GENERAL_GUIDANCE', toolCalls: [] },
      inputTokens: 3,
      outputTokens: 2,
    });
    searchKnowledge.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        documentId: 'document-1',
        title: 'Hướng dẫn CV',
        canonicalUrl: '/guides/cv',
        sourceVersion: 'v1',
        excerpt: 'Dùng thành tựu có thể đo lường.',
        semanticScore: 0.9,
        lexicalScore: 0.1,
        score: 0.66,
      },
    ]);

    const events = await collect(service.run(input({ prompt: 'Làm CV tốt hơn như thế nào?' })));

    expect(searchKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ candidateProfileId: 'candidate-profile-1', locale: 'en' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'citation',
        data: expect.objectContaining({
          citation: expect.objectContaining({ sourceType: 'POLICY', sourceId: 'document-1' }),
        }),
      }),
    );
    expect(streamText.mock.calls[0]?.[0].messages.at(-1)?.text).toContain(
      'Dùng thành tựu có thể đo lường.',
    );
  });

  it('ghi AiUsageLog cho lượt Copilot đã hoàn tất, tổng token router + answer (D3c)', async () => {
    generateStructured.mockResolvedValue({
      value: { intent: 'GENERAL_GUIDANCE', toolCalls: [] },
      inputTokens: 3,
      outputTokens: 2,
    });

    await collect(service.run(input()));

    expect(createAiUsageLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feature: 'ai_copilot_run',
        companyId: null,
        actorId: 'candidate-profile-1',
        modelName: 'test-model',
        inputTokens: 10,
        outputTokens: 6,
        referenceType: 'AI_COPILOT_RUN',
        succeeded: true,
      }),
    });
  });

  it('emits tool_start before awaiting the tool result', async () => {
    generateStructured.mockResolvedValue({
      value: { intent: 'CV_ANALYSIS', toolCalls: [] },
      inputTokens: 1,
      outputTokens: 1,
    });
    labelFor.mockReturnValue('Reading your CV');

    let resolveTool: ((value: ToolExecutionResult) => void) | undefined;
    execute.mockReturnValue(
      new Promise<ToolExecutionResult>((resolve) => {
        resolveTool = resolve;
      }),
    );

    const iterator = service.run(input())[Symbol.asyncIterator]();
    await iterator.next(); // queued
    await iterator.next(); // intent
    await iterator.next(); // processing
    const started = await iterator.next();

    expect(started.value).toMatchObject({
      event: 'tool_start',
      data: { tool: { label: 'Reading your CV', status: 'running' } },
    });
    expect(execute).not.toHaveBeenCalled();

    // Resume the generator: only now may it start the potentially slow query.
    const resultEvent = iterator.next();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledWith(
      'get_own_cv',
      expect.objectContaining({ ownerId: 'candidate-profile-1', locale: 'en' }),
    );

    resolveTool?.({
      status: 'failed',
      label: 'Reading your CV',
      detail: 'UpNext could not retrieve this data. Please try again.',
    });
    expect((await resultEvent).value).toMatchObject({ event: 'tool_result' });
    const remaining = await collectIterator(iterator);
    expect(remaining).toContainEqual(
      expect.objectContaining({
        event: 'error',
        data: expect.objectContaining({ code: 'AI_TOOL_FAILED' }),
      }),
    );
  });

  it('requires a concrete job context for job comparison and does not call tools', async () => {
    generateStructured.mockResolvedValue({
      value: { intent: 'JOB_COMPARISON', toolCalls: [] },
      inputTokens: 1,
      outputTokens: 1,
    });

    const events = await collect(service.run(input({ prompt: 'Compare my CV with this job' })));

    expect(execute).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'error',
        data: expect.objectContaining({
          code: 'AI_CONTEXT_NOT_FOUND',
          detail: 'Open the job you want to compare, then ask this question again.',
        }),
      }),
    );
  });

  it('returns a friendly localized error when every required data tool fails', async () => {
    generateStructured.mockResolvedValue({
      value: { intent: 'APPLICATION_STATUS', toolCalls: [] },
      inputTokens: 1,
      outputTokens: 1,
    });
    execute.mockResolvedValue({
      status: 'failed',
      label: 'Đọc đơn ứng tuyển của bạn',
      detail: 'UpNext chưa lấy được dữ liệu này. Bạn vui lòng thử lại.',
    });

    const events = await collect(
      service.run(input({ prompt: 'Đơn của tôi thế nào?', locale: 'vi' })),
    );

    expect(streamText).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'error',
        data: expect.objectContaining({
          code: 'AI_TOOL_FAILED',
          detail:
            'Mình chưa lấy được dữ liệu cần thiết để trả lời. Dữ liệu của bạn không bị thay đổi; vui lòng thử lại nhé.',
        }),
      }),
    );
  });

  it('does not let the model expand the data boundary of a tool-free intent', async () => {
    generateStructured.mockResolvedValue({
      value: {
        intent: 'GENERAL_GUIDANCE',
        toolCalls: [{ name: 'get_own_applications' }],
      },
      inputTokens: 1,
      outputTokens: 1,
    });

    const events = await collect(service.run(input({ prompt: 'What can you help me with?' })));

    expect(execute).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ event: 'done' });
  });
});

async function collect(generator: AsyncGenerator<unknown>): Promise<unknown[]> {
  return collectIterator(generator[Symbol.asyncIterator]());
}

async function collectIterator(iterator: AsyncIterator<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) return events;
    events.push(next.value);
  }
}
