import { vi } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';

// Each test file must call vi.mock('pdfjs-dist', ...) at the top level
// for vitest to hoist it properly. This helper only provides the
// mockPdfDocument function that configures the mock per-test.

export function mockPdfDocument(items: { str: string }[]) {
  const getDocumentMock = vi.mocked(pdfjsLib.getDocument);

  getDocumentMock.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({ items })
      })
    })
  } as unknown as ReturnType<typeof pdfjsLib.getDocument>);
}
