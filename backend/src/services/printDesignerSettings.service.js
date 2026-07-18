import { CompanyProfile } from '../models/companyProfile.model.js';

/** Default OFF for all companies - custom designer layouts never apply unless explicitly enabled. */
export async function getCustomPrintDesignerEnabled(companyId) {
    if (!companyId) return false;
    const profile = await CompanyProfile.findOne({ companyId })
        .select('printSettings.enableCustomPrintDesigner')
        .lean();
    return profile?.printSettings?.enableCustomPrintDesigner === true;
}

export async function getPrintDesignerSettings(companyId) {
    const enableCustomPrintDesigner = await getCustomPrintDesignerEnabled(companyId);
    return { enableCustomPrintDesigner };
}

export async function updatePrintDesignerSettings(companyId, userId, payload = {}) {
    let profile = await CompanyProfile.findOne({ companyId });
    if (!profile) {
        profile = new CompanyProfile({
            companyId,
            companyName: 'Company',
        });
    }
    if (!profile.printSettings) {
        profile.printSettings = {};
    }
    profile.printSettings.enableCustomPrintDesigner = payload.enableCustomPrintDesigner === true;
    profile.updatedBy = userId;
    await profile.save();
    return {
        enableCustomPrintDesigner: profile.printSettings.enableCustomPrintDesigner === true,
    };
}
