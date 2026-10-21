import {
  downloadBlob,
  filenameFromContentDisposition,
  readBlobText,
} from '../../../src/renderer/utils/downloadBlob';

describe('filenameFromContentDisposition', () => {
  it.each([
    ['attachment; filename="pocket-list.pdf"', 'pocket-list.pdf'],
    ['attachment; filename=pocket-list.pdf', 'pocket-list.pdf'],
    [
      'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'caf%C3%A9.pdf',
      'café.pdf',
    ],
    ['attachment; filename="../../etc/passwd"', '.._.._etc_passwd'],
  ])('%s → %s', (header, expected) => {
    expect(filenameFromContentDisposition(header)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['attachment'],
    ['attachment; filename=""'],
  ])('returns null for %p', header => {
    expect(filenameFromContentDisposition(header)).toBeNull();
  });
});

describe('downloadBlob', () => {
  it('clicks a temporary link with the filename and revokes the URL', () => {
    jest.useFakeTimers();
    const createObjectURL = jest.fn(() => 'blob:url');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: globalThis.HTMLAnchorElement) {
        expect(this.download).toBe('list.pdf');
        expect(this.href).toBe('blob:url');
      });

    downloadBlob(new Blob(['x']), 'list.pdf');

    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:url');
    click.mockRestore();
    jest.useRealTimers();
  });
});

describe('readBlobText', () => {
  it('reads a blob as text', async () => {
    await expect(readBlobText(new Blob(['{"error":"x"}']))).resolves.toBe(
      '{"error":"x"}'
    );
  });
});
