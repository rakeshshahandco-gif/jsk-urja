import React, { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Input, Select, MultiSelect, ContactPersonInput } from '@/components/ui';
import { INDIAN_STATES, STATE_GST_CODES, DEMAND_PRODUCTS, SALES_PERSONS } from '@/utils/constants';
import { Maximize2, Minimize2, Plus } from 'lucide-react';
import styles from './CustomerForm.module.scss';
import { createCustomer, getCustomerTypes } from '@/services/customerApi';
import { getStickers } from '@/services/stickerApi';
import { AddStickerModal } from './AddStickerModal';
import toast from 'react-hot-toast';

// Mock DB for Company Names (In real app, this comes from API)
const MOCK_DB_COMPANIES = [
    'JSK Urja',
    'JSK Power Ltd',
    'Tech Corp',
    'Alpha Industries',
    'Beta Solutions',
    'Gamma Grids'
];

export const AddCustomerForm = ({ closeModal }) => {
    const { register, handleSubmit, control, setValue, watch, formState: { errors, isSubmitting } } = useForm({ mode: 'onChange' });
    const [isFullscreen, setIsFullscreen] = useState(false);
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

    // Watch company and state field values
    const [companyValue, stateValue] = useWatch({
        control,
        name: ['company', 'state'],
        defaultValue: ['', '']
    });

    const [similarCompanies, setSimilarCompanies] = useState([]);

    // Handle fullscreen toggle
    const toggleFullscreen = async () => {
        if (!isFullscreen) {
            // Enter fullscreen
            try {
                const elem = document.documentElement;
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) { // Safari
                    await elem.webkitRequestFullscreen();
                } else if (elem.msRequestFullscreen) { // IE11
                    await elem.msRequestFullscreen();
                }
                setIsFullscreen(true);
            } catch (err) {
                console.error('Error entering fullscreen:', err);
            }
        } else {
            // Exit fullscreen
            try {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) { // Safari
                    await document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) { // IE11
                    await document.msExitFullscreen();
                }
                setIsFullscreen(false);
            } catch (err) {
                console.error('Error exiting fullscreen:', err);
            }
        }
    };

    // Listen for fullscreen changes (e.g., user presses ESC)
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.msFullscreenElement
            );
            setIsFullscreen(isCurrentlyFullscreen);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('msfullscreenchange', handleFullscreenChange);
        };
    }, []);

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

    // Check for similar companies when input changes
    useEffect(() => {
        if (companyValue && companyValue.length >= 2) {
            const matches = MOCK_DB_COMPANIES.filter(c =>
                c.toLowerCase().includes(companyValue.toLowerCase()) &&
                c.toLowerCase() !== companyValue.toLowerCase() // Don't show exact match if desired, or do. User said "similar"
            );
            setSimilarCompanies(matches);
        } else {
            setSimilarCompanies([]);
        }
    }, [companyValue]);

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

    const onSubmit = async (data) => {
        try {
            // Transform contactPersons to set isPrimary based on primaryContactIndex
            const primaryIndex = parseInt(data.primaryContactIndex);
            const transformedData = {
                ...data,
                contactPersons: data.contactPersons.map((contact, index) => ({
                    ...contact,
                    isPrimary: index === primaryIndex,
                })),
                // Map field names to match backend
                gstNumber: data.gstNumber || '',
                interestedProducts: data.demandProduct || [],
            };

            // Remove fields not needed by the backend
            delete transformedData.primaryContactIndex;
            delete transformedData.demandProduct;

            await createCustomer(transformedData);
            toast.success('Customer added successfully!');
            closeModal();
        } catch (error) {
            const message = error?.response?.data?.message || 'Failed to add customer. Please try again.';
            toast.error(message);
            console.error('Create customer error:', error);
        }
    };

    return (
        <>
            {/* Fullscreen Toggle Button */}
            <div className={styles.toggleContainer}>
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className={styles.toggleButton}
                    title={isFullscreen ? "Exit Fullscreen (ESC)" : "Enter Fullscreen"}
                >
                    {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    <span>{isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</span>
                </button>
            </div>

            <form
                onSubmit={handleSubmit(onSubmit)}
                className={`${styles.formGrid} ${isFullscreen ? styles.fullscreen : ''}`}
            >

                {/* Basic Information */}
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Basic Information</h4>
                    <div className={styles.grid3}>
                        <div>
                            <Input
                                label="Company Name"
                                placeholder="Tech Corp Ltd."
                                {...register('company')}
                            />
                            {similarCompanies.length > 0 && (
                                <div className={styles.suggestionBox}>
                                    <span className={styles.suggestionTitle}>Similar existing companies:</span>
                                    <ul className={styles.suggestionList}>
                                        {similarCompanies.map((c, i) => (
                                            <li key={i}>{c}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <Input
                            label="Company Email"
                            type="email"
                            placeholder="info@company.com"
                            {...register('companyEmail', {
                                pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' }
                            })}
                            error={errors.companyEmail}
                        />

                        {/* Mobile input would typically go here to complete the row, but it's not in the original Basic Info section? 
                            Checking original: Mobile was not in Basic Info. Let's look for it.
                            Wait, Mobile was in ContactPersonInput logic? 
                            Ah, I don't see Mobile field in the Basic Info JSX of the original file provided in context. 
                            Let's assume "Company Email" is the only other field in Basic Info provided in snippet. 
                            We'll leave the 3rd slot empty or generic.
                         */}
                    </div>
                </section>

                {/* Contact Persons - Keep as is, it has internal logic */}
                <section className={styles.section}>
                    <ContactPersonInput
                        control={control}
                        register={register}
                        errors={errors}
                    />
                </section>

                {/* Location */}
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Location</h4>
                    <div className={styles.grid3}>
                        <div className={styles.colSpan3}>
                            <Input
                                label="Full Address"
                                placeholder="123 Main St, Suite 100"
                                {...register('address')}
                            />
                        </div>

                        <Input label="Area" {...register('city')} />

                        <div>
                            <Input
                                label="State"
                                list="indian-states"
                                placeholder="Type to search..."
                                {...register('state')}
                            />
                            <datalist id="indian-states">
                                {INDIAN_STATES.map(state => (
                                    <option key={state} value={state} />
                                ))}
                            </datalist>
                        </div>

                        <Input label="PinCode" {...register('pincode')} />
                    </div>
                </section>

                {/* Business Details */}
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Business Details</h4>
                    <div className={styles.grid3}>
                        <Input
                            label="GST Number"
                            placeholder="27ABCDE1234F1Z5"
                            maxLength={15}
                            {...(function() {
                                const { onChange, ...rest } = register('gstNumber', {
                                    pattern: { value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, message: 'Invalid GST format' },
                                    validate: (value) => {
                                        if (!value) return true;
                                        if (!stateValue) return true;
                                        const code = STATE_GST_CODES[stateValue];
                                        if (code && !value.startsWith(code)) {
                                            return `GST must start with ${code} for ${stateValue}`;
                                        }
                                        return true;
                                    }
                                });
                                return {
                                    ...rest,
                                    onChange: (e) => {
                                        e.target.value = e.target.value.toUpperCase();
                                        onChange(e);
                                    }
                                };
                            })()}
                            error={errors.gstNumber}
                        />

                        <Select
                            label="GST Type"
                            options={[
                                { value: '', label: '-- Select Type --' },
                                { value: 'CGST / SGST', label: 'CGST / SGST' },
                                { value: 'IGST', label: 'IGST' },
                            ]}
                            {...register('gstType')}
                            disabled // Automatically selected
                        />

                        <Select
                            label="GST Registration Type"
                            options={[
                                { value: '', label: '-- Select Type --' },
                                { value: 'Registered', label: 'Registered' },
                                { value: 'Unregistered', label: 'Unregistered' },
                                { value: 'Composite', label: 'Composite' },
                                { value: 'Consumer', label: 'Consumer' },
                            ]}
                            {...register('gstRegistrationType')}
                        />

                        {!isCustomType ? (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <Select
                                        label="Customer Type"
                                        options={dynamicCustomerTypes}
                                        {...register('customerType')}
                                    />
                                </div>
                                <Button type="button" variant="outline" onClick={() => { setIsCustomType(true); setValue('customerType', ''); }} title="Add Custom Type" style={{ height: '42px', padding: '0 12px' }}>
                                    <Plus size={18} />
                                </Button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <Input
                                        label="Customer Type (Custom)"
                                        placeholder="Enter custom type"
                                        {...register('customerType')}
                                        onChange={(e) => {
                                            e.target.value = e.target.value.toUpperCase();
                                            setValue('customerType', e.target.value, { shouldValidate: true, shouldDirty: true });
                                        }}
                                    />
                                </div>
                                <Button type="button" variant="outline" onClick={() => { setIsCustomType(false); setValue('customerType', ''); }} title="Select from list" style={{ height: '42px', padding: '0 12px' }}>
                                    List
                                </Button>
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <MultiSelect
                                    label="Stickers / Labels"
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

                        <Select
                            label="Status"
                            options={[
                                { value: 'running_high', label: 'Running - High' },
                                { value: 'running_low', label: 'Running - Low' },
                                { value: 'inactive', label: 'Inactive' },
                                { value: 'lead', label: 'Lead' },
                            ]}
                            {...register('status')}
                        />

                        <div className={styles.colSpan3}>
                            <MultiSelect
                                label="Demand Product"
                                placeholder="Select Products..."
                                options={DEMAND_PRODUCTS}
                                name="demandProduct"
                                control={control}
                            />
                        </div>

                        <Input
                            label="Credit Period (Days)"
                            type="number"
                            placeholder="0"
                            min="0"
                            {...register('creditPeriod', { valueAsNumber: true })}
                        />

                        <Select
                            label="Payment Type"
                            options={[
                                { value: 'Credit', label: 'Credit' },
                                { value: 'Cash', label: 'Cash' },
                            ]}
                            {...register('paymentType')}
                        />
                    </div>
                </section>

                {/* Follow-up Details */}
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Follow-up Details</h4>
                    <div className={styles.grid3}>
                        <Input
                            label="Date"
                            type="date"
                            {...register('followUpDate')}
                        />
                        <Input
                            label="Date of Call / Action"
                            type="date"
                            {...register('nextActionDate')}
                        />
                        <div className={styles.colSpan3}>
                            <Input
                                label="Conversation"
                                placeholder="Enter conversation details..."
                                {...register('conversation')}
                            />
                        </div>
                    </div>
                </section>

                {/* Footer Actions */}
                <div className={styles.actions}>
                    <Button variant="outline" type="button" onClick={() => window.confirm('Discard changes?') && closeModal()} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        Add Customer
                    </Button>
                </div>
            </form>
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
