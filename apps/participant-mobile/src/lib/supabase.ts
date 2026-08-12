import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serverStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => undefined,
  removeItem: async (_key: string) => undefined,
};
const authStorage = typeof window === "undefined" ? serverStorage : AsyncStorage;

export const hasSupabaseEnvironment = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || "http://127.0.0.1:54321", supabaseAnonKey || "missing", {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
