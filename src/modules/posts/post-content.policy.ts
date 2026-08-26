import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

export type PostFieldErrors = Partial<
  Record<
    | 'title'
    | 'slug'
    | 'excerpt'
    | 'content'
    | 'categoryId'
    | 'thumbnailFileId'
    | 'coverImageFileId'
    | 'thumbnailAlt'
    | 'coverImageAlt'
    | 'metaTitle'
    | 'metaDescription'
    | 'canonicalUrl',
    string
  >
>;

export interface PostPolicyInput {
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  content?: string | null;
  categoryId?: string | null;
  thumbnailFileId?: string | null;
  coverImageFileId?: string | null;
  thumbnailAlt?: string | null;
  coverImageAlt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
}

const allowedTags = [
  'p',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'br',
  'a',
  'img',
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function sanitizePostHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attributes) => ({
        tagName,
        attribs:
          attributes.target === '_blank'
            ? { ...attributes, rel: 'noopener noreferrer' }
            : attributes,
      }),
    },
  });
}

export function countPostWords(html: string): number {
  const visibleText = sanitizeHtml(sanitizePostHtml(html), {
    allowedTags: [],
    allowedAttributes: {},
  });

  return visibleText.trim() ? visibleText.trim().split(/\s+/).length : 0;
}

export function validateDraft(input: PostPolicyInput): void {
  const hasTitle = hasText(input.title);
  const sanitizedContent = sanitizePostHtml(input.content ?? '');
  const hasMeaningfulContent =
    countPostWords(sanitizedContent) > 0 || hasImageSource(sanitizedContent);

  if (!hasTitle && !hasMeaningfulContent) {
    throwFieldErrors({
      content: 'Enter a title or meaningful content before saving a draft.',
    });
  }
}

export function validatePublish(input: PostPolicyInput): void {
  const errors: PostFieldErrors = {};
  const titleLength = trimmedLength(input.title);
  const slug = input.slug?.trim() ?? '';
  const excerptLength = trimmedLength(input.excerpt);
  const metaTitleLength = trimmedLength(input.metaTitle);
  const metaDescriptionLength = trimmedLength(input.metaDescription);

  if (titleLength < 10 || titleLength > 255) {
    errors.title = 'Title must be between 10 and 255 characters.';
  }
  if (slug.length > 200 || !slugPattern.test(slug)) {
    errors.slug = 'Slug must be valid and no longer than 200 characters.';
  }
  if (excerptLength < 50 || excerptLength > 500) {
    errors.excerpt = 'Excerpt must be between 50 and 500 characters.';
  }
  if (countPostWords(input.content ?? '') < 300) {
    errors.content = 'Content must contain at least 300 words.';
  }
  if (!isUuid(input.categoryId)) {
    errors.categoryId = 'Choose a category before publishing.';
  }
  if (!isUuid(input.thumbnailFileId)) {
    errors.thumbnailFileId = 'Add a thumbnail image before publishing.';
  }
  if (!isUuid(input.coverImageFileId)) {
    errors.coverImageFileId = 'Add a cover image before publishing.';
  }
  if (!hasText(input.thumbnailAlt)) {
    errors.thumbnailAlt = 'Add thumbnail alt text before publishing.';
  }
  if (!hasText(input.coverImageAlt)) {
    errors.coverImageAlt = 'Add cover image alt text before publishing.';
  }
  if (metaTitleLength < 30 || metaTitleLength > 70) {
    errors.metaTitle = 'Meta title must be between 30 and 70 characters.';
  }
  if (metaDescriptionLength < 120 || metaDescriptionLength > 180) {
    errors.metaDescription = 'Meta description must be between 120 and 180 characters.';
  }
  if (hasText(input.canonicalUrl) && !isHttpsUrl(input.canonicalUrl!.trim())) {
    errors.canonicalUrl = 'Canonical URL must be an absolute HTTPS URL.';
  }

  if (Object.keys(errors).length > 0) {
    throwFieldErrors(errors);
  }
}

function hasImageSource(html: string): boolean {
  return /<img\b[^>]*\bsrc=(?:"[^"]+"|'[^']+'|[^\s>]+)/i.test(html);
}

function hasText(value: string | null | undefined): boolean {
  return trimmedLength(value) > 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && uuidPattern.test(value);
}

function throwFieldErrors(fieldErrors: PostFieldErrors): never {
  throw new BadRequestException({ fieldErrors });
}

function trimmedLength(value: string | null | undefined): number {
  return value?.trim().length ?? 0;
}
