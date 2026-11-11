import { describe, expect, it } from 'vitest';
import { checkForUpdate } from './appUpdate';

const respond = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('checkForUpdate', () => {
  it('cùng phiên bản → đã là bản mới nhất', async () => {
    expect(await checkForUpdate('2.23.1', '/version.json', respond({ version: '2.23.1' }), true)).toEqual({ status: 'latest' });
  });

  it('khác phiên bản → có bản mới', async () => {
    expect(await checkForUpdate('2.23.1', '/version.json', respond({ version: ' 2.24.2\n' }), true)).toEqual({
      status: 'available',
      version: '2.24.2',
    });
  });

  it('offline → không gọi mạng', async () => {
    const boom = (async () => {
      throw new Error('không được gọi');
    }) as unknown as typeof fetch;
    expect(await checkForUpdate('1', '/v', boom, false)).toEqual({ status: 'offline' });
  });

  it('lỗi HTTP, JSON sai, lỗi mạng → error', async () => {
    expect(await checkForUpdate('1', '/v', respond({ version: '2' }, false), true)).toEqual({ status: 'error' });
    expect(await checkForUpdate('1', '/v', respond({ v: 2 }), true)).toEqual({ status: 'error' });
    expect(await checkForUpdate('1', '/v', respond(null), true)).toEqual({ status: 'error' });
    const fail = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(await checkForUpdate('1', '/v', fail, true)).toEqual({ status: 'error' });
  });
});
