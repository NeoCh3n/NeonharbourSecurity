const axios = require('axios');

async function callModel(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { model: 'openai/gpt-4o-mini', messages },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return resp.data.choices[0].message.content.trim();
  } catch (err) {
    return null;
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
  if (!apiKey) return null;
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(indicator);
  const url = isIP
    ? `https://www.virustotal.com/api/v3/ip_addresses/${indicator}`
    : `https://www.virustotal.com/api/v3/files/${indicator}`;
  try {
    const resp = await axios.get(url, { headers: { 'x-apikey': apiKey } });
    const data = resp.data.data;
    const stats = data?.attributes?.last_analysis_stats || {};
    return { indicator, malicious: stats.malicious || 0, data };
  } catch (err) {
    return null;
  }
}

async function analyzeAlert(alert) {
  const start = Date.now();
  let summary = 'Summary not available';
  let severity = 'low';
  let timeline = [];
  let evidence = [{ type: 'alert', content: alert }];

  const aiResp = await callModel([
    { role: 'system', content: 'You analyze security alerts and respond in JSON with keys summary, severity, and timeline (array of steps with step,time,action,evidence).' },
    { role: 'user', content: JSON.stringify(alert) }
  ]);

  if (aiResp) {
    try {
      const parsed = JSON.parse(aiResp);
      summary = parsed.summary || summary;
      severity = parsed.severity || severity;
      if (Array.isArray(parsed.timeline) && parsed.timeline.length) {
        timeline = parsed.timeline;
      }
    } catch (e) {
      summary = aiResp;
    }
  }

  if (timeline.length === 0) {
    timeline.push({ step: 'Alert received', time: new Date().toISOString(), action: 'Record', evidence: 'raw alert' });
  }

  const indicators = extractIndicators(alert);
  for (const ind of indicators) {
    const intel = await queryVirusTotal(ind);
    if (intel) {
      timeline.push({
        step: 'Threat intel lookup',
        time: new Date().toISOString(),
        action: 'VirusTotal query',
        evidence: `${ind} malicious:${intel.malicious}`
      });
      evidence.push({ type: 'virustotal', indicator: ind, data: intel });
    }
  }

  if (timeline.length < 2) {
    timeline.push({
      step: 'Analysis complete',
      time: new Date().toISOString(),
      action: 'Finalized',
      evidence: 'No additional indicators'
    });
  }

  const end = Date.now();
  return { summary, severity, timeline, evidence, analysisTime: end - start };
}

async function hunterQuery(question, logs = []) {
  const logText = logs.join('\n');
  const aiResp = await callModel([
    { role: 'system', content: 'You are a SOC threat hunter. Use provided logs as evidence. Respond in JSON with keys answer and evidence (array of log snippets).' },
    { role: 'user', content: `Question: ${question}\nLogs:\n${logText}` }
  ]);

  if (aiResp) {
    try {
      const parsed = JSON.parse(aiResp);
      if (parsed.answer) {
        if (!Array.isArray(parsed.evidence) || !parsed.evidence.length) {
          parsed.evidence = logs[0] ? [logs[0]] : [];
        }
        return parsed;
      }
    } catch (e) {
      // ignore parse error
    }
    return { answer: aiResp, evidence: logs[0] ? [logs[0]] : [] };
  }
  return { answer: `No AI available. Placeholder answer for: ${question}`, evidence: logs[0] ? [logs[0]] : [] };
}

module.exports = { analyzeAlert, hunterQuery };
