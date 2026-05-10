import React, { useState, useEffect } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { getTestParameters, createTestParameter, updateTestParameter, deleteTestParameter } from '@/services/prdApi';
import { Search, Plus, Trash2, Edit, Save, Filter, PlusCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdTestParameterMasterPage.module.scss';
import clsx from 'clsx';
import { useForm, useFieldArray } from 'react-hook-form';

const CATEGORY_OPTIONS = [
    { value: 'Dimmable Driver', label: 'Dimmable Driver' },
    { value: 'Smart Switch', label: 'Smart Switch' },
    { value: 'Controller', label: 'Controller' },
    { value: 'DALI Driver', label: 'DALI Driver' },
    { value: 'Other', label: 'Other' },
];

const INPUT_TYPE_OPTIONS = [
    { value: 'Numeric', label: 'Numeric (Min/Max)' },
    { value: 'Pass-Fail', label: 'Pass / Fail Toggle' },
    { value: 'Text', label: 'Text Observation' },
    { value: 'Multiple-Points', label: 'Multiple Points (e.g., Heating)' },
];

const ParameterForm = ({ isOpen, onClose, parameter, onSuccess }) => {
    const isEdit = !!parameter;
    const { register, control, handleSubmit, watch, formState: { errors }, reset } = useForm({
        defaultValues: {
            productCategory: 'Other',
            inputType: 'Numeric',
            isMandatory: true,
            isActive: true,
            sequenceNo: 1,
            dynamicPoints: []
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: 'dynamicPoints' });
    const inputType = watch('inputType');

    useEffect(() => {
        if (parameter && isOpen) {
            reset(parameter);
        } else if (!parameter && isOpen) {
            reset({
                productCategory: 'Other',
                inputType: 'Numeric',
                isMandatory: true,
                isActive: true,
                sequenceNo: 1,
                dynamicPoints: []
            });
        }
    }, [parameter, isOpen, reset]);

    const onSubmit = async (data) => {
        try {
            // Cleanup limits if not numeric
            if (data.inputType !== 'Numeric') {
                data.lowerLimit = null;
                data.upperLimit = null;
            }
            if (data.inputType !== 'Multiple-Points') {
                data.dynamicPoints = [];
            }

            if (isEdit) {
                await updateTestParameter(parameter._id, data);
                toast.success('Parameter updated successfully');
            } else {
                await createTestParameter(data);
                toast.success('Parameter created successfully');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || `Failed to save parameter`);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? 'Edit Test Parameter' : 'New Test Parameter'}
            size="lg"
        >
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                <div className={styles.grid2}>
                    <Input
                        label="Parameter Name *"
                        placeholder="e.g. Input Voltage, Heating Time, Short Circuit..."
                        {...register('parameterName', { required: 'Name is required' })}
                        error={errors.parameterName?.message}
                    />
                    <Select
                        label="Product Category *"
                        options={CATEGORY_OPTIONS}
                        {...register('productCategory', { required: 'Category is required' })}
                    />
                    <Select
                        label="Data Input Type *"
                        options={INPUT_TYPE_OPTIONS}
                        {...register('inputType')}
                    />
                    <Input
                        label="Unit of Measurement (UOM)"
                        placeholder="e.g. V, A, °C, mA"
                        {...register('unit')}
                    />
                </div>

                {inputType === 'Numeric' && (
                    <div className={styles.grid2}>
                        <Input
                            type="number"
                            step="any"
                            label="Lower Limit (Optional)"
                            {...register('lowerLimit')}
                        />
                        <Input
                            type="number"
                            step="any"
                            label="Upper Limit (Optional)"
                            {...register('upperLimit')}
                        />
                    </div>
                )}

                {inputType === 'Multiple-Points' && (
                    <div className={styles.dynamicPointsCard}>
                        <h4>Dynamic Reading Points</h4>
                        <p className={styles.helpText}>Define standard measurement points for this test (e.g. heating interval checkpoints).</p>
                        
                        {fields.map((field, index) => (
                            <div key={field.id} className={styles.pointRow}>
                                <Input
                                    placeholder="Point Label (e.g., 'After 15 Mins', 'At 180V')"
                                    {...register(`dynamicPoints.${index}.pointLabel`, { required: true })}
                                />
                                <button type="button" onClick={() => remove(index)} className={styles.btnRemoveIcon}>
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ pointLabel: '' })}>
                            <PlusCircle size={16} /> Add Point
                        </Button>
                    </div>
                )}

                <div className={styles.grid3}>
                    <Input
                        type="number"
                        label="Sequence No"
                        {...register('sequenceNo')}
                    />
                    <div className={styles.checkboxWrapper}>
                        <input type="checkbox" id="isMandatory" {...register('isMandatory')} />
                        <label htmlFor="isMandatory">Is Mandatory Test?</label>
                    </div>
                    <div className={styles.checkboxWrapper}>
                        <input type="checkbox" id="isActive" {...register('isActive')} />
                        <label htmlFor="isActive">Is Active?</label>
                    </div>
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="submit">
                        <Save size={16} /> {isEdit ? 'Save Changes' : 'Create Parameter'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

const PrdTestParameterMasterPage = () => {
    const [parameters, setParameters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState('');
    
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editParam, setEditParam] = useState(null);

    const fetchParams = async () => {
        setLoading(true);
        try {
            const data = await getTestParameters({ productCategory: categoryFilter });
            setParameters(data);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch parameters');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchParams();
    }, [categoryFilter]);

    const handleCreate = () => {
        setEditParam(null);
        setIsFormOpen(true);
    };

    const handleEdit = (param) => {
        setEditParam(param);
        setIsFormOpen(true);
    };

    const handleDelete = async (param) => {
        if (window.confirm(`Delete test parameter "${param.parameterName}"? Note: This deletes the configuration, but existing test reports will retain the name via denormalization.`)) {
            try {
                await deleteTestParameter(param._id);
                toast.success('Parameter deleted');
                fetchParams();
            } catch (error) {
                toast.error(error.message || 'Error deleting parameter');
            }
        }
    };

    // Grouping by Category for UI clarity
    const grouped = parameters.reduce((acc, curr) => {
        if (!acc[curr.productCategory]) acc[curr.productCategory] = [];
        acc[curr.productCategory].push(curr);
        return acc;
    }, {});

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleInfo}>
                    <h1>Dynamic Testing Configuration Master</h1>
                    <p>Configure passing criteria and data entry sequences for QA.</p>
                </div>
                
                <div className={styles.actions}>
                    <div className={styles.filterBox}>
                        <Filter size={18} className={styles.icon} />
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">All Categories</option>
                            <option value="Dimmable Driver">Dimmable Driver</option>
                            <option value="Smart Switch">Smart Switch</option>
                            <option value="Controller">Controller</option>
                            <option value="DALI Driver">DALI Driver</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <Button variant="primary" onClick={handleCreate}>
                        <Plus size={18} /> Add Parameter
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className={styles.loader}>Loading configurations...</div>
            ) : (
                <div className={styles.categoriesWrapper}>
                    {Object.keys(grouped).length === 0 ? (
                        <div className={styles.emptyState}>No parameters configured yet.</div>
                    ) : (
                        Object.keys(grouped).map(category => (
                            <div key={category} className={styles.categoryBlock}>
                                <h3>{category}</h3>
                                <div className={styles.tableContainer}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th width="80">Seq</th>
                                                <th>Parameter Name</th>
                                                <th>Input Type</th>
                                                <th>Unit</th>
                                                <th>Validation Rules</th>
                                                <th>Status</th>
                                                <th width="100">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {grouped[category].map(p => (
                                                <tr key={p._id}>
                                                    <td className={styles.seqCol}>{p.sequenceNo}</td>
                                                    <td><strong>{p.parameterName}</strong></td>
                                                    <td>
                                                        <span className={clsx(styles.typeBadge, styles[`type_${p.inputType.replace(/\W/g, '')}`])}>
                                                            {p.inputType}
                                                        </span>
                                                    </td>
                                                    <td>{p.unit || '-'}</td>
                                                    <td className={styles.validationCol}>
                                                        {p.inputType === 'Numeric' && (p.lowerLimit !== null || p.upperLimit !== null) && (
                                                            <div className={styles.limitBox}>
                                                                Range: {p.lowerLimit ?? '-∞'} to {p.upperLimit ?? '+∞'} {p.unit}
                                                            </div>
                                                        )}
                                                        {p.inputType === 'Multiple-Points' && p.dynamicPoints?.length > 0 && (
                                                            <div className={styles.pointsList}>
                                                                {p.dynamicPoints.length} checkpoints configured
                                                            </div>
                                                        )}
                                                        {p.isMandatory && <span className={styles.mandatoryFlag}>* Mandatory Test</span>}
                                                    </td>
                                                    <td>
                                                        <span className={p.isActive ? styles.statusActive : styles.statusInactive}>
                                                            {p.isActive ? 'Active' : 'Disabled'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className={styles.actionButtons}>
                                                            <button onClick={() => handleEdit(p)} title="Edit Config" className={styles.btnIcon}>
                                                                <Edit size={16} />
                                                            </button>
                                                            <button onClick={() => handleDelete(p)} title="Delete Parameter" className={styles.btnDelete}>
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {isFormOpen && (
                <ParameterForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    parameter={editParam}
                    onSuccess={fetchParams}
                />
            )}
        </div>
    );
};

export default PrdTestParameterMasterPage;
