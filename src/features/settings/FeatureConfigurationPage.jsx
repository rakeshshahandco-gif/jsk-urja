import { Navigate, useSearchParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

/** Legacy route — redirects into the unified Feature Configuration Engine. */
export default function FeatureConfigurationPage() {
    const [searchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'engine-module';
    return <Navigate to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=${encodeURIComponent(tab)}`} replace />;
}
