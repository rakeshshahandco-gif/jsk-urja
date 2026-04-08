/**
 * Create an object composed of the picked object properties
 * @param {Object} object
 * @param {string[]} keys
 * @returns {Object}
 */
const pick = (object, keys) => {
    return keys.reduce((obj, key) => {
        if (object && Object.prototype.hasOwnProperty.call(object, key)) {
            const value = object[key];
            // Exclude empty strings to avoid CastErrors in Mongoose
            if (value !== '') {
                obj[key] = value;
            }
        }
        return obj;
    }, {});
};

export default pick;
