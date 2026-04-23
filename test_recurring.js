import fetch from 'node-fetch';

const baseUrl = 'http://localhost:4000/api/v1';

async function register() {
  try {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Admin User',
        email: 'admin@example.com',
        username: 'admin',
        password: 'admin123'
      })
    });
    const data = await res.json();
    console.log('Register response:', data);
  } catch (e) {
    console.error('Register error', e);
  }
}

async function login() {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const data = await res.json();
  console.log('Login response:', data);
  return data.token;
}

async function createTaskMaster(token) {
  const res = await fetch(`${baseUrl}/tasks/masters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Weekly Follow-up',
      description: 'Follow up with client',
      priority: 'MEDIUM',
      recurrence: {
        frequency: 'WEEKLY',
        interval: 1,
        startDate: new Date().toISOString(),
        endType: 'NEVER'
      },
      isActive: true
    })
  });
  const data = await res.json();
  console.log('Create Task Master:', data);
  return data;
}

async function getTasks(token, masterId) {
  const res = await fetch(`${baseUrl}/tasks?taskMasterId=${masterId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('Tasks for master:', data);
  return data;
}

async function closeTask(token, taskId) {
  const res = await fetch(`${baseUrl}/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'COMPLETED' })
  });
  const data = await res.json();
  console.log('Close task response:', data);
}

(async () => {
  await register();
  const token = await login();
  const master = await createTaskMaster(token);
  const masterId = master._id || master.id;
  const tasks1 = await getTasks(token, masterId);
  const firstTask = tasks1[0];
  if (firstTask) {
    await closeTask(token, firstTask._id);
    // Wait a moment for generation
    await new Promise(r => setTimeout(r, 2000));
    const tasks2 = await getTasks(token, masterId);
    console.log('After closing first task, tasks list:', tasks2);
  }
})();
