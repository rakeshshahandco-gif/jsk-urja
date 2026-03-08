import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { Plus, Trash2, Star } from 'lucide-react';
import { INDIAN_STATES } from '@/utils/constants';
import { getCustomerTypes } from '@/services/customerApi';
import { getStickers } from '@/services/stickerApi';
import { AddStickerModal } from './AddStickerModal';
import { MultiSelect } from '@/components/ui';
import styles from './CustomerForm.module.scss';

/**
 * CustomerForm component for creating and editing customers
 * @param {Object} props
 * @param {Object} props.customer - Existing customer data (for edit mode)
 * @param {Function} props.onSubmit - Form submission handler
 * @param {Function} props.onCancel - Cancel handler
 * @param {boolean} props.isSubmitting - Loading state
 */
export const CustomerForm = ({ customer, onSubmit, onCancel, isSubmitting = false }) => {
    const [isCustomType, setIsCustomType] = useState(false);
    const [dynamicCustomerTypes, setDynamicCustomerTypes] = useState([
        { value: '', label: '-- Select Type --' },
        { value: 'led_light_manufacturer', label: 'LED Light Manufacturer' },
        { value: 'led_light_showroom', label: 'LED Light Showroom' },
        { value: 'home_automation_provider', label: 'Home Automation' },
        { value: 'interior_designer', label: 'Interior Designer' },
        { value: 'builders', label: 'Builders' },
        { value: 'dealer', label: 'Dealer' },
        { value: 'distributor', label: 'Distributor' }
    ]);
    const [dynamicStickers, setDynamicStickers] = useState([]);
    const [showAddSticker, setShowAddSticker] = useState(false);
    // Normalize customer data for form display
    const normalizeCustomerData = (customerData) => {
        console.log('🔄 Normalizing customer data:', customerData);

        if (!customerData) {
            console.log('⚠️ No customer data provided, using defaults');
            return {
                customerName: '',
                company: '',
                companyBrand: '',
                companyEmail: '',
                customerType: '',
                stickers: [],
                city: '',
                district: '',
                taluka: '',
                state: '',
                country: 'India',
                address: '',
                pincode: '',
                status: 'lead',
                notes: '',
                tags: [],
                gstNumber: '',
                gstType: '',
                contactPersons: [
                    {
                        name: '',
                        mobile: '',
                        mobile2: '',
                        mobile3: '',
                        mobile4: '',
                        mobile5: '',
                        email: '',
                        isPrimary: true,
                    }
                ],
                creditPeriod: 0,
                paymentType: 'Credit',
            };

        }

        const normalized = {
            customerName: customerData.customerName || customerData.name || '',
            company: customerData.company || '',
            companyBrand: customerData.companyBrand || '',
            companyEmail: customerData.companyEmail || '',
            customerType: customerData.customerType || '',
            stickers: Array.isArray(customerData.stickers) ? customerData.stickers.map(s => s._id || s) : [],
            city: customerData.area || customerData.city || '',
            district: customerData.district || '',
            taluka: customerData.taluka || '',
            state: (() => {
                if (!customerData.state) return '';
                const stateStr = String(customerData.state).trim();
                const matchedState = INDIAN_STATES.find(
                    s => s.toLowerCase() === stateStr.toLowerCase()
                );
                return matchedState || stateStr;
            })(),
            address: customerData.address || '',
            pincode: customerData.pincode || '',
            country: customerData.country || 'India',
            status: customerData.status || customerData.customerStatus || 'lead',
            notes: customerData.notes || '',
            tags: Array.isArray(customerData.tags) ? customerData.tags.join(', ') : '',
            gstNumber: customerData.gstNumber || '',
            gstType: customerData.gstType || '',
            customerCode: customerData.customerCode || '',
            contactPersons: Array.isArray(customerData.contactPersons) && customerData.contactPersons.length > 0
                ? customerData.contactPersons.map(contact => ({
                    name: contact.name || '',
                    mobile: contact.mobile || '',
                    mobile2: contact.mobile2 || '',
                    mobile3: contact.mobile3 || '',
                    mobile4: contact.mobile4 || '',
                    mobile5: contact.mobile5 || '',
                    email: contact.email || '',
                    isPrimary: contact.isPrimary || false,
                }))
                : [{
                    name: '',
                    mobile: '',
                    mobile2: '',
                    mobile3: '',
                    mobile4: '',
                    mobile5: '',
                    email: '',
                    isPrimary: true,
                }],
            creditPeriod: customerData.creditPeriod || 0,
            paymentType: customerData.paymentType || 'Credit',
        };


        console.log('✅ Normalized data:', normalized);
        return normalized;
    };

    const { register, control, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm({
        defaultValues: normalizeCustomerData(customer),
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'contactPersons',
    });

    // Reset form when customer prop changes (to prevent cache)
    useEffect(() => {
        const normalized = normalizeCustomerData(customer);
        reset(normalized);
        const defaultTypes = ['', 'led_light_manufacturer', 'led_light_showroom', 'home_automation_provider', 'interior_designer', 'builders', 'dealer', 'distributor'];
        if (normalized.customerType && !defaultTypes.includes(normalized.customerType)) {
            setIsCustomType(true);
        } else {
            setIsCustomType(false);
        }
    }, [customer, reset]);

    const stateValue = watch('state');

    // Automate GST Type based on state
    useEffect(() => {
        if (!stateValue) {
            setValue('gstType', '');
            return;
        }
        if (stateValue.toLowerCase() === 'maharashtra') {
            setValue('gstType', 'CGST / SGST');
        } else {
            setValue('gstType', 'IGST');
        }
    }, [stateValue, setValue]);

    // Fetch dynamic customer types
    useEffect(() => {
        const fetchTypes = async () => {
            try {
                const types = await getCustomerTypes();
                if (types && types.length > 0) {
                    const defaultValues = ['led_light_manufacturer', 'led_light_showroom', 'home_automation_provider', 'interior_designer', 'builders', 'dealer', 'distributor'];
                    const newTypes = types
                        .filter(t => t && !defaultValues.includes(t)) // filter out empty and defaults
                        .map(t => ({ value: t, label: t }));

                    if (newTypes.length > 0) {
                        setDynamicCustomerTypes(prev => {
                            // avoid duplicates on hot reload or multiple renders
                            const existingValues = new Set(prev.map(p => p.value));
                            const uniqueNewTypes = newTypes.filter(nt => !existingValues.has(nt.value));
                            return [...prev, ...uniqueNewTypes];
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to load dynamic customer types:', error);
            }
        };
        fetchTypes();
    }, []);

    // Fetch dynamic stickers
    useEffect(() => {
        const fetchStickers = async () => {
            try {
                const stickers = await getStickers();
                if (stickers && stickers.length > 0) {
                    setDynamicStickers(stickers.map(s => ({ value: s._id, label: s.name })));
                }
            } catch (error) {
                console.error('Failed to load dynamic stickers:', error);
            }
        };
        fetchStickers();
    }, []);

    // Helper function to convert input to uppercase
    const handleUppercaseChange = (fieldName) => (e) => {
        const upperValue = e.target.value.toUpperCase();
        setValue(fieldName, upperValue);
    };

    const contactPersons = watch('contactPersons');

    const handleAddContact = () => {
        append({
            name: '',
            mobile: '',
            mobile2: '',
            mobile3: '',
            mobile4: '',
            mobile5: '',
            email: '',
            isPrimary: false,
        });
    };

    const handleSetPrimary = (index) => {
        contactPersons.forEach((_, idx) => {
            setValue(`contactPersons.${idx}.isPrimary`, idx === index);
        });
    };

    const handleRemoveContact = (index) => {
        if (fields.length > 1) {
            const wasPrimary = contactPersons[index].isPrimary;
            remove(index);

            // If removed contact was primary, set first contact as primary
            if (wasPrimary && fields.length > 1) {
                setValue('contactPersons.0.isPrimary', true);
            }
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className={styles['customer-form']}>
                {/* Basic Information */}
                <div className={styles['form-section']}>
                    <h3>Basic Information</h3>

                    <div className={styles.grid4}>
                        {customer?.customerCode && (
                            <div className={styles['form-group']}>
                                <label>CUSTOMER CODE</label>
                                <Input
                                    value={customer.customerCode}
                                    readOnly
                                    className={styles['read-only-input']}
                                    style={{ fontWeight: 'bold', backgroundColor: '#f3f4f6' }}
                                />
                            </div>
                        )}
                        <div className={styles['form-group']}>
                            <label htmlFor="customerName">CUSTOMER NAME (OPTIONAL)</label>
                            <Input
                                id="customerName"
                                {...register('customerName')}
                                placeholder="Enter customer name (optional)"
                                onChange={handleUppercaseChange('customerName')}
                            />
                            {errors.customerName && <span className={styles.error}>{errors.customerName.message}</span>}
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="company">COMPANY</label>
                            <Input
                                id="company"
                                {...register('company')}
                                placeholder="Company name"
                                onChange={handleUppercaseChange('company')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="companyEmail">COMPANY EMAIL</label>
                            <Input
                                id="companyEmail"
                                type="email"
                                {...register('companyEmail')}
                                placeholder="company@example.com"
                                style={{ textTransform: 'uppercase' }}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="companyBrand">COMPANY BRAND (OPTIONAL)</label>
                            <Input
                                id="companyBrand"
                                {...register('companyBrand')}
                                placeholder="Enter brand name"
                                onChange={handleUppercaseChange('companyBrand')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="stickers">STICKERS / LABELS</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <MultiSelect
                                        name="stickers"
                                        control={control}
                                        options={dynamicStickers}
                                        placeholder="Assign labels..."
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowAddSticker(true)}
                                    title="Add New Sticker Master"
                                    style={{ height: '42px', padding: '0 12px' }}
                                >
                                    <Plus size={18} />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className={`${styles['form-group']} ${styles.colSpan3}`}>
                        <label htmlFor="address">ADDRESS</label>
                        <textarea
                            id="address"
                            {...register('address')}
                            placeholder="Enter complete address..."
                            rows={3}
                            className={styles['form-textarea']}
                            onChange={handleUppercaseChange('address')}
                        />
                    </div>
                    <div className={styles.grid4}>


                        <div className={styles['form-group']}>
                            <label htmlFor="city">CITY</label>
                            <Input
                                id="city"
                                {...register('city')}
                                placeholder="Enter city"
                                onChange={handleUppercaseChange('city')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="district">DISTRICT</label>
                            <Input
                                id="district"
                                {...register('district')}
                                placeholder="Enter district"
                                onChange={handleUppercaseChange('district')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="taluka">TALUKA / TEHSIL</label>
                            <Input
                                id="taluka"
                                {...register('taluka')}
                                placeholder="Enter taluka or tehsil"
                                onChange={handleUppercaseChange('taluka')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="pincode">PINCODE</label>
                            <Input
                                id="pincode"
                                {...register('pincode')}
                                placeholder="Enter pincode"
                                onChange={handleUppercaseChange('pincode')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="state">STATE</label>
                            <select
                                id="state"
                                {...register('state')}
                                className={styles['form-select']}
                            >
                                <option value="">Select State</option>
                                {INDIAN_STATES.map(state => (
                                    <option key={state} value={state}>{state}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="country">COUNTRY</label>
                            <Input
                                id="country"
                                {...register('country')}
                                placeholder="India"
                                onChange={handleUppercaseChange('country')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="status">STATUS</label>
                            <select
                                id="status"
                                {...register('status')}
                                className={styles['form-select']}
                            >
                                <option value="lead">Lead</option>
                                <option value="running_high">Running High</option>
                                <option value="running_low">Running Low</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Contact Persons */}
                <div className={styles['form-section']}>
                    <div className={styles['section-header']}>
                        <h3>Contact Persons</h3>
                        <Button type="button" onClick={handleAddContact} size="sm" variant="outline">
                            <Plus size={16} /> Add Contact
                        </Button>
                    </div>

                    {fields.map((field, index) => (
                        <div key={field.id} className={styles['contact-person-card']}>
                            <div className={styles['card-header']}>
                                <span className={styles['contact-number']}>Contact {index + 1}</span>
                                <div className={styles['card-actions']}>
                                    <button
                                        type="button"
                                        onClick={() => handleSetPrimary(index)}
                                        className={`${styles['primary-btn']} ${contactPersons[index]?.isPrimary ? styles.active : ''} `}
                                        title="Set as primary contact"
                                    >
                                        <Star size={16} fill={contactPersons[index]?.isPrimary ? 'currentColor' : 'none'} />
                                        {contactPersons[index]?.isPrimary && <span>Primary</span>}
                                    </button>
                                    {fields.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveContact(index)}
                                            className={styles['remove-btn']}
                                            title="Remove contact"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles['form-group']}>
                                <label htmlFor={`contact-name-${index}`}>CONTACT NAME (OPTIONAL)</label>
                                <Input
                                    id={`contact-name-${index}`}
                                    {...register(`contactPersons.${index}.name`)}
                                    placeholder="Enter contact person name"
                                    onChange={handleUppercaseChange(`contactPersons.${index}.name`)}
                                />
                                {errors.contactPersons?.[index]?.name && (
                                    <span className={styles.error}>{errors.contactPersons[index].name.message}</span>
                                )}
                            </div>

                            <div className={styles['form-row']}>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile-${index}`}>MOBILE 1 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile-${index}`}
                                        {...register(`contactPersons.${index}.mobile`)}
                                        placeholder="Mobile 1"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                    {errors.contactPersons?.[index]?.mobile && (
                                        <span className={styles.error}>{errors.contactPersons[index].mobile.message}</span>
                                    )}
                                </div>

                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile2-${index}`}>MOBILE 2 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile2-${index}`}
                                        {...register(`contactPersons.${index}.mobile2`)}
                                        placeholder="Mobile 2"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                    {errors.contactPersons?.[index]?.mobile2 && (
                                        <span className={styles.error}>{errors.contactPersons[index].mobile2.message}</span>
                                    )}
                                </div>
                            </div>

                            <div className={styles['form-row']}>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile3-${index}`}>MOBILE 3 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile3-${index}`}
                                        {...register(`contactPersons.${index}.mobile3`)}
                                        placeholder="Mobile 3"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>

                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile4-${index}`}>MOBILE 4 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile4-${index}`}
                                        {...register(`contactPersons.${index}.mobile4`)}
                                        placeholder="Mobile 4"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                            </div>

                            <div className={styles['form-row']}>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile5-${index}`}>MOBILE 5 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile5-${index}`}
                                        {...register(`contactPersons.${index}.mobile5`)}
                                        placeholder="Mobile 5"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-email-${index}`}>EMAIL</label>
                                    <Input
                                        id={`contact-email-${index}`}
                                        type="email"
                                        {...register(`contactPersons.${index}.email`)}
                                        placeholder="contact@example.com"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                    }
                </div>

                {/* Business Details */}
                <div className={styles['form-section']}>
                    <h3>Business Details</h3>

                    {/* Customer Type */}
                    <div className={styles.grid4}>
                        {/* Customer Type */}
                        <div className={styles['form-group']}>
                            <label htmlFor="customerType">TYPE</label>
                            {!isCustomType ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select
                                        id="customerType"
                                        {...register('customerType')}
                                        className={styles['form-select']}
                                        style={{ flex: 1 }}
                                    >
                                        {dynamicCustomerTypes.map((type, index) => (
                                            <option key={`${type.value}-${index}`} value={type.value}>{type.label}</option>
                                        ))}
                                    </select>
                                    <Button type="button" variant="outline" onClick={() => { setIsCustomType(true); setValue('customerType', ''); }} title="Add Custom Type" style={{ padding: '0 12px' }}>
                                        <Plus size={18} />
                                    </Button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Input
                                        id="customerType"
                                        {...register('customerType')}
                                        placeholder="Enter custom type"
                                        style={{ flex: 1 }}
                                        onChange={(e) => {
                                            const val = e.target.value.toUpperCase();
                                            setValue('customerType', val, { shouldValidate: true, shouldDirty: true });
                                        }}
                                    />
                                    <Button type="button" variant="outline" onClick={() => { setIsCustomType(false); setValue('customerType', ''); }} title="Select from list" style={{ padding: '0 12px' }}>
                                        List
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* GST Details */}
                        <div className={styles['form-group']}>
                            <label htmlFor="gstNumber">GST NUMBER</label>
                            <Input
                                id="gstNumber"
                                {...register('gstNumber', {
                                    pattern: {
                                        value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
                                        message: 'Invalid GST format'
                                    }
                                })}
                                placeholder="22AAAAA0000A1Z5"
                                maxLength={15}
                                onInput={(e) => {
                                    // Just visual upper casing at DOM level to not affect React Hook Form
                                    const start = e.target.selectionStart;
                                    const end = e.target.selectionEnd;
                                    e.target.value = e.target.value.toUpperCase();
                                    e.target.setSelectionRange(start, end);
                                }}
                                style={{ textTransform: 'uppercase' }}
                            />
                            {errors.gstNumber && <span className={styles.error}>{errors.gstNumber.message}</span>}
                            <small className={styles['help-text']}>15 characters GST number</small>
                        </div>

                        {/* GST Type */}
                        <div className={styles['form-group']}>
                            <label htmlFor="gstType">GST TYPE</label>
                            <select
                                id="gstType"
                                {...register('gstType')}
                                className={styles['form-select']}
                            >
                                <option value="">Select Type</option>
                                <option value="CGST / SGST">CGST / SGST</option>
                                <option value="IGST">IGST</option>
                            </select>
                        </div>

                        {/* Credit Period */}
                        <div className={styles['form-group']}>
                            <label htmlFor="creditPeriod">CREDIT PERIOD (DAYS)</label>
                            <Input
                                id="creditPeriod"
                                type="number"
                                {...register('creditPeriod', { valueAsNumber: true })}
                                placeholder="0"
                                min="0"
                            />
                        </div>

                        {/* Payment Type */}
                        <div className={styles['form-group']}>
                            <label htmlFor="paymentType">PAYMENT TYPE</label>
                            <select
                                id="paymentType"
                                {...register('paymentType')}
                                className={styles['form-select']}
                            >
                                <option value="Credit">Credit</option>
                                <option value="Cash">Cash</option>
                            </select>
                        </div>
                    </div>


                </div>

                {/* Additional Information */}
                <div className={styles['form-section']}>
                    <h3>Additional Information</h3>

                    <div className={styles['form-group']}>
                        <label htmlFor="notes">NOTES</label>
                        <textarea
                            id="notes"
                            {...register('notes')}
                            placeholder="Add any additional notes..."
                            rows={4}
                            className={styles['form-textarea']}
                            onChange={handleUppercaseChange('notes')}
                        />
                    </div>

                    <div className={styles['form-group']}>
                        <label htmlFor="tags">TAGS (COMMA SEPARATED)</label>
                        <Input
                            id="tags"
                            {...register('tags')}
                            placeholder="e.g. vip, premium, wholesale"
                            onChange={handleUppercaseChange('tags')}
                        />
                        <small className={styles['help-text']}>Separate tags with commas</small>
                    </div>
                </div>

                {/* Form Actions */}
                <div className={styles['form-actions']}>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                        CANCEL
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'SAVING...' : customer ? 'UPDATE CUSTOMER' : 'CREATE CUSTOMER'}
                    </Button>
                </div>
            </form >
            <AddStickerModal
                isOpen={showAddSticker}
                onClose={() => setShowAddSticker(false)}
                onSave={(newSticker) => {
                    setDynamicStickers(prev => [...prev, { value: newSticker._id, label: newSticker.name }]);
                    const current = watch('stickers') || [];
                    setValue('stickers', [...current, newSticker._id], { shouldDirty: true });
                }}
            />
        </>
    );
};
