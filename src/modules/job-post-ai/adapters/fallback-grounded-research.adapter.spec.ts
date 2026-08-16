import { FallbackGroundedResearchAdapter } from './fallback-grounded-research.adapter';
import {
  GroundedResearchProviderPort,
  GroundedResearchResponse,
} from '../ports/grounded-research-provider.port';

const answer: GroundedResearchResponse = {
  text: '{"available":true}',
  sources: [{ title: 'ITviec', url: 'https://example.com/itviec' }],
  searchQueries: ['backend salary vietnam'],
  inputTokens: 1,
  outputTokens: 1,
  modelName: 'stub',
};

/** Returns the port and its spy separately so assertions never read the method off the object. */
function stub(name: string, result: GroundedResearchResponse | Error, configured = true) {
  const generateGrounded = jest.fn(
    result instanceof Error ? () => Promise.reject(result) : () => Promise.resolve(result),
  );
  const port: GroundedResearchProviderPort = {
    modelName: name,
    isConfigured: () => configured,
    generateGrounded,
  };
  return { port, generateGrounded };
}

const request = { systemInstruction: 'persona', prompt: 'question' };

describe('FallbackGroundedResearchAdapter', () => {
  it.each(['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'])(
    'falls back to the direct provider on %s',
    async (code) => {
      const primary = stub('upnext-ai', new Error(code));
      const fallback = stub('gemini', { ...answer, modelName: 'gemini-2.5-pro' });
      const adapter = new FallbackGroundedResearchAdapter(primary.port, fallback.port);

      await expect(adapter.generateGrounded(request)).resolves.toMatchObject({
        modelName: 'gemini-2.5-pro',
      });
      expect(fallback.generateGrounded).toHaveBeenCalledTimes(1);
    },
  );

  it('falls back when the service is refused by geography', async () => {
    // A region block is a property of where the service runs, not of the request, so the
    // direct path may still be reachable from a different egress.
    const primary = stub('upnext-ai', new Error('AI_PROVIDER_REGION_BLOCKED'));
    const fallback = stub('gemini', answer);
    const adapter = new FallbackGroundedResearchAdapter(primary.port, fallback.port);

    await expect(adapter.generateGrounded(request)).resolves.toEqual(answer);
  });

  it('does not spend a second grounded run on an answer the service rejected', async () => {
    // A grounded call fans out into several live searches; retrying it through another path
    // doubles the cost for an answer the caller validates itself anyway.
    const primary = stub('upnext-ai', new Error('AI_INVALID_OUTPUT'));
    const fallback = stub('gemini', answer);
    const adapter = new FallbackGroundedResearchAdapter(primary.port, fallback.port);

    await expect(adapter.generateGrounded(request)).rejects.toThrow('AI_INVALID_OUTPUT');
    expect(fallback.generateGrounded).not.toHaveBeenCalled();
  });

  it('skips an unconfigured primary without calling it', async () => {
    const primary = stub('upnext-ai', answer, false);
    const fallback = stub('gemini', answer);
    const adapter = new FallbackGroundedResearchAdapter(primary.port, fallback.port);

    await expect(adapter.generateGrounded(request)).resolves.toEqual(answer);
    expect(primary.generateGrounded).not.toHaveBeenCalled();
    expect(fallback.generateGrounded).toHaveBeenCalledTimes(1);
  });

  it('surfaces the primary failure when no fallback is configured', async () => {
    const primary = stub('upnext-ai', new Error('AI_MODEL_TIMEOUT'));
    const fallback = stub('gemini', answer, false);
    const adapter = new FallbackGroundedResearchAdapter(primary.port, fallback.port);

    await expect(adapter.generateGrounded(request)).rejects.toThrow('AI_MODEL_TIMEOUT');
  });
});
