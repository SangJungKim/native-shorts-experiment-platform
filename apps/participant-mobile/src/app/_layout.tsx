import { Stack } from "expo-router";
import Head from "expo-router/head";

export default function RootLayout() {
  return (
    <>
      <Head>
        <title>Native Shorts Participant</title>
        <meta content="Join a controlled short-video research study using a study code." name="description" />
      </Head>
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
