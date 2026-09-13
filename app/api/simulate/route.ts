import { isAnalysisMode, runAnalysis } from '@/src/science/dispatch';
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 1_000_000)
      return Response.json({ error: 'Request exceeds 1 MB.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 1_000_000)
      return Response.json({ error: 'Request exceeds 1 MB.' }, { status: 413 });
    const body = JSON.parse(raw);
    if (
      !body.config ||
      typeof body.config !== 'object' ||
      Array.isArray(body.config)
    )
      return Response.json(
        { error: 'A configuration object is required.' },
        { status: 400 },
      );
    const mode = body.mode ?? 'deterministic';
    if (!isAnalysisMode(mode))
      return Response.json(
        { error: 'Unknown analysis mode.' },
        { status: 400 },
      );
    if (
      (mode === 'ensemble' || mode === 'sweep') &&
      (!body.options || typeof body.options !== 'object')
    )
      return Response.json(
        { error: `Analysis mode "${mode}" requires an options object.` },
        { status: 400 },
      );
    const result = runAnalysis(mode, body.config, body.options);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Invalid simulation request.' },
      { status: 400 },
    );
  }
}
