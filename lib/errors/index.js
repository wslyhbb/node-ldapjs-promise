'use strict';

const assert = require('assert-plus');

const { LDAPResult } = require('../messages');

/// --- Globals

const CODES = require('./codes');
const ERRORS = [];

class LDAPError extends Error {
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

function getError(res) {
    assert.ok(res instanceof LDAPResult, 'res (LDAPResult) required')
    
    const errObj = ERRORS[res.status];
    const E = module.exports[errObj.err];
    return new E(res.errorMessage || errObj.message,
        res.matchedDN || null,
        module.exports.getError);
}

function getMessage(code) {    
    assert.number(code, 'code (number) required');
    
    const errObj = ERRORS[code];
    return (errObj && errObj.message ? errObj.message : '');
}

/// --- Exported API

module.exports = {
    LDAPError,
    getError,
    getMessage
};

// Some whacky games here to make sure all the codes are exported
for (const [code, codeValue] of Object.entries(CODES)) {
    module.exports[code] = codeValue;

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
    module.exports[err] = class extends LDAPError {
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

class ConnectionError extends LDAPError {
    constructor(message) {
        super(message, null, ConnectionError);
    }
    
    get name() {
        return 'ConnectionError';
    }
}

module.exports.ConnectionError = ConnectionError;

class AbandonedError extends LDAPError {
    constructor(message) {
        super(message, null, AbandonedError);
    }
    
    get name() {
        return 'AbandonedError';
    }
}

module.exports.AbandonedError = AbandonedError;

class TimeoutError extends LDAPError {
    constructor(message) {
        super(message, null, TimeoutError);
    }
    
    get name() {
        return 'TimeoutError';
    }
}

module.exports.TimeoutError = TimeoutError;
