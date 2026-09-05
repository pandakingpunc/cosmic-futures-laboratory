import observations from '@/data/observations/cosmology-constraints.json';
export function GET() {
  return Response.json(observations);
}
