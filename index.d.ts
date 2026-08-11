/// <reference types="node" />

import {
  Client
} from './types'
import {
  createClient as _createClient
} from 'ldapjs'

export * from './types'

export declare const createClient: {
  (...args: Parameters<typeof _createClient>): Client
}
