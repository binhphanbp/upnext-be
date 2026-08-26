import { BadRequestException } from '@nestjs/common';
import {
  countPostWords,
  PostFieldErrors,
  PostPolicyInput,
  sanitizePostHtml,
  validateDraft,
  validatePublish,
} from './post-content.policy';

const validPost = (overrides: Partial<PostPolicyInput> = {}): PostPolicyInput => ({
  title: 'A practical guide to writing helpful technical articles',
  slug: 'practical-technical-article-guide',
  excerpt:
    'A concise introduction to the practices that make technical articles useful and trustworthy.',
  content: `<p>${'word '.repeat(300)}</p>`,
  categoryId: '51cdf63e-2377-48c2-90a6-0dcd70848898',
  thumbnailFileId: '5c5c057f-c33d-4db1-b705-b7e8797b7f18',
  coverImageFileId: '1a07f1ed-3a5d-48bb-8548-468c6372d5e3',
  thumbnailAlt: 'Illustration of a writer planning an article',
  coverImageAlt: 'A laptop displaying an article outline',
  metaTitle: 'Practical technical article writing guide',
  metaDescription:
    'Learn a repeatable approach to researching, outlining, and editing technical articles that give readers practical value and clear next steps.',
  ...overrides,
});

const fieldErrorsFrom = (validate: () => void): PostFieldErrors => {
  try {
    validate();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { fieldErrors: PostFieldErrors })
      .fieldErrors;
  }

  throw new Error('Expected validation to reject the post');
};

describe('sanitizePostHtml', () => {
  it('removes scripts and javascript URLs', () => {
    expect(sanitizePostHtml('<script>x()</script><a href="javascript:x()">x</a>')).toBe('<a>x</a>');
  });

  it('removes event handlers and unsafe image sources', () => {
    expect(
      sanitizePostHtml('<p onclick="x()">Hello</p><img src="data:text/html,x" onerror="x()">'),
    ).toBe('<p>Hello</p><img />');
  });

  it('preserves allowed headings, links, and images', () => {
    expect(
      sanitizePostHtml(
        '<h2>Heading</h2><a href="https://upnext.works/posts" rel="author">Read more</a><img src="https://cdn.upnext.works/cover.png" alt="Cover" title="Article cover" width="1200" height="630">',
      ),
    ).toBe(
      '<h2>Heading</h2><a href="https://upnext.works/posts" rel="author">Read more</a><img src="https://cdn.upnext.works/cover.png" alt="Cover" title="Article cover" width="1200" height="630" />',
    );
  });

  it('adds safe rel values to links that open in a new tab', () => {
    expect(sanitizePostHtml('<a href="https://upnext.works" target="_blank">UpNext</a>')).toBe(
      '<a href="https://upnext.works" target="_blank" rel="noopener noreferrer">UpNext</a>',
    );
  });

  it('normalizes case variants of _blank before adding safe rel values', () => {
    expect(sanitizePostHtml('<a href="https://upnext.works" target="_BLANK">UpNext</a>')).toBe(
      '<a href="https://upnext.works" target="_blank" rel="noopener noreferrer">UpNext</a>',
    );
  });
});

describe('countPostWords', () => {
  it('counts visible text rather than markup or whitespace', () => {
    expect(countPostWords('<h2>One two</h2><p> three&nbsp;four </p><img alt="five">')).toBe(4);
  });
});

describe('validateDraft', () => {
  it('rejects a draft without a title or meaningful editor content', () => {
    const fieldErrors = fieldErrorsFrom(() =>
      validateDraft({ title: '   ', content: '<p>  </p>' }),
    );

    expect(fieldErrors).toEqual({
      content: 'Enter a title or meaningful content before saving a draft.',
    });
  });

  it('allows a draft with a title even when publish fields are incomplete', () => {
    expect(() => validateDraft({ title: 'Working outline', content: '' })).not.toThrow();
  });

  it('allows an image-only draft as meaningful editor content', () => {
    expect(() =>
      validateDraft({
        title: '',
        content: '<img src="https://cdn.upnext.works/draft.png" alt="Draft">',
      }),
    ).not.toThrow();
  });
});

describe('validatePublish', () => {
  it('accepts a post at every minimum and maximum publish boundary', () => {
    expect(() =>
      validatePublish(
        validPost({
          title: 't'.repeat(10),
          slug: 's'.repeat(200),
          excerpt: 'e'.repeat(50),
          content: `<p>${'word '.repeat(300)}</p>`,
          thumbnailAlt: 'a',
          coverImageAlt: 'b',
          metaTitle: 'm'.repeat(30),
          metaDescription: 'd'.repeat(120),
          canonicalUrl: 'https://upnext.works/posts/article',
        }),
      ),
    ).not.toThrow();

    expect(() =>
      validatePublish(
        validPost({
          title: 't'.repeat(255),
          excerpt: 'e'.repeat(500),
          metaTitle: 'm'.repeat(70),
          metaDescription: 'd'.repeat(180),
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a 299-word post at publish time', () => {
    expect(() => validatePublish(validPost({ content: `<p>${'word '.repeat(299)}</p>` }))).toThrow(
      BadRequestException,
    );
    expect(
      fieldErrorsFrom(() =>
        validatePublish(validPost({ content: `<p>${'word '.repeat(299)}</p>` })),
      ),
    ).toEqual({
      content: 'Content must contain at least 300 words.',
    });
  });

  it('reports every publish field that falls below its lower boundary', () => {
    const fieldErrors = fieldErrorsFrom(() =>
      validatePublish(
        validPost({
          title: 'short',
          slug: '',
          excerpt: 'brief',
          content: '<p>too short</p>',
          categoryId: '',
          thumbnailFileId: '',
          coverImageFileId: '',
          thumbnailAlt: ' ',
          coverImageAlt: ' ',
          metaTitle: 'brief title',
          metaDescription: 'brief description',
          canonicalUrl: 'http://upnext.works/posts/article',
        }),
      ),
    );

    expect(fieldErrors).toEqual({
      title: 'Title must be between 10 and 255 characters.',
      slug: 'Slug must be valid and no longer than 200 characters.',
      excerpt: 'Excerpt must be between 50 and 500 characters.',
      content: 'Content must contain at least 300 words.',
      categoryId: 'Choose a category before publishing.',
      thumbnailFileId: 'Add a thumbnail image before publishing.',
      coverImageFileId: 'Add a cover image before publishing.',
      thumbnailAlt: 'Add thumbnail alt text before publishing.',
      coverImageAlt: 'Add cover image alt text before publishing.',
      metaTitle: 'Meta title must be between 30 and 70 characters.',
      metaDescription: 'Meta description must be between 120 and 180 characters.',
      canonicalUrl: 'Canonical URL must be an absolute HTTPS URL.',
    });
  });

  it('reports every publish field that exceeds its upper boundary or has an invalid slug', () => {
    const fieldErrors = fieldErrorsFrom(() =>
      validatePublish(
        validPost({
          title: 't'.repeat(256),
          slug: 'Not a valid slug!',
          excerpt: 'e'.repeat(501),
          metaTitle: 'm'.repeat(71),
          metaDescription: 'd'.repeat(181),
          canonicalUrl: 'https://',
        }),
      ),
    );

    expect(fieldErrors).toEqual({
      title: 'Title must be between 10 and 255 characters.',
      slug: 'Slug must be valid and no longer than 200 characters.',
      excerpt: 'Excerpt must be between 50 and 500 characters.',
      metaTitle: 'Meta title must be between 30 and 70 characters.',
      metaDescription: 'Meta description must be between 120 and 180 characters.',
      canonicalUrl: 'Canonical URL must be an absolute HTTPS URL.',
    });
  });

  it('accepts an omitted canonical URL', () => {
    expect(() => validatePublish(validPost({ canonicalUrl: '' }))).not.toThrow();
  });
});
