const { EventEmitter } = require('events');

const assert = require('assert-plus');
const { BerReader } = require('@ldapjs/asn1');
const logger = require('../logger');

const messages = require('@ldapjs/messages');
const {
    AbandonRequest, AddRequest, AddResponse, BindRequest, BindResponse,
    CompareRequest, CompareResponse, DeleteRequest, DeleteResponse,
    ExtendedRequest, ExtendedResponse, ModifyRequest, ModifyResponse,
    ModifyDNRequest, ModifyDNResponse, SearchRequest,
    SearchResultEntry: SearchEntry, SearchResultReference: SearchReference,
    UnbindRequest, LDAPResult
} = messages;
const SearchResponse = require('./search_response');

const Protocol = require('@ldapjs/protocol');

/// --- API

class Parser extends EventEmitter {
    constructor(options = {}) {
        assert.object(options);
        super();

        this.buffer = null;
        this.log = options.log || logger;
    }

    /**
     * The LDAP server/client implementations will receive data from a stream
     * and feed it into this method. This method will collect that data into an
     * internal growing buffer. As that buffer fills with enough data to
     * constitute a valid LDAP message, the data will be parsed, emitted as a
     * message object, and reset the buffer to account for any next message in
     * the stream.
     */
    write(data) {
        if (!data || !Buffer.isBuffer(data)) {
            throw new TypeError('data (buffer) required');
        }

        let nextMessage = null;
        const self = this;

        function end() {
            if (nextMessage) { return self.write(nextMessage); }

            return true;
        }

        this.buffer = this.buffer ? Buffer.concat([this.buffer, data]) : data;

        let ber = new BerReader(this.buffer);

        let foundSeq = false;
        try {
            foundSeq = ber.readSequence();
        } catch (e) {
            this.emit('error', e);
        }
        
        if (!foundSeq || ber.remain < ber.length) {
            // ENOTENOUGH
            return false;
        } else if (ber.remain > ber.length) {
            // ETOOMUCH
        
            // This is an odd branch. Basically, it is setting `nextMessage` to
            // a buffer that represents data part of a message subsequent to
            // the one being processed. It then re-creates `ber` as a
            // representation of the message being processed and advances its
            // offset to the value position of the TLV.
        
            // Set `nextMessage` to the bytes subsequent to the current
            // message's value bytes. That is, slice from the byte immediately
            // following the current message's value bytes until the end of the
            // buffer.
            nextMessage = this.buffer.slice(ber.offset + ber.length);
        
            const currOffset = ber.offset;
            ber = new BerReader(ber.buffer.subarray(0, currOffset + ber.length));
            ber.readSequence();
        
            assert.equal(ber.remain, ber.length);
        }
        
        // If we are here, ber holds the message, and nextMessage is temporarily
        // pointing at the next sequence of data (if it exists)
        this.buffer = null;
        
        let message;
        try {
            if (Object.prototype.toString.call(ber) === '[object BerReader]') {
                // Parse the BER into a JavaScript object representation. The
                // message objects require the full sequence in order to
                // construct the object. At this point, we have already read
                // the sequence tag and length, so we need to rewind the buffer
                // a bit. The `.sequenceToReader` method does this for us.
                message = messages.LdapMessage.parse(ber.sequenceToReader());
            } else {
                // Bail here if peer isn't speaking protocol at all
                message = this.getMessage(ber);
            }
        
            if (!message) {
                return end();
            }
        
            // TODO: find a better way to handle logging now that messages and the
            // server are decoupled. ~ jsumners 2023-02-17
            message.log = this.log;
        } catch (e) {
            this.emit('error', e, message);
            return false;
        }
        
        this.emit('message', message);
        return end();
    }
    
    getMessage(ber) {
        assert.ok(ber);

        const messageId = ber.readInt();
        const type = ber.readSequence();

    let Message
    switch (type) {
        case Protocol.operations.LDAP_REQ_ABANDON:
            Message = AbandonRequest;
            break;

        case Protocol.operations.LDAP_REQ_ADD:
            Message = AddRequest;
            break;

        case Protocol.operations.LDAP_RES_ADD:
            Message = AddResponse;
            break;

        case Protocol.operations.LDAP_REQ_BIND:
            Message = BindRequest;
            break;

        case Protocol.operations.LDAP_RES_BIND:
            Message = BindResponse;
            break;

        case Protocol.operations.LDAP_REQ_COMPARE:
            Message = CompareRequest;
            break;

        case Protocol.operations.LDAP_RES_COMPARE:
            Message = CompareResponse;
            break;

        case Protocol.operations.LDAP_REQ_DELETE:
            Message = DeleteRequest;
            break;

        case Protocol.operations.LDAP_RES_DELETE:
            Message = DeleteResponse;
            break;

        case Protocol.operations.LDAP_REQ_EXTENSION:
            Message = ExtendedRequest;
            break;

        case Protocol.operations.LDAP_RES_EXTENSION:
            Message = ExtendedResponse;
            break;

        case Protocol.operations.LDAP_REQ_MODIFY:
            Message = ModifyRequest;
            break;

        case Protocol.operations.LDAP_RES_MODIFY:
            Message = ModifyResponse;
            break;

        case Protocol.operations.LDAP_REQ_MODRDN:
            Message = ModifyDNRequest;
            break;

        case Protocol.operations.LDAP_RES_MODRDN:
            Message = ModifyDNResponse;
            break;

        case Protocol.operations.LDAP_REQ_SEARCH:
            Message = SearchRequest;
            break;

        case Protocol.operations.LDAP_RES_SEARCH_ENTRY:
            Message = SearchEntry;
            break;

        case Protocol.operations.LDAP_RES_SEARCH_REF:
            Message = SearchReference;
            break;

        case Protocol.operations.LDAP_RES_SEARCH:
            Message = SearchResponse;
            break;

        case Protocol.operations.LDAP_REQ_UNBIND:
            Message = UnbindRequest;
            break;

        default:
            this.emit('error',
                new Error('Op 0x' + (type ? type.toString(16) : '??') +
                                ' not supported'),
                new LDAPResult({
                    messageId,
                    protocolOp: type || Protocol.operations.LDAP_RES_EXTENSION
                }));

            return false;
        }

        return new Message({
            messageId,
            log: self.log
        });
    }
}

/// --- Exports

module.exports = Parser