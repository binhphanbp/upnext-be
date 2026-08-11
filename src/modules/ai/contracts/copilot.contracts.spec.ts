import { AI_INTENTS, intentPlanSchema } from './copilot.contracts';
import { routerResponseSchema } from '../prompts/candidate-copilot.prompts';

describe('intentPlanSchema', () => {
  it.each([undefined, null])('normalizes an empty toolCalls value of %p', (toolCalls) => {
    const result = intentPlanSchema.parse({
      intent: 'GENERAL_GUIDANCE',
      toolCalls,
      refusalReason: null,
    });

    expect(result).toEqual({
      intent: 'GENERAL_GUIDANCE',
      toolCalls: [],
      refusalReason: undefined,
    });
  });

  it('keeps a valid requested tool call', () => {
    expect(
      intentPlanSchema.parse({
        intent: 'CV_ANALYSIS',
        toolCalls: [{ name: 'get_candidate_profile', argument: null }],
      }),
    ).toMatchObject({
      intent: 'CV_ANALYSIS',
      toolCalls: [{ name: 'get_candidate_profile', argument: undefined }],
    });
  });
});

describe('routerResponseSchema', () => {
  it('keeps the optional tool-call contract aligned with the runtime parser', () => {
    const schema = routerResponseSchema(AI_INTENTS);

    expect(schema.required).toEqual(['intent']);
    expect(schema.properties.toolCalls).toMatchObject({ nullable: true });
  });
});
