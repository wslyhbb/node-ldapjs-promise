import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

function uuid () {
  return randomBytes(16).toString('hex');
}

function getSock () {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\' + uuid();
  } else {
    return join(tmpdir(), uuid());
  }
}

export {
  getSock,
  uuid
};
