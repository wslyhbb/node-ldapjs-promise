import {expectType} from 'tsd'
import {
  createClient,
  Client,
  Change,
  SearchCallbackResponse,
  SearchEntry,
  SearchReference
} from '.'

expectType<Client>(createClient())

const client = createClient()

expectType<Promise<void>>(client.bind('cn=foo', 'bar'))
expectType<Promise<void>>(client.bind('cn=foo', 'bar', {}))
expectType<Promise<void>>(client.bind('cn=foo', 'bar', []))
expectType<Promise<void>>(client.bind('cn=foo', 'bar', [{}]))

expectType<Promise<void>>(client.add('cn=foo', {}))
expectType<Promise<void>>(client.add('cn=foo', {}, []))
expectType<Promise<void>>(client.add('cn=foo', {}, {}))

expectType<Promise<boolean | undefined>>(client.compare('cn=foo', 'bar', 'baz'))
expectType<Promise<boolean | undefined>>(client.compare('cn=foo', 'bar', 'baz', {}))
expectType<Promise<boolean | undefined>>(client.compare('cn=foo', 'bar', 'baz', []))

expectType<Promise<void>>(client.del('cn=foo'))
expectType<Promise<void>>(client.del('cn=foo', {}))

expectType<Promise<{ value: string, response: any }>>(client.exop('cn=foo', 'bar'))
expectType<Promise<{ value: string, response: any }>>(client.exop('cn=foo', 'bar', {}))

const change: Change = {
  operation: 'op',
  modification: {}
}
expectType<Promise<void>>(client.modify('cn=foo', change))
expectType<Promise<void>>(client.modify('cn=foo', [change]))
expectType<Promise<void>>(client.modify('cn=foo', [change], []))

expectType<Promise<void>>(client.modifyDN('cn=foo', 'bar'))
expectType<Promise<void>>(client.modifyDN('cn=foo', 'bar', []))

expectType<Promise<SearchCallbackResponse>>(client.search('cn=foo'))
expectType<Promise<SearchCallbackResponse>>(client.search('cn=foo', {scope: 'sub'}))
expectType<Promise<SearchCallbackResponse>>(client.search('cn=foo', {filter: '(objectclass=*)'}))
expectType<Promise<SearchCallbackResponse>>(client.search('cn=foo', {filter: '(objectclass=*)'}, {}))

expectType<Promise<void>>(client.starttls('cn=foo'))
expectType<Promise<void>>(client.starttls('cn=foo', {}))

expectType<Promise<void>>(client.unbind())

expectType<Promise<void>>(client.destroy())
expectType<Promise<void>>(client.destroy(new Error()))

type SearchResult = {
  entries: SearchEntry[],
  referrals: SearchReference[]
}
expectType<Promise<SearchResult>>(client.searchReturnAll('cn=foo'))
expectType<Promise<SearchResult>>(client.searchReturnAll('cn=foo', {scope: 'base'}))
expectType<Promise<SearchResult>>(client.searchReturnAll('cn=foo', {scope: 'base'}, []))

expectType<Promise<any>>(client.findUser('cn=foo', 'bar'))
expectType<Promise<any>>(client.findUser('cn=foo', 'bar', {scope: 'sub'}))

expectType<Promise<boolean>>(client.userInGroup('cn=foo', 'bar', 'baz'))
