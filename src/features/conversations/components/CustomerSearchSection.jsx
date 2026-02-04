import React, { useState } from 'react';
import styles from './TalkWithCustomerForm.module.scss';

export const CustomerSearchSection = ({ customers, onSelect, selectedCustomer }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const filteredCustomers = customers.filter(customer =>
        (customer.customerName || customer.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.contactPerson || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.mobile || '').includes(searchTerm) ||
        (customer.mobile2 || '').includes(searchTerm) ||
        (customer.mobile3 || '').includes(searchTerm) ||
        (customer.mobile4 || '').includes(searchTerm) ||
        (customer.mobile5 || '').includes(searchTerm)
    );

    const handleSelect = (customer) => {
        onSelect(customer);
        setSearchTerm(customer.company);
        setShowDropdown(false);
    };

    return (
        <div className={styles.searchSection}>
            <label className={styles.searchLabel}>Search & Select Customer</label>
            <div className={styles.searchContainer}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Type company name or contact person..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                />

                {showDropdown && searchTerm && filteredCustomers.length > 0 && (
                    <div className={styles.dropdown}>
                        {filteredCustomers.map((customer) => (
                            <div
                                key={customer.id}
                                className={styles.dropdownItem}
                                onClick={() => handleSelect(customer)}
                            >
                                <div className={styles.dropdownCompany}>{customer.customerName || customer.name || 'Not Provided'}</div>
                                <div className={styles.dropdownDetails}>
                                    {customer.company} • {customer.contactPerson || '-'} • {customer.mobile || '-'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
