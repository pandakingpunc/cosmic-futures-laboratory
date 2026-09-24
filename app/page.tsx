import Laboratory from '@/components/lab/laboratory';
import { LaboratoryErrorBoundary } from '@/components/lab/error-boundary';
export default function Home() {
  return (
    <LaboratoryErrorBoundary>
      <Laboratory />
    </LaboratoryErrorBoundary>
  );
}
