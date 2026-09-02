import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function testBatch4() {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Bạn là trợ lý AI đánh giá CV. Chấm điểm 3 ứng viên sau đây đối với vị trí "Frontend Developer":
            Ứng viên 1: ID app1, 3 năm kinh nghiệm React, Next.js, TypeScript.
            Ứng viên 2: ID app2, 1 năm kinh nghiệm HTML/CSS cơ bản.
            Ứng viên 3: ID app3, 5 năm kinh nghiệm Vue, Node.js, React.
            Trả về JSON array các object với: applicationId, skillScore (0-40), experienceScore (0-30), projectScore (0-20), summary.`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  const start = Date.now();
  console.log('Sending request to Gemini...');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt)
  });
  const data: any = await res.json();
  console.log(`Finished in ${Date.now() - start}ms, status: ${res.status}`);
  console.log('Result:', data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

void testBatch4().finally(() => prisma.$disconnect());
