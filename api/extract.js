// Vercel Serverless Function: /api/extract
// Accepts RFP text, calls Anthropic Claude with forced tool_use for
// guaranteed valid JSON output. Returns the parsed checklist as a single
// JSON response. Non-streaming for simplicity and reliability.
//
// Required environment variables (set in Vercel Project Settings):
//   ANTHROPIC_API_KEY
//
// Timeout: 60 seconds in vercel.json.

const MAX_RFP_CHARS = 100000; // ~25k tokens. Keeps extraction under 60 seconds for most RFPs.

const SYSTEM_PROMPT = `You are an AEC proposal analyst with over 50 years of experience reading architecture, engineering, and construction RFPs. Your job is to extract a practitioner checklist from RFPs.

Priority rules:
- "high" = disqualifies the firm if missed (licensing, insurance, submission format, hard deadlines)
- "medium" = required but recoverable if caught in review
- "low" = preferred or nice-to-have

Hidden requirements are things any AEC principal would need to satisfy but that the RFP does not explicitly call out on page one. Examples: state licensing reciprocity, MBE participation, specific code references, insurance minimums buried in appendices.

Every checklist item must be actionable and specific. No vague items like "review requirements". If the document is not an AEC RFP, return all arrays empty and projectInfo all null.

Always call the record_checklist tool. Never respond with plain text.`;

const CHECKLIST_TOOL = {
  name: 'record_checklist',
  description: 'Record the extracted RFP checklist with project info, submission requirements, scope requirements, and hidden requirements.',
  input_schema: {
    type: 'object',
    properties: {
      projectInfo: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          budget: { type: ['string', 'null'] },
          deadline: { type: ['string', 'null'] }
        },
        required: ['name', 'location', 'budget', 'deadline']
      },
      submissionRequirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            category: { type: 'string', enum: ['format', 'content', 'delivery'] }
          },
          required: ['text', 'priority', 'category']
        }
      },
      scopeRequirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] }
          },
          required: ['text', 'priority']
        }
      },
      hiddenRequirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            reason: { type: 'string' }
          },
          required: ['text', 'priority', 'reason']
        }
      }
    },
    required: ['projectInfo', 'submissionRequirements', 'scopeRequirements', 'hiddenRequirements']
  }
};

const MODELS_TO_TRY = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-latest'
];

async function callAnthropic(apiKey, processText, modelId) {
  const body = {
    model: modelId,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [CHECKLIST_TOOL],
    tool_choice: { type: 'tool', name: 'record_checklist' },
    messages: [
      {
        role: 'user',
        content: 'Extract a practitioner checklist from this RFP:\n\n' + processText
      }
    ]
  };

  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  const elapsedMs = Date.now() - started;
  console.log('Anthropic call', modelId, 'status', res.status, 'took', elapsedMs, 'ms', 'inputChars', processText.length);

  let json;
  try { json = JSON.parse(text); } catch (e) { json = null; }

  return { status: res.status, ok: res.ok, json: json, rawText: text, modelId: modelId, elapsedMs: elapsedMs };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Server not configured - ANTHROPIC_API_KEY missing' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const rfpText = (body.rfpText || '').toString().trim();
  if (!rfpText) {
    return res.status(400).json({ success: false, error: 'RFP text is required.' });
  }

  const truncated = rfpText.length > MAX_RFP_CHARS;
  const processText = truncated ? rfpText.slice(0, MAX_RFP_CHARS) : rfpText;

  let lastError = null;
  let response = null;

  // Try each model until one accepts. Anthropic occasionally retires aliases.
  for (const modelId of MODELS_TO_TRY) {
    try {
      response = await callAnthropic(apiKey, processText, modelId);
      if (response.ok) break;

      // 404 or "model not found" errors mean try the next candidate
      const errType = response.json && response.json.error && response.json.error.type;
      const isModelError = response.status === 404 ||
        (errType === 'not_found_error') ||
        (response.json && response.json.error && /model/i.test(response.json.error.message || ''));

      lastError = {
        status: response.status,
        message: (response.json && response.json.error && response.json.error.message) || response.rawText.slice(0, 300),
        model: modelId
      };
      console.warn('Anthropic call failed for model', modelId, response.status, lastError.message);

      if (!isModelError) break; // auth/rate/other - stop retrying
    } catch (err) {
      lastError = { status: 0, message: err.message || 'fetch failed', model: modelId };
      console.error('Anthropic fetch threw for model', modelId, err);
    }
  }

  if (!response || !response.ok) {
    return res.status(502).json({
      success: false,
      error: 'AI service error: ' + (lastError ? lastError.message : 'all models failed') + ' (tried: ' + MODELS_TO_TRY.join(', ') + ')'
    });
  }

  // Extract the tool_use block from the response content array
  const content = response.json && response.json.content;
  if (!Array.isArray(content)) {
    console.error('Unexpected response shape:', JSON.stringify(response.json).slice(0, 500));
    return res.status(502).json({ success: false, error: 'AI returned unexpected response shape.' });
  }

  const toolUseBlock = content.find(function (b) { return b.type === 'tool_use' && b.name === 'record_checklist'; });
  if (!toolUseBlock || !toolUseBlock.input) {
    console.error('No tool_use block found. Content:', JSON.stringify(content).slice(0, 500));
    return res.status(502).json({
      success: false,
      error: 'AI did not call the extraction tool. Response: ' + JSON.stringify(content).slice(0, 200)
    });
  }

  const stopReason = response.json.stop_reason;
  if (stopReason === 'max_tokens') {
    return res.status(200).json({
      success: true,
      data: toolUseBlock.input,
      warning: 'Response hit token limit. Results may be incomplete. Try a shorter RFP.',
      truncated: truncated,
      modelUsed: response.modelId
    });
  }

  return res.status(200).json({
    success: true,
    data: toolUseBlock.input,
    truncated: truncated,
    modelUsed: response.modelId
  });
};
