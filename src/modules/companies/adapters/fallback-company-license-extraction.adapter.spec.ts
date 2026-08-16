import { FallbackCompanyLicenseExtractionAdapter } from './fallback-company-license-extraction.adapter';
import {
  CompanyLicenseExtractionProviderPort,
  CompanyLicenseExtractionRequest,
  CompanyLicenseExtractionResponse,
} from '../ports/company-license-extraction-provider.port';

const request: CompanyLicenseExtractionRequest = {
  systemInstruction: 'Return JSON only.',
  prompt: 'Extract the licence fields.',
  responseSchema: { type: 'OBJECT' },
  file: { mimeType: 'application/pdf', base64Data: 'cGRm' },
};

const ok: CompanyLicenseExtractionResponse = {
  value: { name: 'X' },
  inputTokens: 1,
  outputTokens: 1,
  modelName: 'gemini',
};

/** Returns the port plus a direct handle on its mock, so assertions never
 *  reference the method through the object (which trips unbound-method). */
function stub(options: {
  modelName?: string;
  configured?: boolean;
  result?: Promise<CompanyLicenseExtractionResponse>;
}) {
  const extractStructured = jest
    .fn<Promise<CompanyLicenseExtractionResponse>, [CompanyLicenseExtractionRequest]>()
    .mockImplementation(() => options.result ?? Promise.resolve(ok));
  const port: CompanyLicenseExtractionProviderPort = {
    modelName: options.modelName ?? 'stub',
    isConfigured: () => options.configured ?? true,
    extractStructured,
  };
  return { port, extractStructured };
}

describe('FallbackCompanyLicenseExtractionAdapter', () => {
  it.each([
    'AI_SERVICE_UNAVAILABLE',
    'AI_MODEL_TIMEOUT',
    'AI_MODEL_RATE_LIMIT',
    'AI_PROVIDER_REGION_BLOCKED',
  ])('falls back to Gemini on %s', async (code) => {
    const primary = stub({ result: Promise.reject(new Error(code)) });
    const fallback = stub({ modelName: 'gemini' });

    const adapter = new FallbackCompanyLicenseExtractionAdapter(primary.port, fallback.port);

    await expect(adapter.extractStructured(request)).resolves.toMatchObject({
      value: { name: 'X' },
    });
    expect(fallback.extractStructured).toHaveBeenCalledTimes(1);
  });

  it('does not mask a malformed result with a second opinion', async () => {
    // Onboarding verifies a company from these fields; a quietly different
    // answer from another model is worse than an error the user can retry.
    const primary = stub({ result: Promise.reject(new Error('AI_INVALID_OUTPUT')) });
    const fallback = stub({});

    const adapter = new FallbackCompanyLicenseExtractionAdapter(primary.port, fallback.port);

    await expect(adapter.extractStructured(request)).rejects.toThrow('AI_INVALID_OUTPUT');
    expect(fallback.extractStructured).not.toHaveBeenCalled();
  });

  it('skips the primary entirely when it is not configured', async () => {
    const primary = stub({ configured: false });
    const fallback = stub({ modelName: 'gemini' });

    const adapter = new FallbackCompanyLicenseExtractionAdapter(primary.port, fallback.port);

    await expect(adapter.extractStructured(request)).resolves.toBeDefined();
    expect(primary.extractStructured).not.toHaveBeenCalled();
    expect(fallback.extractStructured).toHaveBeenCalledTimes(1);
  });
});
