import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from './src/models/user.model.js';
import config from './src/config/config.js';

async function run() {
  try {
    await mongoose.connect(config.mongoose.url);
    const users = await User.find({});
    // Find admin user to receive the notification
    const admin = users.find(u => u.username === 'admin'); // It is known username is admin
    
    if(!admin) {
        console.error("Critical: Could not find user with username 'admin'");
        process.exit(1);
    }

    // Find any other user to send the notification
    let otherUser = users.find(u => u._id.toString() !== admin._id.toString());
    
    if (!otherUser) {
        otherUser = await User.create({
            name: 'System Bot',
            username: 'sysbot',
            email: 'sysbot@example.com',
            password: 'Password123',
            role: 'staff'
        });
    }

    console.log(`Will simulate ${otherUser.name} sending a task to ${admin.username} every 6 seconds...`);
    
    // Loop to keep pushing every 6 seconds so the browser subagent catches it
    setInterval(async () => {
        const tokenPayload = {
            sub: otherUser._id,
            id: otherUser._id,
            role: otherUser.role
        };
        const token = jwt.sign(tokenPayload, config.jwt.secret);

        try {
            const res = await fetch('http://localhost:4000/api/v1/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: `🚨 SPAM: Socket Test #${Math.floor(Math.random()*1000)}`,
                    description: 'Automated test.',
                    priority: 'CRITICAL',
                    status: 'OPEN',
                    dueDate: new Date().toISOString(),
                    assignmentMode: 'SINGLE',
                    assigneeIds: [admin._id.toString()]
                })
            });
            const data = await res.json();
            console.log('Task pushed via REST -> Target Socket. Success:', data.success);
        } catch (err) {
            console.error('Fetch failed:', err.message);
        }
    }, 6000);
  } catch (err) {
      console.error(err);
      process.exit(1);
  }
}
run();
