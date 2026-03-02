import config from '../config/config.js';
import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
    let { statusCode, message } = err;

    // Handle Mongoose buffering timeout (when MongoDB is not connected)
    if (err.name === 'MongooseError' && message.includes('buffering timed out')) {
        statusCode = 503;
        message = 'Database is not connected. Please contact the administrator to set up the database connection.';
    }

    if (!statusCode) {
        statusCode = 500;
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
