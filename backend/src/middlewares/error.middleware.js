import config from '../config/config.js';
import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
    let { statusCode, message } = err;

    // Handle Mongoose buffering timeout (when MongoDB is not connected)
    if (err.name === 'MongooseError' && message.includes('buffering timed out')) {
        statusCode = 503;
        message = 'Database is not connected. Please contact the administrator to set up the database connection.';
    }

    // Handle Mongoose Validation Error (Model-level)
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map(val => val.message).join(', ');
    }

    // Handle Mongo Duplicate Key Error (Code 11000)
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue)[0];
        message = `Duplicate entry: A record with this "${field}" already exists.`;
    }

    if (!statusCode) {
        statusCode = 500;
        message = err.message || 'Internal Server Error';
    }

    res.locals.errorMessage = err.message;

    const response = {
        code: statusCode,
        message: err.message || message, // Forcing error message to frontend for debugging
        ...(config.env === 'development' && { stack: err.stack }),
    };

    if (config.env === 'development') {
        logger.error(err);
    }

    res.status(statusCode).send(response);
};
