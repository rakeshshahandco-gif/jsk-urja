import { useParams } from 'react-router-dom';
import { TextileJobWorkChallanDetailPage } from '@/features/production/textileDyeingChallan/TextileDyeingChallanDetailPage';

export default function TextileProcessChallanDetailPage() {
    const { processType } = useParams();
    return <TextileJobWorkChallanDetailPage processType={processType} />;
}
