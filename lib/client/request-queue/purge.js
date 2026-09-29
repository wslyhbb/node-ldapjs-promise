import { TimeoutError } from '../../errors/index.js';

/**
 * Removes all pending requests from the queue after a timeout.
 *
 * The caller is responsible for rejecting each request because the queue does
 * not own request completion.
 *
 * @returns {Promise<Array<object>>} The requests that timed out.
 */
export default async function purge() {
    const requests = await this.flush();
    const error = new TimeoutError('request queue timeout');
    return requests.map(request => ({ request, error }));
};
