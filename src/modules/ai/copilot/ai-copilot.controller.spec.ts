import { EventEmitter } from 'node:events';
import { AiConversationContext } from '@prisma/client';
import { SubscriptionFeature } from '../../subscriptions/feature-registry';
import { CandidateSubscriptionQuotaService } from '../../subscriptions/candidate-subscription-quota.service';
import { CandidateContextAssembler } from '../context/candidate-context.assembler';
import { AiActionsService } from './ai-actions.service';
import { AiBudgetService } from './ai-budget.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiCopilotController } from './ai-copilot.controller';
import { AiCopilotService } from './ai-copilot.service';
import { AiRunTrackerService } from './ai-run-tracker.service';
import { CandidateKnowledgeRetrievalService } from '../retrieval/candidate-knowledge-retrieval.service';

describe('AiCopilotController — candidate entitlement', () => {
  const appendUserMessage = jest.fn();
  const reserve = jest.fn();
  const reverseUsage = jest.fn();
  const run = jest.fn();
  const getPublishedSource = jest.fn();

  const conversations = { appendUserMessage } as unknown as AiConversationsService;
  const copilot = { run } as unknown as AiCopilotService;
  const quota = { reserve, reverseUsage } as unknown as CandidateSubscriptionQuotaService;
  const knowledge = { getPublishedSource } as unknown as CandidateKnowledgeRetrievalService;

  let controller: AiCopilotController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiCopilotController(
      copilot,
      conversations,
      {} as AiActionsService,
      {} as CandidateContextAssembler,
      {} as AiBudgetService,
      {} as AiRunTrackerService,
      quota,
      knowledge,
    );
    appendUserMessage.mockResolvedValue({ id: 'user-message' });
    reserve.mockResolvedValue({ usage: { id: 'usage-1' }, replayed: false });
    getPublishedSource.mockResolvedValue({ id: 'source-1' });
  });

  it('keeps a Copilot quota reservation after a completed stream', async () => {
    run.mockImplementation(async function* () {
      yield { event: 'status', data: { step: 'queued' } };
      yield {
        event: 'done',
        data: {
          messageId: 'assistant-message',
          meta: {
            model: 'test',
            promptVersion: 'test',
            latencyMs: 1,
            inputTokens: 1,
            outputTokens: 1,
          },
        },
      };
    });

    await stream(controller);

    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateProfileId: 'candidate-profile',
        feature: SubscriptionFeature.AI_COPILOT_RUN,
        referenceType: 'ai_copilot_run',
      }),
    );
    expect(appendUserMessage).toHaveBeenCalledWith('conversation-id', 'Hello');
    expect(reverseUsage).not.toHaveBeenCalled();
  });

  it('reverses the reservation when the provider emits an error terminal event', async () => {
    run.mockImplementation(async function* () {
      yield {
        event: 'error',
        data: { code: 'AI_SERVICE_UNAVAILABLE', detail: 'Service unavailable', status: 'failed' },
      };
    });

    await stream(controller);

    expect(reverseUsage).toHaveBeenCalledWith('usage-1', 'copilot_run_failed');
  });

  it('reverses the reservation when persisting the candidate prompt fails', async () => {
    appendUserMessage.mockRejectedValue(new Error('database unavailable'));

    await expect(stream(controller)).rejects.toThrow('database unavailable');

    expect(run).not.toHaveBeenCalled();
    expect(reverseUsage).toHaveBeenCalledWith('usage-1', 'copilot_run_failed');
  });

  it('resolves a citation source through the publication-checked knowledge service', async () => {
    await expect(controller.knowledgeSource('source-1')).resolves.toEqual({
      data: { id: 'source-1' },
    });
    expect(getPublishedSource).toHaveBeenCalledWith('source-1');
  });
});

async function stream(controller: AiCopilotController) {
  const request = new EventEmitter();
  const response = responseStub();
  return (
    controller as unknown as { sendMessageStream: (...args: unknown[]) => Promise<void> }
  ).sendMessageStream(
    { id: 'candidate-account' },
    'conversation-id',
    { prompt: 'Hello' },
    'candidate-profile',
    { contextType: AiConversationContext.GENERAL, contextId: null, locale: 'en' },
    request,
    response,
  );
}

function responseStub() {
  return {
    writableEnded: false,
    writeHead: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  };
}
