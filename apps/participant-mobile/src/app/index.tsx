import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { hasSupabaseEnvironment, supabase } from "@/lib/supabase";

type Enrollment = {
  participant_id: string;
  condition_name: string;
  session_id: string;
  session_mode: "time_controlled" | "stimulus_controlled";
  session_duration_seconds: number | null;
  time_display: string;
  post_order_mode: string;
};

export default function HomeScreen() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const join = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data.session) {
        const anonymousResult = await supabase.auth.signInAnonymously();
        if (anonymousResult.error) throw anonymousResult.error;
      }
      const { data, error: joinError } = await supabase.rpc("join_study", {
        target_code: code.trim().toUpperCase(),
      });
      if (joinError) throw joinError;
      const result = (data as Enrollment[] | null)?.[0];
      if (!result) throw new Error("The study did not return an assignment.");
      setEnrollment(result);
      router.replace({ pathname: "/feed", params: { sessionId: result.session_id } });
    } catch (joinFailure) {
      setError(joinFailure instanceof Error ? joinFailure.message : "Unable to join the study.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Research participant</Text>
          <Text style={styles.title}>Enter your study code</Text>
          <Text style={styles.body}>Your device uses an anonymous identifier. No participant profile is created.</Text>
          {!hasSupabaseEnvironment ? (
            <Text style={styles.error}>Participant Supabase environment variables are missing.</Text>
          ) : enrollment ? (
            <View style={styles.successPanel}>
              <Text style={styles.successTitle}>Assignment ready</Text>
              <Text style={styles.body}>Condition: {enrollment.condition_name}</Text>
              <Text style={styles.detail}>Session: {enrollment.session_id}</Text>
              <Text style={styles.detail}>Returning with the same anonymous identity will preserve this assignment.</Text>
              <Text style={styles.pending}>Your assigned feed is ready.</Text>
              <Pressable style={styles.button} onPress={() => router.replace({ pathname: "/feed", params: { sessionId: enrollment.session_id } })}>
                <Text style={styles.buttonText}>Open assigned feed</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
                maxLength={12}
                onChangeText={setCode}
                placeholder="AB12CD34"
                placeholderTextColor="#7f8b84"
                style={styles.input}
                value={code}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable disabled={loading || !code.trim()} onPress={join} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (loading || !code.trim()) && styles.buttonDisabled]}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join study</Text>}
              </Pressable>
            </>
          )}
          {__DEV__ ? <Link href="/playback-spike" style={styles.link}>Diagnostic playback spike (not the assigned study)</Link> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#10231c", flex: 1 },
  container: { alignItems: "center", flex: 1, justifyContent: "center", padding: 22 },
  card: { backgroundColor: "#f7f8f4", borderRadius: 22, gap: 14, maxWidth: 430, padding: 26, width: "100%" },
  eyebrow: { color: "#5a7969", fontSize: 11, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: "#17241e", fontSize: 31, fontWeight: "700" },
  body: { color: "#55635c", fontSize: 15, lineHeight: 22 },
  input: { borderColor: "#aebbb3", borderRadius: 12, borderWidth: 1, color: "#17241e", fontSize: 22, fontWeight: "700", letterSpacing: 3, padding: 15, textAlign: "center" },
  button: { alignItems: "center", backgroundColor: "#1f5b3f", borderRadius: 12, minHeight: 50, justifyContent: "center", padding: 13 },
  buttonPressed: { backgroundColor: "#174831" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { backgroundColor: "#ffebe8", borderRadius: 8, color: "#9a3129", padding: 10 },
  successPanel: { backgroundColor: "#e4f1e8", borderRadius: 12, gap: 7, padding: 15 },
  successTitle: { color: "#245a39", fontSize: 20, fontWeight: "800" },
  detail: { color: "#5b6a62", fontSize: 11 },
  pending: { color: "#355a45", fontSize: 13, fontWeight: "700", marginTop: 6 },
  link: { color: "#466b58", marginTop: 5, textAlign: "center", textDecorationLine: "underline" },
});
