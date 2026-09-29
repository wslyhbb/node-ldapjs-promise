// https://tools.ietf.org/html/rfc4511#section-4.1.1
// Message identifiers are an integer between (0, maxint).
export const MAX_MSGID = Math.pow(2, 31) - 1;
