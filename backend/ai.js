const axios = require('axios');
const { withRetry, classifyError, parallelMap } = require('./utils/execution');

const { getLLMConfig } = require('./config/llm');

async function callModel(messages, opts = {}) {
  const cfg = await getLLMConfig();
  let baseUrl = cfg.baseUrl;
  const model = cfg.model;
  const maxTokens = typeof opts.maxTokens === 'number' ? Math.max(64, Math.min(4000, opts.maxTokens)) : 1000;
  const timeoutMs = typeof opts.timeoutMs === 'number' ? Math.max(2000, Math.min(60000, opts.timeoutMs)) : 30000;

  try {
    if (cfg.provider === 'deepseek' && !cfg.apiKey) {
      throw new Error('DeepSeek API key not configured');
    }
    const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
    const postChat = async (base) => {
      const resp = await axios.post(
        `${base}/chat/completions`,
        { model, messages, temperature: 0.1, max_tokens: maxTokens },
        { headers, timeout: timeoutMs }
      );
      return resp.data.choices[0].message.content.trim();
    };

    // Optional fallback to DeepSeek if local provider is unreachable
    async function postChatDeepseekFallback() {
      const key = process.env.DEEPSEEK_API_KEY || '';
      const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
      const mdl = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      if (!key) throw new Error('DeepSeek API key not configured');
      const resp = await axios.post(
        `${base}/chat/completions`,
        { model: mdl, messages, temperature: 0.1, max_tokens: maxTokens },
        { headers: { Authorization: `Bearer ${key}` }, timeout: timeoutMs }
      );
      return resp.data.choices[0].message.content.trim();
    }

    // Primary attempt with configured base
    try {
      return await withRetry(() => postChat(baseUrl), {
        retries: (opts.retries ?? 3),
        base: 400,
        factor: 2,
        shouldRetry: (err, info) => ['timeout', 'network', 'rate_limit', 'server_error'].includes(info.class),
      });
    } catch (primaryErr) {
      // If local provider inside Docker is pointing at 127.0.0.1, try host.docker.internal as fallback
      const pInfo = classifyError(primaryErr);
      const isLocal = (cfg.provider === 'local');
      const needsDockerFallback = isLocal && (/(^http:\/\/|^https:\/\/)(localhost|127\.0\.0\.1)/i.test(baseUrl));
      if (needsDockerFallback && ['timeout', 'network', 'server_error'].includes(pInfo.class)) {
        const altBase = baseUrl.replace(/:\/\/(localhost|127\.0\.0\.1)/i, '://host.docker.internal');
        if (altBase !== baseUrl) {
          try {
            return await withRetry(() => postChat(altBase), {
              retries: 2,
              base: 400,
              factor: 2,
              shouldRetry: (err, info) => ['timeout', 'network', 'rate_limit', 'server_error'].includes(info.class),
            });
          } catch (altErr) {
            // continue to next fallback
          }
        }
      }
      // If local provider failed (network/server issues), and DeepSeek is configured, try DeepSeek as a last resort
      if (isLocal && ['timeout', 'network', 'server_error'].includes(pInfo.class)) {
        try {
          const out = await withRetry(() => postChatDeepseekFallback(), {
            retries: 2,
            base: 400,
            factor: 2,
            shouldRetry: (err, info) => ['timeout', 'network', 'rate_limit', 'server_error'].includes(info.class),
          });
          console.warn('Local LLM unreachable; used DeepSeek fallback for this request.');
          return out;
        } catch (fallbackErr) {
          // fall through to throw original
        }
      }
      throw primaryErr;
    }
  } catch (err) {
    const info = classifyError(err);
    const baseForLog = (baseUrl || '').replace(/\?(.*)$/, '');
    console.error(`AI call failed [${info.class}] provider=${cfg.provider} base=${baseForLog}:`, err.message);
    throw new Error(`AI service unavailable: ${err.message}`);
  }
}

function extractIndicators(obj) {
  const text = JSON.stringify(obj);
  const ips = Array.from(new Set(text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || []));
  const hashes = Array.from(new Set(text.match(/\b[a-fA-F0-9]{32,64}\b/g) || []));
  return [...ips, ...hashes];
}

async function queryVirusTotal(indicator) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    console.warn('VirusTotal API key not configured');
    return null;
  }
  
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(indicator);
  const url = isIP
    ? `https://www.virustotal.com/api/v3/ip_addresses/${indicator}`
    : `https://www.virustotal.com/api/v3/files/${indicator}`;
  
  try {
    const doCall = async () => {
      const resp = await axios.get(url, { 
        headers: { 'x-apikey': apiKey },
        timeout: 10000
      });
      const data = resp.data.data;
      const stats = data?.attributes?.last_analysis_stats || {};
      return { indicator, malicious: stats.malicious || 0, data };
    };
    return await withRetry(doCall, {
      retries: 2,
      base: 300,
      factor: 2,
      shouldRetry: (err, info) => ['timeout', 'network', 'rate_limit', 'server_error'].includes(info.class),
    });
  } catch (err) {
    const info = classifyError(err);
    console.warn(`VirusTotal query failed for ${indicator} [${info.class}]:`, err.message);
    return null;
  }
}

async function analyzeAlert(alert) {
  const start = Date.now();
  let summary = 'Summary not available';
  let severity = 'low';
  let timeline = [];
  let evidence = [{ type: 'alert', content: alert }];

  try {
    const aiResp = await callModel([
      { 
        role: 'system', 
        content: 'You are a security analyst. Analyze security alerts and respond with valid JSON containing: summary (string), severity (low/medium/high), timeline (array of objects with step, time, action, evidence). Ensure valid JSON format.' 
      },
      { 
        role: 'user', 
        content: `Analyze this security alert: ${JSON.stringify(alert, null, 2)}` 
      }
    ]);

    if (aiResp) {
      // Attempt robust JSON extraction even if the model included prose
      const tryParse = (text) => {
        try {
          return JSON.parse(text);
        } catch { return null; }
      };
      let parsed = null;
      // 1) Prefer fenced code block ```json ... ```
      const fence = aiResp.match(/```json\s*([\s\S]*?)```/i) || aiResp.match(/```\s*([\s\S]*?)```/i);
      if (fence && fence[1]) {
        parsed = tryParse(fence[1].trim());
      }
      // 2) Try extracting first top-level JSON object by brace counting
      if (!parsed) {
        const s = String(aiResp);
        const startIdx = s.indexOf('{');
        if (startIdx >= 0) {
          let depth = 0; let endIdx = -1;
          for (let i = startIdx; i < s.length; i++) {
            const ch = s[i];
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
          }
          if (endIdx > startIdx) {
            const candidate = s.slice(startIdx, endIdx + 1);
            parsed = tryParse(candidate);
          }
        }
      }
      // 3) Fall back to naive cleanup (remove code fences) and parse
      if (!parsed) {
        const cleaned = aiResp.replace(/```json\n?|```/g, '').trim();
        parsed = tryParse(cleaned);
      }

      if (parsed && typeof parsed === 'object') {
        if (parsed.summary && typeof parsed.summary === 'string') {
          summary = String(parsed.summary).trim();
          if (summary.length > 600) summary = summary.slice(0, 600) + '…';
        }
        if (parsed.severity && typeof parsed.severity === 'string') severity = parsed.severity;
        if (Array.isArray(parsed.timeline) && parsed.timeline.length) {
          timeline = parsed.timeline.map(item => ({
            step: item.step || 'Unknown step',
            time: item.time || new Date().toISOString(),
            action: item.action || 'Unknown action',
            evidence: item.evidence || 'No evidence'
          }));
        }
      } else {
        // Do NOT return raw prompt/narrative. Build a compact summary from alert context
        const parts = [];
        const act = alert?.action || alert?.category || alert?.source || 'Alert';
        const user = alert?.principal?.user || alert?.principal?.email || null;
        const host = alert?.asset?.host || alert?.asset?.app || null;
        const ip = alert?.src?.ip || alert?.dst?.ip || null;
        const hashEnt = Array.isArray(alert?.entities) ? alert.entities.find(e => /sha/i.test(String(e.type||'')) || /^[a-f0-9]{32,64}$/i.test(String(e.value||''))) : null;
        parts.push(String(act));
        if (user) parts.push(`by ${user}`);
        if (host) parts.push(`@ ${host}`);
        const kv = [];
        if (ip) kv.push(`ip:${ip}`);
        if (hashEnt?.value) kv.push(`hash:${hashEnt.value}`);
        if (kv.length) parts.push(`[${kv.join(', ')}]`);
        summary = parts.join(' ');
        severity = String(alert?.severity || severity);
      }
    }
  } catch (error) {
    console.error('AI analysis failed:', error.message);
    summary = `Analysis failed: ${error.message}`;
  }

  if (timeline.length === 0) {
    timeline.push({ 
      step: 'Alert received', 
      time: new Date().toISOString(), 
      action: 'Record', 
      evidence: 'raw alert' 
    });
  }

  const vtFlag = (process.env.USE_VIRUSTOTAL || '').toLowerCase();
  const vtEnabled = (vtFlag === '1' || vtFlag === 'true' || vtFlag === 'yes');
  if (vtEnabled && process.env.VIRUSTOTAL_API_KEY) {
    try {
      const indicators = extractIndicators(alert).slice(0, 5);
      const results = await parallelMap(indicators, (ind) => queryVirusTotal(ind), { concurrency: 3 });
      for (const intel of results) {
        if (!intel) continue;
        timeline.push({
          step: 'Threat intel lookup',
          time: new Date().toISOString(),
          action: 'VirusTotal query',
          evidence: `${intel.indicator} - ${intel.malicious} malicious detection(s)`
        });
        evidence.push({ type: 'virustotal', indicator: intel.indicator, data: intel });
      }
    } catch (error) {
      console.error('Threat intelligence processing failed:', error.message);
    }
  }

  if (timeline.length < 2) {
    timeline.push({
      step: 'Analysis complete',
      time: new Date().toISOString(),
      action: 'Finalized',
      evidence: 'Basic analysis performed'
    });
  }

  const end = Date.now();
  return { summary, severity, timeline, evidence, analysisTime: end - start };
}

async function hunterQuery(question, logs = []) {
  const logText = logs.join('\n');
  
  try {
    const aiResp = await callModel([
      {
        role: 'system',
        content: 'You are a SOC threat hunter. Answer the investigation question using ONLY the provided logs/context. Return ONLY strict JSON of the form {"answer":"...","evidence":["..."]}. Rules: 1) No prose, no backticks, no extra fields. 2) Do not restate the question. 3) Be concise (<=2 sentences). 4) If insufficient information, set answer to "Insufficient evidence." and evidence to [].'
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nContext logs (may be empty):\n${logText.slice(0, 4000)}`
      }
    ], { timeoutMs: 8000, maxTokens: 300, retries: 1 });

    if (aiResp) {
      try {
        const cleanedResponse = aiResp.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleanedResponse);
        
        if (parsed.answer) {
          if (!Array.isArray(parsed.evidence) || !parsed.evidence.length) {
            parsed.evidence = logs.slice(0, 3); // Return first 3 logs as evidence if none provided
          }
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse threat hunter response as JSON:', e.message);
      }
      // Fallback: sanitize raw text to a concise answer
      let text = String(aiResp || '');
      try { text = text.replace(/```[\s\S]*?```/g, ' '); } catch {}
      text = text.replace(/\s+/g, ' ').trim();
      if (/^question\s*:/i.test(text)) text = text.replace(/^question\s*:/i, '').trim();
      const firstSentence = (text.match(/(.+?[.!?])\s+/) || [null, text])[1].trim();
      const answer = (firstSentence || text).slice(0, 280) || 'Insufficient evidence.';
      return { answer, evidence: logs.slice(0, 3) };
    }
  } catch (error) {
    console.error('Threat hunter query failed:', error.message);
  }
  
  return { 
    answer: `Unable to process query at this time. Original question: ${question}`,
    evidence: logs.slice(0, 3)
  };
}

module.exports = { analyzeAlert, hunterQuery, callModel };

/**
 * Map a unified alert to MITRE ATT&CK tactics/techniques using the AI model.
 * Returns an object like:
 * { tactics: [{ id, name, confidence }], techniques: [{ id, name, confidence }], confidence, rationale }
 */
async function mapMitre(unified) {
  try {
    const text = JSON.stringify(unified);
    const prompt = `You are a SOC analyst. Map the following alert to MITRE ATT&CK.
Return ONLY strict JSON with keys: tactics (array of {id,name,confidence}), techniques (array of {id,name,confidence}), confidence (0-1), rationale (string).
If uncertain, still provide best-guess with lower confidence. Alert JSON: ${text}`;
    const aiResp = await callModel([
      { role: 'system', content: 'You output only strict JSON. No prose.' },
      { role: 'user', content: prompt }
    ]);
    if (!aiResp) return null;
    try {
      const cleaned = aiResp.replace(/```json\n?|```/g, '').trim();
      const obj = JSON.parse(cleaned);
      obj.tactics = Array.isArray(obj.tactics) ? obj.tactics : [];
      obj.techniques = Array.isArray(obj.techniques) ? obj.techniques : [];
      return obj;
    } catch (e) {
      return null;
    }
  } catch (e) {
    return null;
  }
}

module.exports = Object.assign(module.exports || {}, { mapMitre });
