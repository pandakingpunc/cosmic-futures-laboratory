import { simulate } from '@/src/science/engine';
import { ensemble, sensitivity, sweep } from '@/src/science/analysis';
import { defaultConfig } from '@/src/science/defaults';
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
    if (
      body.mode !== undefined &&
      !['deterministic', 'ensemble', 'sensitivity', 'sweep'].includes(body.mode)
    )
      return Response.json(
        { error: 'Unknown analysis mode.' },
        { status: 400 },
      );
    const config = { ...defaultConfig(), ...body.config };
    const result =
      body.mode === 'ensemble'
        ? ensemble(config, body.options)
        : body.mode === 'sensitivity'
          ? sensitivity(config)
          : body.mode === 'sweep'
            ? sweep(config, body.options)
            : simulate(config);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Invalid simulation request.' },
      { status: 400 },
    );
  }
}
