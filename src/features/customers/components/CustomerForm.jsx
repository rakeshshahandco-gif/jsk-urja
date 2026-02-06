import React, { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { Plus, Trash2, Star } from 'lucide-react';
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
                area: '',
                state: '',
                address: '',
                pincode: '',
                status: 'lead',
                notes: '',
                tags: [],
                gstNumber: '',
                interestedProducts: [],
                productNotes: '',
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
            };
        }

        const normalized = {
            customerName: customerData.customerName || customerData.name || '',
            company: customerData.company || '',
            companyBrand: customerData.companyBrand || '',
            companyEmail: customerData.companyEmail || '',
            customerType: customerData.customerType || '',
            area: customerData.area || '',
            state: customerData.state || '',
            address: customerData.address || '',
            pincode: customerData.pincode || '',
            status: customerData.status || 'lead',
            notes: customerData.notes || '',
            tags: Array.isArray(customerData.tags) ? customerData.tags.join(', ') : '',
            gstNumber: customerData.gstNumber || '',
            interestedProducts: Array.isArray(customerData.interestedProducts) ? customerData.interestedProducts : [],
            productNotes: customerData.productNotes || '',
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
        reset(normalizeCustomerData(customer));
    }, [customer, reset]);

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
        <form onSubmit={handleSubmit(onSubmit)} className={styles['customer-form']}>
            {/* Basic Information */}
            <div className={styles['form-section']}>
                <h3>Basic Information</h3>

                <div className={styles.grid4}>
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
                        <label htmlFor="area">AREA</label>
                        <Input
                            id="area"
                            {...register('area')}
                            placeholder="Enter area/locality"
                            onChange={handleUppercaseChange('area')}
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
                            <option value="Andhra Pradesh">Andhra Pradesh</option>
                            <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                            <option value="Assam">Assam</option>
                            <option value="Bihar">Bihar</option>
                            <option value="Chhattisgarh">Chhattisgarh</option>
                            <option value="Goa">Goa</option>
                            <option value="Gujarat">Gujarat</option>
                            <option value="Haryana">Haryana</option>
                            <option value="Himachal Pradesh">Himachal Pradesh</option>
                            <option value="Jharkhand">Jharkhand</option>
                            <option value="Karnataka">Karnataka</option>
                            <option value="Kerala">Kerala</option>
                            <option value="Madhya Pradesh">Madhya Pradesh</option>
                            <option value="Maharashtra">Maharashtra</option>
                            <option value="Manipur">Manipur</option>
                            <option value="Meghalaya">Meghalaya</option>
                            <option value="Mizoram">Mizoram</option>
                            <option value="Nagaland">Nagaland</option>
                            <option value="Odisha">Odisha</option>
                            <option value="Punjab">Punjab</option>
                            <option value="Rajasthan">Rajasthan</option>
                            <option value="Sikkim">Sikkim</option>
                            <option value="Tamil Nadu">Tamil Nadu</option>
                            <option value="Telangana">Telangana</option>
                            <option value="Tripura">Tripura</option>
                            <option value="Uttar Pradesh">Uttar Pradesh</option>
                            <option value="Uttarakhand">Uttarakhand</option>
                            <option value="West Bengal">West Bengal</option>
                            <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                            <option value="Chandigarh">Chandigarh</option>
                            <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                            <option value="Delhi">Delhi</option>
                            <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                            <option value="Ladakh">Ladakh</option>
                            <option value="Lakshadweep">Lakshadweep</option>
                            <option value="Puducherry">Puducherry</option>
                        </select>
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
                        <select
                            id="customerType"
                            {...register('customerType')}
                            className={styles['form-select']}
                        >
                            <option value="">Select Type</option>
                            <option value="led_light_manufacturer">LED Light Manufacturer</option>
                            <option value="led_light_showroom">LED Light Show Room</option>
                            <option value="home_automation_provider">Home Automation Provider</option>
                            <option value="interior_designer">Interior Designer</option>
                            <option value="builders">Builders</option>
                            <option value="dealer">Dealer</option>
                            <option value="distributor">Distributor</option>
                        </select>
                    </div>

                    {/* GST Details */}
                    <div className={styles['form-group']}>
                        <label htmlFor="gstNumber">GST NUMBER</label>
                        <Input
                            id="gstNumber"
                            {...register('gstNumber', {
                                pattern: {
                                    value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
                                    message: 'Invalid GST format (e.g. 22AAAAA0000A1Z5)'
                                }
                            })}
                            placeholder="22AAAAA0000A1Z5"
                            maxLength={15}
                            style={{ textTransform: 'uppercase' }}
                        />
                        {errors.gstNumber && <span className={styles.error}>{errors.gstNumber.message}</span>}
                        <small className={styles['help-text']}>15 characters GST number</small>
                    </div>
                </div>

                {/* Product Interest */}
                <div className="subsection" style={{ marginTop: '24px' }}>
                    <h4 style={{ fontSize: '1rem', marginBottom: '16px', color: '#374151' }}>Product Interest</h4>

                    <div className={styles['form-group']}>
                        <label>INTERESTED IN PRODUCTS</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                            {[
                                'PHASE CUT DIMMABLE DRIVER AND DIMMER',
                                'ANALOG DRIVER & DIMMER',
                                'DALI DRIVER & DIMMER',
                                'SMART DRIVER – BLE',
                                'SMART DRIVER – ZIGBEE'
                            ].map((product) => (
                                <label key={product} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        value={product}
                                        {...register('interestedProducts')}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>{product}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles['form-group']}>
                        <label htmlFor="productNotes">PRODUCT REQUIREMENT NOTES</label>
                        <textarea
                            id="productNotes"
                            {...register('productNotes')}
                            placeholder="Enter specific product requirements or notes..."
                            rows={4}
                            className={styles['form-textarea']}
                            onChange={handleUppercaseChange('productNotes')}
                        />
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
    );
};
