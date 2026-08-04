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

    // DNS / network: Atlas hostname not resolved or cluster unreachable (avoid leaking hostnames on login UI)
    const errMsg = typeof err.message === 'string' ? err.message : String(err);
    if (
        err.code === 'ENOTFOUND' ||
        /getaddrinfo\s+ENOTFOUND/i.test(errMsg) ||
        err.name === 'MongoServerSelectionError' ||
        (err.name === 'MongoNetworkError' && /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(errMsg))
    ) {
        statusCode = 503;
        message =
            'Cannot reach the database server. Check internet access, VPN, and firewall. In MongoDB Atlas, confirm the cluster is running and Network Access allows your IP. On Windows you can try DNS 1.1.1.1 or start Node with NODE_OPTIONS=--dns-result-order=ipv4first.';
    }

    if (!statusCode) {
        statusCode = 500;
        message = err.message || 'Internal Server Error';
    }

    res.locals.errorMessage = err.message;

    const response = {
        code: statusCode,
        message,
        ...(typeof err.code === 'string' ? { errorCode: err.code } : {}),
        ...(err.details != null ? { details: err.details } : {}),
        ...(err.data != null ? { data: err.data } : {}),
        ...(config.env === 'development' &&
            errMsg &&
            errMsg !== message &&
            err.details == null && { details: errMsg }),
        ...(config.env === 'development' && { stack: err.stack }),
    };

    if (config.env === 'development') {
        logger.error(err);
    }

    res.status(statusCode).send(response);
};
