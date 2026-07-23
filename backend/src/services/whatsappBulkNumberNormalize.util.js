/**
 * Country-aware Bulk number normalization + validation.
 * Does not mutate Customer/Lead master records.
 */
export const NUMBER_HEALTH_VALIDATION_VERSION = 1;

export const VALIDATION_STATUSES = Object.freeze({
  VALID: 'VALID',
  INVALID: 'INVALID',
  UNKNOWN: 'UNKNOWN',
  NOT_CHECKED: 'NOT_CHECKED',
});

export const VALIDATION_REASON_CODES = Object.freeze({
  EMPTY: 'EMPTY',
  NON_NUMERIC: 'NON_NUMERIC',
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
  INVALID_COUNTRY_CODE: 'INVALID_COUNTRY_CODE',
  DUPLICATE_COUNTRY_CODE: 'DUPLICATE_COUNTRY_CODE',
  INVALID_MOBILE_PREFIX: 'INVALID_MOBILE_PREFIX',
  DUMMY_NUMBER: 'DUMMY_NUMBER',
  LANDLINE_NOT_SUPPORTED: 'LANDLINE_NOT_SUPPORTED',
  UNSUPPORTED_COUNTRY: 'UNSUPPORTED_COUNTRY',
  UNKNOWN_FORMAT: 'UNKNOWN_FORMAT',
  OK: 'OK',
});

const REASON_MESSAGES = {
  EMPTY: 'Number is blank',
  NON_NUMERIC: 'Contains letters or unsupported characters',
  TOO_SHORT: 'Too few digits',
  TOO_LONG: 'Too many digits',
  INVALID_COUNTRY_CODE: 'Missing or invalid country code',
  DUPLICATE_COUNTRY_CODE: 'Country code appears duplicated',
  INVALID_MOBILE_PREFIX: 'Invalid Indian mobile prefix (must start with 6-9)',
  DUMMY_NUMBER: 'Looks like a dummy or repeated-digit number',
  LANDLINE_NOT_SUPPORTED: 'Landline numbers are not supported for WhatsApp mobile campaigns',
  UNSUPPORTED_COUNTRY: 'Country rule not configured',
  UNKNOWN_FORMAT: 'Unrecognized number format',
  OK: 'Valid mobile number',
};

function onlyDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function hasUnsupportedChars(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  // allow digits, spaces, +, -, (), .
  return /[^0-9+\-\s().]/.test(s);
}

function isAllSameDigit(digits) {
  return digits.length >= 8 && /^(\d)\1+$/.test(digits);
}

function isDummySequence(national) {
  if (!national) return false;
  if (/^0+$/.test(national)) return true;
  if (isAllSameDigit(national)) return true;
  if (national === '1234567890' || national === '0123456789') return true;
  if (/^(\d{2,4})\1+$/.test(national)) return true;
  return false;
}

function result(partial) {
  const reasonCode = partial.reasonCode || VALIDATION_REASON_CODES.UNKNOWN_FORMAT;
  return {
    originalNumber: partial.originalNumber ?? '',
    normalizedNumber: partial.normalizedNumber ?? null,
    countryCode: partial.countryCode ?? null,
    nationalNumber: partial.nationalNumber ?? null,
    validationStatus: partial.validationStatus || VALIDATION_STATUSES.UNKNOWN,
    validationReason: REASON_MESSAGES[reasonCode] || reasonCode,
    reasonCode,
    suggestedCorrection: partial.suggestedCorrection ?? null,
    eligibleForCampaign: partial.eligibleForCampaign === true,
    normalizedAt: new Date().toISOString(),
    validationVersion: NUMBER_HEALTH_VALIDATION_VERSION,
  };
}

/**
 * Normalize and validate a mobile number. Default country India (91).
 */
export function analyzeMobileNumber(raw, options = {}) {
  const defaultCountry = String(options.countryDefault || '91');
  const originalNumber = raw == null ? '' : String(raw);
  const trimmed = originalNumber.trim();

  if (!trimmed) {
    return result({
      originalNumber,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.EMPTY,
      eligibleForCampaign: false,
    });
  }

  if (hasUnsupportedChars(trimmed)) {
    return result({
      originalNumber,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.NON_NUMERIC,
      eligibleForCampaign: false,
    });
  }

  let digits = onlyDigits(trimmed);
  if (!digits) {
    return result({
      originalNumber,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.EMPTY,
      eligibleForCampaign: false,
    });
  }

  // Duplicate country code: 9191XXXXXXXX
  if (
    defaultCountry === '91' &&
    digits.length === 14 &&
    digits.startsWith('9191')
  ) {
    const national = digits.slice(4);
    return result({
      originalNumber,
      countryCode: '91',
      nationalNumber: national,
      normalizedNumber: null,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.DUPLICATE_COUNTRY_CODE,
      suggestedCorrection: national.length === 10 ? ('91' + national) : null,
      eligibleForCampaign: false,
    });
  }

  // Leading 0 for India local: 0XXXXXXXXXX
  if (defaultCountry === '91' && digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  let countryCode = null;
  let national = null;

  if (digits.length === 10 && defaultCountry === '91') {
    countryCode = '91';
    national = digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    countryCode = '91';
    national = digits.slice(2);
  } else if (digits.length >= 11 && digits.length <= 15) {
    // Generic E.164-ish: treat first 1-3 as country if not India-shaped
    if (digits.startsWith('91') && digits.length === 12) {
      countryCode = '91';
      national = digits.slice(2);
    } else if (defaultCountry === '91') {
      return result({
        originalNumber,
        validationStatus: VALIDATION_STATUSES.UNKNOWN,
        reasonCode: VALIDATION_REASON_CODES.UNKNOWN_FORMAT,
        eligibleForCampaign: false,
      });
    } else {
      return result({
        originalNumber,
        validationStatus: VALIDATION_STATUSES.UNKNOWN,
        reasonCode: VALIDATION_REASON_CODES.UNSUPPORTED_COUNTRY,
        eligibleForCampaign: false,
      });
    }
  } else if (digits.length < 10) {
    return result({
      originalNumber,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.TOO_SHORT,
      eligibleForCampaign: false,
    });
  } else {
    return result({
      originalNumber,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.TOO_LONG,
      eligibleForCampaign: false,
    });
  }

  if (countryCode !== '91') {
    return result({
      originalNumber,
      countryCode,
      nationalNumber: national,
      validationStatus: VALIDATION_STATUSES.UNKNOWN,
      reasonCode: VALIDATION_REASON_CODES.UNSUPPORTED_COUNTRY,
      eligibleForCampaign: false,
    });
  }

  if (!national || national.length !== 10) {
    return result({
      originalNumber,
      countryCode,
      nationalNumber: national,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: national && national.length < 10 ? VALIDATION_REASON_CODES.TOO_SHORT : VALIDATION_REASON_CODES.TOO_LONG,
      eligibleForCampaign: false,
    });
  }

  if (isDummySequence(national) || isDummySequence(digits)) {
    return result({
      originalNumber,
      countryCode,
      nationalNumber: national,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.DUMMY_NUMBER,
      eligibleForCampaign: false,
    });
  }

  // Indian landline often starts with 0STD; mobile must be 6-9
  const first = national[0];
  if (!/[6-9]/.test(first)) {
    // 1-5 often landline/special
    if (/[1-5]/.test(first)) {
      return result({
        originalNumber,
        countryCode,
        nationalNumber: national,
        validationStatus: VALIDATION_STATUSES.INVALID,
        reasonCode: VALIDATION_REASON_CODES.LANDLINE_NOT_SUPPORTED,
        eligibleForCampaign: false,
      });
    }
    return result({
      originalNumber,
      countryCode,
      nationalNumber: national,
      validationStatus: VALIDATION_STATUSES.INVALID,
      reasonCode: VALIDATION_REASON_CODES.INVALID_MOBILE_PREFIX,
      eligibleForCampaign: false,
    });
  }

  const normalizedNumber = String(countryCode) + String(national);
  return result({
    originalNumber,
    normalizedNumber,
    countryCode,
    nationalNumber: national,
    validationStatus: VALIDATION_STATUSES.VALID,
    reasonCode: VALIDATION_REASON_CODES.OK,
    eligibleForCampaign: true,
  });
}

/** Compatibility helper — returns normalized string or null (same spirit as normalizeMobile). */
export function normalizeMobileStrict(raw, countryDefault = '91') {
  const analyzed = analyzeMobileNumber(raw, { countryDefault });
  return analyzed.validationStatus === VALIDATION_STATUSES.VALID ? analyzed.normalizedNumber : null;
}
