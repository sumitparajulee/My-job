import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '@/db/database';
import type { MessageTemplate, TemplateKind } from '@/types/models';

interface TemplateState {
  templates: MessageTemplate[];
  isReady: boolean;
  init: () => Promise<void>;
  createTemplate: (input: { name: string; kind: TemplateKind; subject?: string; body: string }) => Promise<MessageTemplate>;
  updateTemplate: (id: string, patch: Partial<Omit<MessageTemplate, 'id' | 'createdAt'>>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

const now = () => new Date().toISOString();

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  isReady: false,

  init: async () => {
    if (get().isReady) return;
    const templates = await db.templates.toArray();
    set({
      templates: templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      isReady: true,
    });
  },

  createTemplate: async (input) => {
    const template: MessageTemplate = {
      id: nanoid(),
      ...input,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.templates.add(template);
    set({ templates: [template, ...get().templates] });
    return template;
  },

  updateTemplate: async (id, patch) => {
    const prev = get().templates;
    const target = prev.find((t) => t.id === id);
    if (!target) return;
    const updated: MessageTemplate = { ...target, ...patch, updatedAt: now() };
    set({ templates: prev.map((t) => (t.id === id ? updated : t)) });
    try {
      await db.templates.put(updated);
    } catch (err) {
      set({ templates: prev });
      throw err;
    }
  },

  deleteTemplate: async (id) => {
    const prev = get().templates;
    set({ templates: prev.filter((t) => t.id !== id) });
    try {
      await db.templates.delete(id);
    } catch (err) {
      set({ templates: prev });
      throw err;
    }
  },
}));
