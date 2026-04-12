/**
 * E-way Bill standard numeric state codes
 */
export const STATE_CODES = {
    "jammu & kashmir": 1,
    "himachal pradesh": 2,
    "punjab": 3,
    "chandigarh": 4,
    "uttarakhand": 5,
    "haryana": 6,
    "delhi": 7,
    "rajasthan": 8,
    "uttar pradesh": 9,
    "bihar": 10,
    "sikkim": 11,
    "arunachal pradesh": 12,
    "nagaland": 13,
    "manipur": 14,
    "mizoram": 15,
    "tripura": 16,
    "meghalaya": 17,
    "assam": 18,
    "west bengal": 19,
    "jharkhand": 20,
    "odisha": 21,
    "chhattisgarh": 22,
    "madhya pradesh": 23,
    "gujarat": 24,
    "daman & diu": 25,
    "dadra & nagar haveli": 26,
    "maharashtra": 27,
    "andhra pradesh": 28, // (Old code, still used often)
    "andhra pradesh (new)": 37,
    "karnataka": 29,
    "goa": 30,
    "lakshadweep": 31,
    "kerala": 32,
    "tamil nadu": 33,
    "puducherry": 34,
    "andaman & nicobar islands": 35,
    "telangana": 36,
    "ladakh": 38,
};

/**
 * Get numeric state code from state name
 */
export const getStateCode = (stateName) => {
    if (!stateName) return 0;
    const normalized = stateName.toLowerCase().trim();
    return STATE_CODES[normalized] || 0;
};

/**
 * Standard E-way bill UOM codes
 */
export const UOM_MAP = {
    "nos": "NOS",
    "kg": "KGS",
    "kgs": "KGS",
    "pcs": "PCS",
    "mtr": "MTR",
    "box": "BOX",
    "set": "SET",
    "bag": "BGS",
    "bgs": "BGS",
    "btl": "BTL",
    "can": "CAN",
    "ctn": "CTN",
    "doz": "DOZ",
    "gms": "GMS",
    "kme": "KME",
    "mlt": "MLT",
    "mtr": "MTR",
    "ott": "OTT",
    "pac": "PAC",
    "pcs": "PCS",
    "prs": "PRS",
    "qtl": "QTL",
    "rol": "ROL",
    "tub": "TUB",
    "ugs": "UGS",
    "unt": "UNT",
    "yds": "YDS",
    "oth": "OTH",
};

/**
 * Get standard UOM code
 */
export const getStandardUom = (uom) => {
    if (!uom) return "NOS";
    const normalized = uom.toLowerCase().trim();
    return UOM_MAP[normalized] || "OTH";
};
