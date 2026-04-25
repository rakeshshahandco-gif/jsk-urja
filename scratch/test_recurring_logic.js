import axios from 'axios';

const API_URL = 'http://localhost:5100/api/v1';

async function test() {
    try {
        // 1. Login to get token
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginRes.data.data.token;
        console.log('Logged in successfully');

        // 2. Get Task Groups
        console.log('Getting Task Groups...');
        const groupsRes = await axios.get(`${API_URL}/task-groups`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const groups = groupsRes.data.data || groupsRes.data;
        const testGroup = groups.find(g => g.name === 'General') || groups[0];
        
        if (!testGroup) {
            console.error('No Task Groups found. Please seed some data.');
            return;
        }
        console.log(`Using Task Group: ${testGroup.name} (${testGroup._id})`);

        // 3. Create Task Master
        console.log('Creating Task Master...');
        const masterPayload = {
            title: 'Test Recurring Task ' + Date.now(),
            description: 'Testing the recurring logic',
            priority: 'MEDIUM',
            assignmentMode: 'SINGLE',
            assigneeIds: [loginRes.data.data._id], // Assign to self
            group: testGroup._id, // This is a TaskGroup ID
            defaultAmount: 1500.50,
            defaultBillNumber: 'BILL-REC-001',
            defaultRemarks: 'Monthly recurring test payment',
            recurrence: {
                frequency: 'MONTHLY',
                interval: 1,
                startDate: new Date().toISOString(),
                endType: 'NEVER'
            }
        };

        const createRes = await axios.post(`${API_URL}/tasks/masters`, masterPayload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Task Master created:', createRes.data);

        // 4. Check if Task instance was created
        console.log('Checking for Task instance...');
        const masterId = createRes.data.data._id;
        const tasksRes = await axios.get(`${API_URL}/tasks?taskMasterId=${masterId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Tasks for master:', tasksRes.data.data);

        if (tasksRes.data.data.length > 0) {
            console.log('SUCCESS: First task instance created.');
            const task = tasksRes.data.data[0];
            console.log(`Task groupId: ${task.groupId}`);
            if (task.groupId === testGroup._id) {
                console.log('SUCCESS: Group ID correctly mapped.');
            } else {
                console.warn(`WARNING: Group ID mismatch! Expected ${testGroup._id}, got ${task.groupId}`);
            }
        } else {
            console.error('FAILURE: No task instance created.');
        }

    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
    }
}

test();
