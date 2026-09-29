import messages from '@ldapjs/messages';

const {
    LdapMessage,
    LdapResult,
    AbandonRequest,
    AbandonResponse,
    AddRequest,
    AddResponse,
    BindRequest,
    BindResponse,
    CompareRequest,
    CompareResponse,
    DeleteRequest,
    DeleteResponse,
    ExtensionRequest,
    ExtensionResponse,
    ModifyRequest,
    ModifyResponse,
    ModifyDnRequest,
    ModifyDnResponse,
    SearchRequest,
    SearchResultEntry,
    SearchResultReference,
    UnbindRequest
} = messages;

import Parser from './parser.js';

import SearchResponse from './search_response.js';

/// --- API

export {
    LdapMessage as LDAPMessage,
    LdapResult as LDAPResult,
    Parser,
    
    AbandonRequest,
    AbandonResponse,
    AddRequest,
    AddResponse,
    BindRequest,
    BindResponse,
    CompareRequest,
    CompareResponse,
    DeleteRequest,
    DeleteResponse,
    ExtensionRequest as ExtendedRequest,
    ExtensionResponse as ExtendedResponse,
    ModifyRequest,
    ModifyResponse,
    ModifyDnRequest as ModifyDNRequest,
    ModifyDnResponse as ModifyDNResponse,
    SearchRequest,
    SearchResultEntry as SearchEntry,
    SearchResultReference as SearchReference,
    SearchResponse,
    UnbindRequest
};
