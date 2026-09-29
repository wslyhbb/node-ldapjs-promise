import assertPlus from 'assert-plus';

const { ok, number } = assertPlus;

import { LDAPResult } from '../messages/index.js';

/// --- Globals

import * as CODES from './codes.js';
const ERRORS = [];
const exportsMap = {};

export class LDAPError extends Error {
    constructor(message, dn, caller) {
        super(message);
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, caller || LDAPError);
        }

        this.lde_message = message;
        this.lde_dn = dn;
    }
    
    get name() {
        return 'LDAPError';
    }

    get code() {
        return CODES.LDAP_OTHER;
    }

    get message() {
        return this.lde_message || this.name;
    }

    set message(message) {
        this.lde_message = message;
    }

    get dn() {
        return this.lde_dn ? this.lde_dn.toString() : '';
    }
}

/// --- Exported API

export function getError(res) {
    ok(res instanceof LDAPResult, 'res (LDAPResult) required')
    
    const errObj = ERRORS[res.status];
    const E = exportsMap[errObj.err];
    return new E(res.errorMessage || errObj.message,
        res.matchedDN || null,
        getError);
}

export function getMessage(code) {    
    number(code, 'code (number) required');
    
    const errObj = ERRORS[code];
    return (errObj && errObj.message ? errObj.message : '');
}

// Some whacky games here to make sure all the codes are exported
for (const [code, codeValue] of Object.entries(CODES)) {
    exportsMap[code] = codeValue;

    if (code === 'LDAP_SUCCESS') continue;
    
    // Transform LDAP_OPERATIONS_ERROR -> OperationsError and Operations Error
    const pieces = code.split('_').slice(1);
    const formattedPieces = pieces.map(p => p.charAt(0)
        .toUpperCase() + p.slice(1).toLowerCase());
    
    let err = formattedPieces.join('');
    const msg = formattedPieces.join(' ');

    if (!err.endsWith('Error')) {
        err += 'Error';
    }
    
    // At this point LDAP_OPERATIONS_ERROR is now OperationsError in $err
    // and 'Operations Error' in $msg
    exportsMap[err] = class extends LDAPError {
        get name() {
            return err;
        }
        get code() {
            return codeValue;
        }
    };
  
    ERRORS[codeValue] = {
        err,
        message: msg
    };
}

export class ConnectionError extends LDAPError {
    constructor(message) {
        super(message, null, ConnectionError);
    }
    
    get name() {
        return 'ConnectionError';
    }
}

export class AbandonedError extends LDAPError {
    constructor(message) {
        super(message, null, AbandonedError);
    }
    
    get name() {
        return 'AbandonedError';
    }
}

export class TimeoutError extends LDAPError {
    constructor(message) {
        super(message, null, TimeoutError);
    }
    
    get name() {
        return 'TimeoutError';
    }
}

export const {
    LDAP_SUCCESS,
    LDAP_OPERATIONS_ERROR,
    LDAP_PROTOCOL_ERROR,
    LDAP_TIME_LIMIT_EXCEEDED,
    LDAP_SIZE_LIMIT_EXCEEDED,
    LDAP_COMPARE_FALSE,
    LDAP_COMPARE_TRUE,
    LDAP_AUTH_METHOD_NOT_SUPPORTED,
    LDAP_STRONG_AUTH_REQUIRED,
    LDAP_REFERRAL,
    LDAP_ADMIN_LIMIT_EXCEEDED,
    LDAP_UNAVAILABLE_CRITICAL_EXTENSION,
    LDAP_CONFIDENTIALITY_REQUIRED,
    LDAP_SASL_BIND_IN_PROGRESS,
    LDAP_NO_SUCH_ATTRIBUTE,
    LDAP_UNDEFINED_ATTRIBUTE_TYPE,
    LDAP_INAPPROPRIATE_MATCHING,
    LDAP_CONSTRAINT_VIOLATION,
    LDAP_ATTRIBUTE_OR_VALUE_EXISTS,
    LDAP_INVALID_ATTRIBUTE_SYNTAX,
    LDAP_NO_SUCH_OBJECT,
    LDAP_ALIAS_PROBLEM,
    LDAP_INVALID_DN_SYNTAX,
    LDAP_ALIAS_DEREF_PROBLEM,
    LDAP_INAPPROPRIATE_AUTHENTICATION,
    LDAP_INVALID_CREDENTIALS,
    LDAP_INSUFFICIENT_ACCESS_RIGHTS,
    LDAP_BUSY,
    LDAP_UNAVAILABLE,
    LDAP_UNWILLING_TO_PERFORM,
    LDAP_LOOP_DETECT,
    LDAP_SORT_CONTROL_MISSING,
    LDAP_INDEX_RANGE_ERROR,
    LDAP_NAMING_VIOLATION,
    LDAP_OBJECTCLASS_VIOLATION,
    LDAP_NOT_ALLOWED_ON_NON_LEAF,
    LDAP_NOT_ALLOWED_ON_RDN,
    LDAP_ENTRY_ALREADY_EXISTS,
    LDAP_OBJECTCLASS_MODS_PROHIBITED,
    LDAP_AFFECTS_MULTIPLE_DSAS,
    LDAP_CONTROL_ERROR,
    LDAP_OTHER,
    LDAP_PROXIED_AUTHORIZATION_DENIED,
    OperationsError,
    ProtocolError,
    TimeLimitExceededError,
    SizeLimitExceededError,
    CompareFalseError,
    CompareTrueError,
    AuthMethodNotSupportedError,
    StrongAuthRequiredError,
    ReferralError,
    AdminLimitExceededError,
    UnavailableCriticalExtensionError,
    ConfidentialityRequiredError,
    SaslBindInProgressError,
    NoSuchAttributeError,
    UndefinedAttributeTypeError,
    InappropriateMatchingError,
    ConstraintViolationError,
    AttributeOrValueExistsError,
    InvalidAttributeSyntaxError,
    NoSuchObjectError,
    AliasProblemError,
    InvalidDnSyntaxError,
    AliasDerefProblemError,
    InappropriateAuthenticationError,
    InvalidCredentialsError,
    InsufficientAccessRightsError,
    BusyError,
    UnavailableError,
    UnwillingToPerformError,
    LoopDetectError,
    SortControlMissingError,
    IndexRangeError,
    NamingViolationError,
    ObjectclassViolationError,
    NotAllowedOnNonLeafError,
    NotAllowedOnRdnError,
    EntryAlreadyExistsError,
    ObjectclassModsProhibitedError,
    AffectsMultipleDsasError,
    ControlError,
    OtherError,
    ProxiedAuthorizationDeniedError
} = exportsMap;
