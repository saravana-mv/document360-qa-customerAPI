import { create } from "zustand";
import type { SwaggerSpec, ParsedTag, SpecFingerprint, SpecDiff } from "../types/spec.types";

interface SpecState {
  spec: SwaggerSpec | null;
  parsedTags: ParsedTag[];
  fingerprint: SpecFingerprint | null;
  loading: boolean;
  error: string | null;
  diff: SpecDiff | null;
  setSpec: (spec: SwaggerSpec, tags: ParsedTag[], fingerprint: SpecFingerprint) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setDiff: (diff: SpecDiff | null) => void;
}

export const useSpecStore = create<SpecState>((set) => ({
  spec: null,
  parsedTags: [],
  fingerprint: null,
  loading: false,
  error: null,
  diff: null,

  setSpec: (spec, parsedTags, fingerprint) => set({ spec, parsedTags, fingerprint, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setDiff: (diff) => set({ diff }),
}));
