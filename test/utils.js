'use strict';
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function uuid () {
  return crypto.randomBytes(16).toString('hex');
}

function getSock () {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\' + uuid();
  } else {
    return path.join(os.tmpdir(), uuid());
  }
}

module.exports = {
  getSock,
  uuid
};
