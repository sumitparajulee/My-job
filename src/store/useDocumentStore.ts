import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '@/db/database';
import type { DocketDocument, DocumentType } from '@/types/models';

interface DocumentState {
  documents: DocketDocument[];
  isReady: boolean;
  init: () => Promise<void>;
  addDocument: (file: File, type: DocumentType) => Promise<DocketDocument>;
  deleteDocument: (id: string) => Promise<void>;
}

const now = () => new Date().toISOString();

// Documents are small (resumes/cover letters), so base64-in-IndexedDB is
// fine — avoids needing a separate blob store or cloud upload just for
// local-only mode.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  isReady: false,

  init: async () => {
    if (get().isReady) return;
    const documents = await db.documents.toArray();
    set({
      documents: documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      isReady: true,
    });
  },

  addDocument: async (file, type) => {
    const data = await fileToBase64(file);
    const doc: DocketDocument = {
      id: nanoid(),
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.documents.add(doc);
    set({ documents: [doc, ...get().documents] });
    return doc;
  },

  deleteDocument: async (id) => {
    const prev = get().documents;
    set({ documents: prev.filter((d) => d.id !== id) });
    try {
      await db.documents.delete(id);
    } catch (err) {
      set({ documents: prev });
      throw err;
    }
  },
}));
