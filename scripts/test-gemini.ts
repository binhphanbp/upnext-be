import 'dotenv/config';

const apiKey = process.env.GEMINI_API_KEY;
console.log('API Key exists:', Boolean(apiKey), apiKey?.slice(0, 10));

async function testModel(model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hello, respond with {"status": "ok"}' }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const status = res.status;
    const body: any = await res.json();
    console.log(`[${model}] Status: ${status}, Time: ${Date.now() - start}ms`);
    if (status !== 200) {
      console.log('Error body:', JSON.stringify(body, null, 2));
    } else {
      console.log('Response:', body?.candidates?.[0]?.content?.parts?.[0]?.text);
    }
  } catch (err) {
    console.error(`[${model}] Fetch error:`, err);
  }
}

async function run() {
  await testModel('gemini-2.5-flash');
  await testModel('gemini-2.0-flash');
  await testModel('gemini-1.5-flash');
}

run();
