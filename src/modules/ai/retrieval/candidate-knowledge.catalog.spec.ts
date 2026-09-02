import { AiKnowledgeSourceType } from '@prisma/client';
import {
  CANDIDATE_KNOWLEDGE_CATALOG,
  CANDIDATE_KNOWLEDGE_CATALOG_VERSION,
} from './candidate-knowledge.catalog';

describe('Candidate knowledge catalog', () => {
  it('contains reviewed first-party guides for both supported candidate locales', () => {
    expect(CANDIDATE_KNOWLEDGE_CATALOG).toHaveLength(8);
    expect(new Set(CANDIDATE_KNOWLEDGE_CATALOG.map((entry) => entry.locale))).toEqual(
      new Set(['vi', 'en']),
    );
    expect(new Set(CANDIDATE_KNOWLEDGE_CATALOG.map((entry) => entry.canonicalUrl)).size).toBe(
      CANDIDATE_KNOWLEDGE_CATALOG.length,
    );
    expect(
      CANDIDATE_KNOWLEDGE_CATALOG.every(
        (entry) => entry.sourceVersion === CANDIDATE_KNOWLEDGE_CATALOG_VERSION,
      ),
    ).toBe(true);
    expect(
      CANDIDATE_KNOWLEDGE_CATALOG.some(
        (entry) => entry.sourceType === AiKnowledgeSourceType.UPNEXT_POLICY,
      ),
    ).toBe(true);
  });

  it('does not put direct-contact or credential-shaped content into the shared corpus', () => {
    const corpus = CANDIDATE_KNOWLEDGE_CATALOG.map((entry) => entry.content).join('\n');
    expect(corpus).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(corpus).not.toMatch(/\b\d{3,4}[ .-]?\d{3}[ .-]?\d{3,4}\b/);
  });
});
