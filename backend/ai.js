const axios = require('axios');

async function callModel(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DeepSeek API key not configured');
    throw new Error('AI service not configured');
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  try {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const resp = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages,
        temperature: 0.1,
        max_tokens: 1000,
      },
      {
        headers,
        timeout: 30000,
      }
    );
    return resp.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('DeepSeek API call failed:', err.message);
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
    const resp = await axios.get(url, { 
      headers: { 'x-apikey': apiKey },
      timeout: 10000
    });
    const data = resp.data.data;
    const stats = data?.attributes?.last_analysis_stats || {};
    return { indicator, malicious: stats.malicious || 0, data };
  } catch (err) {
    console.warn(`VirusTotal query failed for ${indicator}:`, err.message);
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
      try {
        // Clean up AI response to ensure valid JSON
        const cleanedResponse = aiResp.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleanedResponse);
        summary = parsed.summary || summary;
        severity = parsed.severity || severity;
        if (Array.isArray(parsed.timeline) && parsed.timeline.length) {
          timeline = parsed.timeline.map(item => ({
            step: item.step || 'Unknown step',
            time: item.time || new Date().toISOString(),
            action: item.action || 'Unknown action',
            evidence: item.evidence || 'No evidence'
          }));
        }
      } catch (e) {
        console.warn('Failed to parse AI response as JSON, using raw response:', e.message);
        summary = aiResp;
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
      const indicators = extractIndicators(alert);
      for (const ind of indicators.slice(0, 5)) { // Limit to 5 indicators to avoid rate limiting
        const intel = await queryVirusTotal(ind);
        if (intel) {
          timeline.push({
            step: 'Threat intel lookup',
            time: new Date().toISOString(),
            action: 'VirusTotal query',
            evidence: `${ind} - ${intel.malicious} malicious detection(s)`
          });
          evidence.push({ type: 'virustotal', indicator: ind, data: intel });
        }
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
        content: 'You are a SOC threat hunter. Analyze security questions using provided logs. Respond with valid JSON containing: answer (string), evidence (array of relevant log snippets or findings). Ensure valid JSON format.' 
      },
      { 
        role: 'user', 
        content: `Question: ${question}\n\nRelevant logs:\n${logText.slice(0, 4000)}` // Limit log size
      }
    ]);

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
      return { answer: aiResp, evidence: logs.slice(0, 3) };
    }
  } catch (error) {
    console.error('Threat hunter query failed:', error.message);
  }
  
  return { 
    answer: `Unable to process query at this time. Original question: ${question}`,
    evidence: logs.slice(0, 3)
  };
}

module.exports = { analyzeAlert, hunterQuery };

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
      const cleaned = aiResp.replace(/```json
?|```/g, '').trim();
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
