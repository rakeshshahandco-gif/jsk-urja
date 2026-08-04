import React from 'react';
import { Input } from '@/components/ui';
import { INDIAN_STATES } from '@/utils/constants';
import { CustomerDocumentActions } from './CustomerDocumentActions';
import { FIELD_DOCUMENT_LINKS } from '@/config/customerKyc.config';
import styles from './CustomerForm.module.scss';

const Field = ({ label, children, help }) => (
    <div className={styles['form-group']}>
        <label>{label}</label>
        {children}
        {help && <small className={styles['help-text']}>{help}</small>}
    </div>
);

function LinkedDoc({ customerId, fieldKey, documents, onRefresh, perms, companyId, financialYearId }) {
    const docType = FIELD_DOCUMENT_LINKS[fieldKey];
    if (!docType || !customerId) return null;
    return (
        <CustomerDocumentActions
            customerId={customerId}
            documentType={docType}
            documents={documents}
            {...perms}
            onRefresh={onRefresh}
            companyId={companyId}
            financialYearId={financialYearId}
        />
    );
}

export function CustomerGstTaxTab({
    register,
    errors,
    watch,
    setValue,
    isEnabled,
    fieldCtrl,
    handleUppercaseChange,
    customerId,
    documents,
    onDocRefresh,
    docPerms,
    companyId,
    financialYearId,
}) {
    const gstOn = fieldCtrl ? fieldCtrl.isVisible('gstNumber') : isEnabled('customer.gstNumber');
    const showTab = gstOn || fieldCtrl?.isVisible('panNumber') || fieldCtrl?.isVisible('tanNumber')
        || fieldCtrl?.isVisible('msmeNumber') || fieldCtrl?.isVisible('iecNumber')
        || isEnabled('customer.gstRegistrationType') || isEnabled('customer.gstState') || isEnabled('customer.placeOfSupply')
        || isEnabled('customer.cinNumber') || isEnabled('customer.tcsApplicable');

    if (!showTab) {
        return <p style={{ color: '#94a3b8', fontSize: 14 }}>GST & Tax fields are disabled in Customer Master Settings.</p>;
    }

    return (
        <div className={styles.grid4}>
            {gstOn && (
                <>
                    <Field label={`GST NO${fieldCtrl?.isRequired('gstNumber') ? ' *' : ''}`}>
                        <Input
                            {...register('gstNumber', {
                                pattern: {
                                    value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
                                    message: 'Invalid GST format',
                                },
                                required: fieldCtrl?.isRequired('gstNumber') ? 'GST No is required' : false,
                            })}
                            placeholder="22AAAAA0000A1Z5"
                            maxLength={15}
                            style={{ textTransform: 'uppercase', fontWeight: 700 }}
                            readOnly={fieldCtrl?.isReadOnly('gstNumber')}
                            disabled={fieldCtrl?.isReadOnly('gstNumber')}
                            onChange={(e) => setValue('gstNumber', e.target.value.replace(/\s/g, '').toUpperCase(), { shouldDirty: true })}
                        />
                        {errors.gstNumber && <span className={styles.error}>{errors.gstNumber.message}</span>}
                    </Field>
                    {customerId && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <LinkedDoc fieldKey="gstNumber" customerId={customerId} documents={documents} onRefresh={onDocRefresh} perms={docPerms} companyId={companyId} financialYearId={financialYearId} />
                        </div>
                    )}
                </>
            )}
            {isEnabled('customer.gstRegistrationType') && (
                <Field label="GST REGISTRATION TYPE">
                    <select {...register('gstRegistrationType')} className={styles['form-select']}>
                        <option value="">Select Type</option>
                        <option value="Registered">Registered</option>
                        <option value="Unregistered">Unregistered</option>
                        <option value="Composite">Composite</option>
                        <option value="Consumer">Consumer</option>
                        <option value="UIN">UIN Holder</option>
                        <option value="SEZ">SEZ (With/Without Pay)</option>
                        <option value="Export">Export</option>
                    </select>
                </Field>
            )}
            {isEnabled('customer.gstState') && (
                <Field label="GST STATE">
                    <select {...register('gstState')} className={styles['form-select']}>
                        <option value="">Select State</option>
                        {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </Field>
            )}
            {isEnabled('customer.placeOfSupply') && (
                <Field label="PLACE OF SUPPLY">
                    <Input {...register('defaultPlaceOfSupply')} placeholder="State code or name" onChange={handleUppercaseChange('defaultPlaceOfSupply')} />
                </Field>
            )}
            {gstOn && (
                <>
                    <Field label="GST REGISTRATION EFFECTIVE DATE" help="Used to decide if GSTIN can be applied to historical invoices">
                        <Input type="date" {...register('gstRegistrationEffectiveDate')} />
                    </Field>
                    <Field label="GST CANCELLATION DATE">
                        <Input type="date" {...register('gstCancellationDate')} />
                    </Field>
                    <Field label="GST STATUS">
                        <select {...register('gstStatus')} className={styles['form-select']}>
                            <option value="Unknown">Unknown</option>
                            <option value="Active">Active</option>
                            <option value="Suspended">Suspended</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </Field>
                    <Field label="GST VERIFICATION DATE">
                        <Input type="date" {...register('gstVerificationDate')} />
                    </Field>
                    <Field label="GST VERIFICATION SOURCE">
                        <Input {...register('gstVerificationSource')} placeholder="Portal / CA / Manual" />
                    </Field>
                </>
            )}
            {gstOn && (
                <>
                    <Field label="GST TYPE">
                        <select {...register('gstType')} className={styles['form-select']}>
                            <option value="">Select Type</option>
                            <option value="CGST / SGST">CGST / SGST</option>
                            <option value="IGST">IGST</option>
                        </select>
                    </Field>
                    <Field label="CUSTOMER ACTIVITY (GSTR-1)">
                        <select {...register('customerActivityType')} className={styles['form-select']}>
                            <option value="">Select Activity</option>
                            <option value="B2B">B2B</option>
                            <option value="B2C">B2C</option>
                        </select>
                    </Field>
                </>
            )}
            {(fieldCtrl ? fieldCtrl.isVisible('panNumber') : isEnabled('customer.panNumber')) && (
                <>
                    <Field label="PAN NO">
                        <Input {...register('panNumber')} placeholder="AAAAA0000A" maxLength={10} readOnly={fieldCtrl?.isReadOnly('panNumber')} disabled={fieldCtrl?.isReadOnly('panNumber')} onChange={handleUppercaseChange('panNumber')} />
                    </Field>
                    {customerId && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <LinkedDoc fieldKey="panNumber" customerId={customerId} documents={documents} onRefresh={onDocRefresh} perms={docPerms} companyId={companyId} financialYearId={financialYearId} />
                        </div>
                    )}
                </>
            )}
            {(fieldCtrl ? fieldCtrl.isVisible('tanNumber') : isEnabled('customer.tanNumber')) && (
                <>
                    <Field label="TAN NO">
                        <Input {...register('tanNumber')} placeholder="TAN number" onChange={handleUppercaseChange('tanNumber')} />
                    </Field>
                    {customerId && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <LinkedDoc fieldKey="tanNumber" customerId={customerId} documents={documents} onRefresh={onDocRefresh} perms={docPerms} companyId={companyId} financialYearId={financialYearId} />
                        </div>
                    )}
                </>
            )}
            {(fieldCtrl ? fieldCtrl.isVisible('msmeNumber') : isEnabled('customer.msmeNumber')) && (
                <>
                    <Field label="MSME / UDYAM NO">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <input type="checkbox" {...register('msmeApplicable')} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>MSME Registered</span>
                        </label>
                        {watch('msmeApplicable') && (
                            <>
                                <Input {...register('msmeRegNo')} placeholder="UDYAM-XX-00-0000000" onChange={(e) => setValue('msmeRegNo', e.target.value.toUpperCase())} />
                                <select {...register('msmeCategory')} className={styles['form-select']} style={{ marginTop: 8 }}>
                                    <option value="">Category</option>
                                    <option value="Micro">Micro</option>
                                    <option value="Small">Small</option>
                                    <option value="Medium">Medium</option>
                                </select>
                            </>
                        )}
                    </Field>
                    {customerId && watch('msmeApplicable') && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <LinkedDoc fieldKey="msmeRegNo" customerId={customerId} documents={documents} onRefresh={onDocRefresh} perms={docPerms} companyId={companyId} financialYearId={financialYearId} />
                        </div>
                    )}
                </>
            )}
            {(fieldCtrl ? fieldCtrl.isVisible('iecNumber') : isEnabled('customer.iecNumber')) && (
                <>
                    <Field label="IEC NUMBER">
                        <Input {...register('iecNumber')} onChange={handleUppercaseChange('iecNumber')} />
                    </Field>
                    {customerId && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <LinkedDoc fieldKey="iecNumber" customerId={customerId} documents={documents} onRefresh={onDocRefresh} perms={docPerms} companyId={companyId} financialYearId={financialYearId} />
                        </div>
                    )}
                </>
            )}
            {isEnabled('customer.cinNumber') && (
                <Field label="CIN NUMBER">
                    <Input {...register('cinNumber')} onChange={handleUppercaseChange('cinNumber')} />
                </Field>
            )}
            {isEnabled('customer.tcsApplicable') && (
                <>
                    <Field label="TCS APPLICABLE">
                        <select {...register('tcsApplicable')} className={styles['form-select']}>
                            <option value={false}>No</option>
                            <option value={true}>Yes</option>
                        </select>
                    </Field>
                    {(watch('tcsApplicable') === true || watch('tcsApplicable') === 'true') && (
                        <>
                            <Field label="TCS SECTION">
                                <Input {...register('tcsSection')} />
                            </Field>
                            {isEnabled('customer.tcsRate') && (
                                <Field label="TCS RATE (%)">
                                    <Input type="number" step="0.01" {...register('tcsRate', { valueAsNumber: true })} />
                                </Field>
                            )}
                            {isEnabled('customer.tcsThreshold') && (
                                <Field label="TCS THRESHOLD (₹)">
                                    <Input type="number" {...register('tcsThresholdLimit', { valueAsNumber: true })} />
                                </Field>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

export function CustomerBankingTab({ register, handleUppercaseChange, isEnabled, fieldCtrl, customerId, documents, onDocRefresh, docPerms, companyId, financialYearId }) {
    const showBank = fieldCtrl ? fieldCtrl.anyVisibleInGroup('banking') : isEnabled('customer.bankDetails');
    if (!showBank) {
        return <p style={{ color: '#94a3b8', fontSize: 14 }}>Banking fields are disabled in Customer Master Settings.</p>;
    }
    const show = (key) => (fieldCtrl ? fieldCtrl.isVisible(key) : true);
    return (
        <div className={styles.grid4}>
            {show('bankName') && <Field label="BANK NAME"><Input {...register('bankName')} readOnly={fieldCtrl?.isReadOnly('bankName')} disabled={fieldCtrl?.isReadOnly('bankName')} onChange={handleUppercaseChange('bankName')} /></Field>}
            {show('bankBranch') && <Field label="BRANCH"><Input {...register('bankBranch')} readOnly={fieldCtrl?.isReadOnly('bankBranch')} disabled={fieldCtrl?.isReadOnly('bankBranch')} onChange={handleUppercaseChange('bankBranch')} /></Field>}
            {show('bankAccountNumber') && <Field label="ACCOUNT NUMBER"><Input {...register('bankAccountNumber')} readOnly={fieldCtrl?.isReadOnly('bankAccountNumber')} disabled={fieldCtrl?.isReadOnly('bankAccountNumber')} /></Field>}
            {show('bankIfsc') && <Field label="IFSC CODE"><Input {...register('bankIfsc')} readOnly={fieldCtrl?.isReadOnly('bankIfsc')} disabled={fieldCtrl?.isReadOnly('bankIfsc')} onChange={handleUppercaseChange('bankIfsc')} /></Field>}
            <Field label="SWIFT CODE"><Input {...register('bankSwift')} onChange={handleUppercaseChange('bankSwift')} /></Field>
            {show('bankUpi') && <Field label="UPI ID"><Input {...register('bankUpi')} readOnly={fieldCtrl?.isReadOnly('bankUpi')} disabled={fieldCtrl?.isReadOnly('bankUpi')} /></Field>}
            {customerId && (
                <div style={{ gridColumn: '1 / -1' }}>
                    <LinkedDoc fieldKey="bankDetails" customerId={customerId} documents={documents} onRefresh={onDocRefresh} perms={docPerms} companyId={companyId} financialYearId={financialYearId} />
                </div>
            )}
        </div>
    );
}

export function CustomerExportTab({ register, watch, handleUppercaseChange, isEnabled, fieldCtrl }) {
    const showExport = fieldCtrl ? fieldCtrl.anyVisibleInGroup('export') : isEnabled('customer.exportDetails');
    if (!showExport) {
        return <p style={{ color: '#94a3b8', fontSize: 14 }}>Export fields are disabled in Customer Master Settings.</p>;
    }
    const show = (key) => (fieldCtrl ? fieldCtrl.isVisible(key) : true);
    return (
        <div className={styles.grid4}>
            <Field label="EXPORT CUSTOMER">
                <select {...register('isExportCustomer')} className={styles['form-select']}>
                    <option value={false}>No</option>
                    <option value={true}>Yes</option>
                </select>
            </Field>
            <Field label="COUNTRY"><Input {...register('exportCountry')} onChange={handleUppercaseChange('exportCountry')} /></Field>
            {show('exportBuyerCode') && <Field label="BUYER CODE"><Input {...register('exportBuyerCode')} readOnly={fieldCtrl?.isReadOnly('exportBuyerCode')} disabled={fieldCtrl?.isReadOnly('exportBuyerCode')} onChange={handleUppercaseChange('exportBuyerCode')} /></Field>}
            {show('exportPort') && <Field label="PORT"><Input {...register('exportPort')} readOnly={fieldCtrl?.isReadOnly('exportPort')} disabled={fieldCtrl?.isReadOnly('exportPort')} onChange={handleUppercaseChange('exportPort')} /></Field>}
            {show('exportCurrency') && <Field label="CURRENCY"><Input {...register('exportCurrency')} readOnly={fieldCtrl?.isReadOnly('exportCurrency')} disabled={fieldCtrl?.isReadOnly('exportCurrency')} onChange={handleUppercaseChange('exportCurrency')} /></Field>}
            {show('exportLcTerms') && <Field label="LC TERMS"><Input {...register('exportLcTerms')} readOnly={fieldCtrl?.isReadOnly('exportLcTerms')} disabled={fieldCtrl?.isReadOnly('exportLcTerms')} /></Field>}
            <Field label="PAYMENT TERMS"><Input {...register('exportPaymentTerms')} /></Field>
        </div>
    );
}
