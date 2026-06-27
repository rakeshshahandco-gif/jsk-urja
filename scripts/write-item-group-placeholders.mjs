import fs from 'fs';

const content = `const TEXTILE_NAME_PLACEHOLDER =
    'e.g. Raw Fabric, Dyed Fabric, Printed Fabric, Dupatta, Kurti, Suit Set, Accessories, Packing Material…';

const ELECTRONICS_NAME_PLACEHOLDER =
    'e.g. Drivers, LED Chips, Controllers, PCB, Components…';

export function resolveCompanyIndustryTemplateCode(company) {
    const code = String(company?.industryTemplateRef?.templateCode || '').toUpperCase();
    if (code) return code;

    const name = \`\${company?.companyName || ''} \${company?.brandName || ''} \${company?.legalName || ''}\`.toUpperCase();
    if (/TEXTILE|HANDLOOM/.test(name)) return 'TEXTILE';
    if (name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'))) return 'ELECTRONICS_JSK';
    return '';
}

export function isTextileIndustryCompany(company) {
    const code = resolveCompanyIndustryTemplateCode(company);
    if (code === 'TEXTILE') return true;
    const name = \`\${company?.companyName || ''} \${company?.brandName || ''}\`.toLowerCase();
    return /textile|handloom/.test(name);
}

export function getItemGroupNamePlaceholder(company) {
    return isTextileIndustryCompany(company)
        ? TEXTILE_NAME_PLACEHOLDER
        : ELECTRONICS_NAME_PLACEHOLDER;
}

export function getItemGroupCodePlaceholder(company) {
    return isTextileIndustryCompany(company) ? 'RAW_FABRIC' : 'DRIVERS';
}
`;

fs.writeFileSync('src/constants/itemGroupPlaceholders.js', content, 'utf8');
console.log('Written itemGroupPlaceholders.js');
