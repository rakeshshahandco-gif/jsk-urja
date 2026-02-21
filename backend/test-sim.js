import axios from 'axios';

const testCreate = async () => {
    try {
        const payload = {
            name: "New Test User",
            username: "testuser_" + Date.now(),
            email: "",
            mobile: "",
            password: "password123",
            role: "staff",
            isActive: true,
            permissions: ["view_customers", "add_customer"]
        };

        // We need an admin token to test this, but we can't easily get one here.
        // Instead, let's check if the payload itself has any obvious issues with the Joi schema.

        console.log("Simulating Joi validation for this payload:");
        console.log(JSON.stringify(payload, null, 2));

        // Let's also check if 'email: ""' causes issues in the controller.
        const normalizedEmail = (payload.email && payload.email.trim() !== '') ? payload.email.trim().toLowerCase() : undefined;
        console.log("Normalized Email:", normalizedEmail);

    } catch (error) {
        console.error("Test failed:", error);
    }
};

testCreate();
