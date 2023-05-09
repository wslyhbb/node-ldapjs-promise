/// <reference types="node" />

import {
  Change,
  Control,
  createClient as _createClient,
  SearchCallbackResponse,
  SearchEntryObject,
  SearchOptions,
  SearchReference
} from 'ldapjs'

import {EventEmitter} from 'events'

export * from 'ldapjs'

export interface Client extends EventEmitter {
  // connected: boolean

  bind(dn: string, password: string, controls?: Control | Array<Control>): Promise<void>

  add(name: string, entry: Object, controls?: Control | Array<Control>): Promise<void>

  compare(name: string, attr: string, value: string, controls?: Control | Array<Control>): Promise<boolean | undefined>

  del(name: string, controls?: Control | Array<Control>): Promise<void>

  exop(name: string, value: string, controls?: Control | Array<Control>): Promise<{
    value: string,
    response: any
  }>

  modify(name: string, change: Change | Array<Change>, controls?: Control | Array<Control>): Promise<void>

  modifyDN(name: string, newName: string, controls?: Control | Array<Control>): Promise<void>

  search(base: string, options?: SearchOptions, controls?: Control | Array<Control>): Promise<SearchCallbackResponse>

  starttls(options: Object, controls?: Control | Array<Control>): Promise<void>

  unbind(): Promise<void>

  destroy(err?: any): Promise<void>

  // Additional methods
  searchReturnAll(base: string, options?: SearchOptions, controls?: Control | Array<Control>): Promise<{
    entries: Array<SearchEntry>,
    referrals: Array<SearchReference>
  }>

  findUser(base: string, username: string, options?: SearchOptions): Promise<any>

  userInGroup(base: string, username: string, groupName: string): Promise<boolean>
}

export declare const createClient: {
  (...args: Parameters<typeof _createClient>): Client
}
