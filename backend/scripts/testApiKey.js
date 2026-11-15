import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

// Connectivity test only: tiny request, tiny cost. VERIFY the call shape in the SDK docs.
if (!process.env.ANTHROPIC_API_KEY) { console.error('FAILED: ANTHROPIC_API_KEY is not set in .env'); process.exit(1); }
if (!process.env.CLAUDE_MODEL) { console.error('FAILED: CLAUDE_MODEL is not set in .env'); process.exit(1); }

const client = new Anthropic({ timeout: 30_000 });
try {
  const started = Date.now();
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL,
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
  });
  console.log('Reply:', response.content[0]?.text);
  console.log('Latency (ms):', Date.now() - started);
  console.log('Usage:', response.usage);
} catch (err) {
  console.error('FAILED:', err.status ?? '', err.message);
  process.exitCode = 1;
}