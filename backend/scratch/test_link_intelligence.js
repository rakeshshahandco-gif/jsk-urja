import axios from 'axios';

const test = async () => {
    try {
        const response = await axios.post('http://localhost:5100/api/v1/wechat/intelligence/link-existing-group', {
            productId: '662b9a7c3f8e4b2d8c9a1234',
            productName: 'MOSFET',
            keyword: '4N65',
            groupIds: ['662b9a7c3f8e4b2d8c9a5678'],
            selectedGroupName: 'MKP CAPACITOR',
            itemCode: 'INV-001',
            itemName: 'Sample MOSFET'
        });
        console.log('Response:', response.data);
    } catch (error) {
        console.log('Test Target: /api/v1/wechat/intelligence/link-existing-group');
        console.log('Error status:', error.response?.status);
        console.log('Error data:', error.response?.data);
    }
};

test();
