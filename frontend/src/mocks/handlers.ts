import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/kpi', () => {
    return HttpResponse.json({ mtta: 5.4, mtti: 12.1, mttr: 38.7, backlog: 124, fpr: 0.07, throughput: 10.2 });
  }),
  http.post('/api/login', async ({ request }) => {
    const body = await request.json();
    if (!body.username || !body.password) return HttpResponse.json({ error: 'invalid' }, { status: 400 });
    return HttpResponse.json({ token: 'mock-token', traceId: crypto.randomUUID() });
  })
];

