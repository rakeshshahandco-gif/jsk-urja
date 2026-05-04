import React, { useState } from 'react';
import styles from './TalkWithCustomerForm.module.scss';

export const CustomerSearchSection = ({ customers, onSelect, selectedCustomer }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const filteredCustomers = customers.filter(customer => {
        const searchVal = searchTerm.toLowerCase();
        const nameMatch = (customer.customerName || '').toLowerCase().includes(searchVal);
        const companyMatch = (customer.company || '').toLowerCase().includes(searchVal);
        const brandMatch = (customer.companyBrand || '').toLowerCase().includes(searchVal);

        const contactsMatch = (customer.contactPersons || []).some(contact =>
            (contact.name || '').toLowerCase().includes(searchVal) ||
            (contact.mobile || '').includes(searchVal) ||
            (contact.mobile2 || '').includes(searchVal) ||
            (contact.mobile3 || '').includes(searchVal) ||
            (contact.mobile4 || '').includes(searchVal) ||
            (contact.mobile5 || '').includes(searchVal) ||
            (contact.email || '').toLowerCase().includes(searchVal)
        );

        return nameMatch || companyMatch || brandMatch || contactsMatch;
    });

    const handleSelect = (customer) => {
        onSelect(customer);
        setSearchTerm(customer.company || customer.customerName || '');
        setShowDropdown(false);
    };

    return (
        <div className={styles.searchSection}>
            <label className={styles.searchLabel}>Search & Select Customer</label>
            <div className={styles.searchContainer}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search by name, company, or mobile..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                />

                {showDropdown && searchTerm && filteredCustomers.length > 0 && (
                    <div className={styles.dropdown}>
                        {filteredCustomers.map((customer) => {
                            const primaryContact = customer.contactPersons?.find(c => c.isPrimary) || (customer.contactPersons?.[0]);
                            return (
                                <div
                                    key={customer._id}
                                    className={styles.dropdownItem}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(customer);
                                    }}
                                >
                                    <div className={styles.dropdownCompany}>{customer.customerName || customer.name || 'Not Provided'}</div>
                                    <div className={styles.dropdownDetails}>
                                        {customer.company} • {primaryContact?.name || '-'} • {primaryContact?.mobile || '-'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
