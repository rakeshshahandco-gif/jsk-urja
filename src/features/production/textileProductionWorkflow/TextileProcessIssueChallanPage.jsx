import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import { getTextileProductionOrder } from '@/services/textileProductionWorkflowApi';
import { TextileJobWorkChallanFormPage } from '@/features/production/textileDyeingChallan/TextileDyeingChallanFormPage';
import { getChallanDetailPath } from '@/utils/textileJobWorkProcessConfig';
import { resolveStageProcessType, stageLabel } from '@/utils/textileProductionWorkflowHelpers';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

export default function TextileProcessIssueChallanPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [order, setOrder] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    useEffect(() => {
        if (!isTextile || !orderId) return setLoading(false);
        getTextileProductionOrder(orderId)
            .then((o) => {
                setOrder(o);
                const stage = o.stageStates?.[o.currentStageIndex];
                const processType = resolveStageProcessType(stage);
                if (o.status === 'In Progress' && stage?.activeChallanId && processType) {
                    navigate(`${getChallanDetailPath(processType, stage.activeChallanId)}?po=${orderId}`, { replace: true });
                }
            })
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load order'))
            .finally(() => setLoading(false));
    }, [isTextile, orderId, navigate]);

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;
    if (loading) return <BrandedLoader size={80} />;
    if (!order) return <div style={{ padding: 24 }}>Production order not found</div>;

    if (order.status !== 'In Progress') {
        return (
            <div style={{ padding: 24 }}>
                <p>Order is not in progress.</p>
                <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(orderId))}>Back to order</button>
            </div>
        );
    }

    const stage = order.stageStates?.[order.currentStageIndex];
    const processType = resolveStageProcessType(stage);
    if (!processType) {
        return (
            <div style={{ padding: 24 }}>
                <p>{stageLabel(stage)} does not support vendor material issue. Use Move To Next Stage on the production order.</p>
                <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(orderId))}>Back to order</button>
            </div>
        );
    }

    if (stage?.activeChallanId) return <BrandedLoader size={80} />;

    const itemId = order.itemId?._id || order.itemId;
    const outputItemId = order.outputItemId?._id || order.outputItemId || itemId;

    return (
        <TextileJobWorkChallanFormPage
            processType={processType}
            backPath={PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(orderId)}
            productionOrderContext={{
                orderId,
                orderNo: order.orderNo,
                stageName: stageLabel(stage),
                defaults: {
                    designNo: order.designNo,
                    itemId,
                    outputItemId,
                    colour: order.colour,
                    lotNo: order.lotNo,
                    thanNo: order.thanNo,
                    qtyUom: order.qtyUom,
                },
            }}
        />
    );
}
