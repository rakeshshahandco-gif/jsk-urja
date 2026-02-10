import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Customers');

// Define columns
worksheet.columns = [
    { header: 'Customer Name', key: 'customerName', width: 25 },
    { header: 'Contact Person Name *', key: 'contactName', width: 25 },
    { header: 'Mobile *', key: 'mobile', width: 15 },
    { header: 'Mobile 2', key: 'mobile2', width: 15 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Company', key: 'company', width: 25 },
    { header: 'Company Brand', key: 'companyBrand', width: 20 },
    { header: 'Customer Type', key: 'customerType', width: 30 },
    { header: 'Area/City', key: 'area', width: 20 },
    { header: 'State', key: 'state', width: 20 },
    { header: 'Address', key: 'address', width: 40 },
    { header: 'Pincode', key: 'pincode', width: 10 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'GST Number', key: 'gstNumber', width: 20 },
    { header: 'Interested Products', key: 'interestedProducts', width: 50 },
    { header: 'Notes', key: 'notes', width: 40 },
];

// Style header
worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
};
worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

// Add dummy data
const dummyCustomers = [
    {
        customerName: 'Luxe Lighting Co',
        contactName: 'Rajesh Kumar',
        mobile: '9876543210',
        mobile2: '9876543211',
        email: 'rajesh@luxelighting.com',
        company: 'Luxe Lighting Solutions',
        companyBrand: 'Luxe',
        customerType: 'led_light_manufacturer',
        area: 'Mumbai',
        state: 'Maharashtra',
        address: '123 Industrial Estate, Andheri East',
        pincode: '400069',
        status: 'running_high',
        gstNumber: '27AABCU9603R1ZM',
        interestedProducts: 'DALI DRIVER & DIMMER, SMART DRIVER – BLE',
        notes: 'High volume manufacturer, regular orders'
    },
    {
        customerName: 'Smart Home Systems',
        contactName: 'Priya Sharma',
        mobile: '9988776655',
        mobile2: '',
        email: 'priya@smarthomesys.com',
        company: 'Smart Home Systems Pvt Ltd',
        companyBrand: 'SHS',
        customerType: 'home_automation_provider',
        area: 'Bangalore',
        state: 'Karnataka',
        address: '45 Tech Park, Whitefield',
        pincode: '560066',
        status: 'lead',
        gstNumber: '29AAECS1234H1Z5',
        interestedProducts: 'SMART DRIVER – ZIGBEE, ANALOG DRIVER & DIMMER',
        notes: 'Interested in smart home integration'
    },
    {
        customerName: 'Elite Interiors',
        contactName: 'Amit Patel',
        mobile: '9123456789',
        mobile2: '9123456790',
        email: 'amit@eliteinteriors.in',
        company: 'Elite Interior Designs',
        companyBrand: 'Elite',
        customerType: 'interior_designer',
        area: 'Ahmedabad',
        state: 'Gujarat',
        address: '78 Design Hub, SG Highway',
        pincode: '380015',
        status: 'running_low',
        gstNumber: '24AADCE5678F1Z1',
        interestedProducts: 'PHASE CUT DIMMABLE DRIVER AND DIMMER',
        notes: 'Works on luxury residential projects'
    },
    {
        customerName: 'Skyline Builders',
        contactName: 'Deepak Reddy',
        mobile: '9876501234',
        mobile2: '',
        email: 'deepak@skylinebuilders.com',
        company: 'Skyline Construction Pvt Ltd',
        companyBrand: 'Skyline',
        customerType: 'builders',
        area: 'Hyderabad',
        state: 'Telangana',
        address: '12 Construction Lane, Gachibowli',
        pincode: '500032',
        status: 'lead',
        gstNumber: '36AAFCS4567K1ZP',
        interestedProducts: 'DALI DRIVER & DIMMER',
        notes: 'Building 2 new residential complexes'
    },
    {
        customerName: 'Bright Lights Showroom',
        contactName: 'Sneha Iyer',
        mobile: '9445566778',
        mobile2: '9445566779',
        email: 'sneha@brightlights.in',
        company: 'Bright Lights Retail',
        companyBrand: 'Bright Lights',
        customerType: 'led_light_showroom',
        area: 'Chennai',
        state: 'Tamil Nadu',
        address: '234 Anna Salai, T Nagar',
        pincode: '600017',
        status: 'running_high',
        gstNumber: '33AABCB1234C1Z6',
        interestedProducts: 'ANALOG DRIVER & DIMMER, SMART DRIVER – BLE',
        notes: 'Premium showroom with good footfall'
    },
    {
        customerName: 'Metro Electricals',
        contactName: 'Vikram Singh',
        mobile: '9876000111',
        mobile2: '',
        email: 'vikram@metroelectric.com',
        company: 'Metro Electricals & Hardware',
        companyBrand: 'Metro',
        customerType: 'dealer',
        area: 'Delhi',
        state: 'Delhi',
        address: '567 Nehru Place',
        pincode: '110019',
        status: 'running_low',
        gstNumber: '07AACDE3456M1Z2',
        interestedProducts: 'PHASE CUT DIMMABLE DRIVER AND DIMMER',
        notes: 'Wholesale dealer, bulk orders'
    },
    {
        customerName: 'National Distributors',
        contactName: 'Arjun Mehta',
        mobile: '9898989898',
        mobile2: '9797979797',
        email: 'arjun@natdist.in',
        company: 'National Distributors Ltd',
        companyBrand: 'NDL',
        customerType: 'distributor',
        area: 'Pune',
        state: 'Maharashtra',
        address: '890 Distribution Center, Pimpri',
        pincode: '411018',
        status: 'running_high',
        gstNumber: '27AABCN5678P1Z9',
        interestedProducts: 'DALI DRIVER & DIMMER, SMART DRIVER – ZIGBEE, ANALOG DRIVER & DIMMER',
        notes: 'Pan-India distribution network'
    },
    {
        customerName: 'Designer Hub',
        contactName: 'Neha Kapoor',
        mobile: '9111222333',
        mobile2: '',
        email: 'neha@designerhub.co',
        company: 'Designer Hub Studio',
        companyBrand: 'DH Studio',
        customerType: 'interior_designer',
        area: 'Gurgaon',
        state: 'Haryana',
        address: '45 DLF Cyber City',
        pincode: '122002',
        status: 'lead',
        gstNumber: '06AACDE7890N1ZK',
        interestedProducts: 'SMART DRIVER – BLE',
        notes: 'Focus on commercial office interiors'
    }
];

// Add dummy rows
dummyCustomers.forEach(customer => {
    worksheet.addRow(customer);
});

// Save file
const filePath = './Customer_Sample_Data.xlsx';
await workbook.xlsx.writeFile(filePath);

console.log(`✅ Sample Excel file created: ${filePath}`);
console.log(`📊 Contains ${dummyCustomers.length} sample customers`);
