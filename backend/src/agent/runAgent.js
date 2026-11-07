import { toolDefinitions } from './toolDefinitions.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { parseAgentOutput } from './validateSchedule.js';

const TOOL_TIMEOUT_MS = 15_000;

// Rejects if a tool handler hangs, so one slow service cannot freeze the daily job.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Runs the tool-use loop. `client` is an Anthropic client (or a fake one in tests).
// Never throws: always returns { ok, data, error, turns, toolCalls, usage, latency_ms }.
export async function runAgent({
  client, model, zone, handlers, today,
  maxTurns = 8, maxTokens = 2000, maxStops = 20,
}) {
  const started = Date.now();
  const usage = { input_tokens: 0, output_tokens: 0 };
  const toolCalls = [];
  const system = buildSystemPrompt({ maxStops });
  const messages = [{
    role: 'user',
    content: `Create the collection schedule for zone "${zone}". Today is ${today} (Asia/Jakarta).`,
  }];

  const result = (ok, data, error, turns) => ({
    ok, data, error, turns, toolCalls, usage, latency_ms: Date.now() - started,
  });

  for (let turn = 1; turn <= maxTurns; turn++) {
    let response;
    try {
      response = await client.messages.create({
        model, max_tokens: maxTokens, system, tools: toolDefinitions, messages,
      });
    } catch (err) {
      return result(false, null, `API call failed: ${err.message}`, turn);
    }

    usage.input_tokens += response.usage?.input_tokens ?? 0;
    usage.output_tokens += response.usage?.output_tokens ?? 0;
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const results = [];
      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        // Force the zone so the model cannot read other zones
        const input = block.name === 'get_bin_status' ? { ...block.input, zone } : block.input;
        const handler = handlers[block.name];
        const call = { name: block.name, input, ok: true };
        let content;
        let isError = false;
        if (!handler) {
          isError = true;
          content = `Unknown tool: ${block.name}`;
        } else {
          try {
            content = JSON.stringify(await withTimeout(handler(input), TOOL_TIMEOUT_MS, block.name));
          } catch (err) {
            isError = true;
            content = `Tool failed: ${err.message}`;
          }
        }
        call.ok = !isError;
        toolCalls.push(call);
        results.push({ type: 'tool_result', tool_use_id: block.id, content, ...(isError && { is_error: true }) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    if (response.stop_reason === 'max_tokens') {
      return result(false, null, 'Agent output was cut off (max_tokens reached)', turn);
    }

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = parseAgentOutput(text);
    if (!parsed.ok) return result(false, null, parsed.error, turn);
    return result(true, parsed.data, null, turn);
  }

  return result(false, null, `Max turns reached (${maxTurns}) without a final answer`, maxTurns);
}