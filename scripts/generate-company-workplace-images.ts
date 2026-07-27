import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import 'dotenv/config';

type CompanySeedItem = {
  name: string;
  slug: string;
  type?: string;
  address?: string;
  description?: string;
  companySize?: string;
  environmentImages?: string[];
};

type CompanySeedData = {
  companies: CompanySeedItem[];
};

type GeminiInteraction = {
  output_image?: {
    data?: string;
    mime_type?: string;
  };
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      data?: string;
      mime_type?: string;
    }>;
  }>;
};

const seedPath = path.resolve('prisma/data/companies_50_real_logo_dev.json');
const geminiModel = process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-lite-image';
const concurrency = getPositiveIntegerArgument('--concurrency', 3);
const limit = getPositiveIntegerArgument('--limit', Number.POSITIVE_INFINITY);
const force = process.argv.includes('--force');
const selectedCompany = getStringArgument('--company');
const generatedCloudinaryPath = '/upnext/seed/company-workplaces/';

const sceneDirections = [
  'A wide-angle view of the main collaborative workplace: contemporary desks, meeting zones, natural daylight, tasteful materials, and subtle industry-relevant details.',
  'A candid editorial scene of a diverse Vietnamese professional team collaborating naturally in a bright project area, with realistic work tools appropriate to the company sector.',
  'A distinctive secondary work area appropriate to the business: an engineering lab, operations room, design studio, customer experience center, logistics hub, or focused quiet zone as relevant.',
] as const;

function getPositiveIntegerArgument(name: string, fallback: number) {
  const value = getStringArgument(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getStringArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function compactDescription(value: string | undefined) {
  return value?.replace(/\s+/gu, ' ').trim().slice(0, 500) || 'No company description supplied.';
}

function buildPrompt(company: CompanySeedItem, sceneIndex: number) {
  return [
    'Use case: photorealistic-natural',
    'Asset type: company profile workplace gallery',
    `Company: ${company.name}`,
    `Business type: ${company.type || 'OTHER'}`,
    `Location context: ${company.address || 'Vietnam'}`,
    `Company size: ${company.companySize || 'Not specified'}`,
    `Company context: ${compactDescription(company.description)}`,
    `Scene: ${sceneDirections[sceneIndex]}`,
    'Style: premium but believable editorial workplace photography, realistic Vietnamese context, architectural photography quality.',
    'Composition: landscape 16:9, medium-wide framing, clear depth, suitable for a website gallery crop.',
    'Lighting: natural daylight with balanced indoor lighting, realistic colors, no dramatic cinematic grading.',
    'Constraints: create an illustrative workplace that fits the company sector and scale; people must look natural and be engaged in plausible work.',
    'Avoid: visible company logos, brand marks, readable text, watermarks, UI overlays, staged handshakes, distorted hands, empty generic stock-photo feeling. Whiteboards, screens, and glass walls must contain only abstract illegible shapes with no words.',
  ].join('\n');
}

function findImage(interaction: GeminiInteraction) {
  if (interaction.output_image?.data) return interaction.output_image;

  for (const step of interaction.steps ?? []) {
    for (const content of step.content ?? []) {
      if (content.type === 'image' && content.data) {
        return {
          data: content.data,
          mime_type: content.mime_type,
        };
      }
    }
  }

  return null;
}

async function generateImage(apiKey: string, prompt: string) {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: geminiModel,
        input: prompt,
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '16:9',
        },
      }),
    });

    if (response.ok) {
      const interaction = (await response.json()) as GeminiInteraction;
      const image = findImage(interaction);
      if (!image?.data) {
        throw new Error('Gemini returned no image data.');
      }
      return Buffer.from(image.data, 'base64');
    }

    const responseText = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1_000
        : Math.min(30_000, 1_500 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    throw new Error(
      `Gemini image generation failed (${response.status}): ${responseText.slice(0, 500)}`,
    );
  }

  throw new Error('Gemini image generation exhausted all retry attempts.');
}

function uploadImage(buffer: Buffer, company: CompanySeedItem, sceneIndex: number) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: `upnext/seed/company-workplaces/${company.slug}`,
        public_id: `workplace-${sceneIndex + 1}`,
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
        format: 'jpg',
        transformation: [
          {
            width: 1200,
            height: 700,
            crop: 'fill',
            gravity: 'auto',
            quality: 'auto:good',
          },
        ],
      },
      (error, result) => {
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary returned no upload result.'));
          return;
        }
        resolve(result);
      },
    );
    upload.end(buffer);
  });
}

function isGeneratedUrl(url: string | undefined) {
  return Boolean(url?.includes('res.cloudinary.com') && url.includes(generatedCloudinaryPath));
}

function persistSeed(seedData: CompanySeedData) {
  fs.writeFileSync(seedPath, `${JSON.stringify(seedData, null, 2)}\n`, 'utf8');
}

async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const geminiApiKey = requireEnvironment('GEMINI_API_KEY');
  cloudinary.config({
    cloud_name: requireEnvironment('CLOUDINARY_CLOUD_NAME'),
    api_key: requireEnvironment('CLOUDINARY_API_KEY'),
    api_secret: requireEnvironment('CLOUDINARY_API_SECRET'),
    secure: true,
  });

  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as CompanySeedData;
  const companies = seedData.companies
    .filter((company) => !selectedCompany || company.slug === selectedCompany)
    .slice(0, limit);
  const tasks = companies.flatMap((company) =>
    sceneDirections.map((_, sceneIndex) => ({ company, sceneIndex })),
  );
  const pendingTasks = tasks.filter(({ company, sceneIndex }) => {
    const currentUrl = company.environmentImages?.[sceneIndex];
    return force || !isGeneratedUrl(currentUrl);
  });
  let completed = tasks.length - pendingTasks.length;
  const total = tasks.length;

  console.log(
    `Generating ${pendingTasks.length} of ${total} workplace images with ${geminiModel} (concurrency ${concurrency}).`,
  );

  await runWithConcurrency(pendingTasks, async ({ company, sceneIndex }) => {
    const prompt = buildPrompt(company, sceneIndex);
    const imageBuffer = await generateImage(geminiApiKey, prompt);
    const upload = await uploadImage(imageBuffer, company, sceneIndex);
    company.environmentImages ??= [];
    company.environmentImages[sceneIndex] = upload.secure_url;
    persistSeed(seedData);
    completed += 1;
    console.log(
      `[${completed}/${total}] ${company.slug} workplace-${sceneIndex + 1} uploaded (${upload.bytes} bytes).`,
    );
  });

  const digest = createHash('sha256')
    .update(JSON.stringify(seedData.companies.map((company) => company.environmentImages)))
    .digest('hex')
    .slice(0, 12);
  console.log(`Company workplace generation complete. Seed image digest: ${digest}.`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
