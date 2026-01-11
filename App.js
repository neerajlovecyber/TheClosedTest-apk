import { ExpoRoot } from 'expo-router';
import Head from 'expo-router/head';

// Create a context for the app directory
const ctx = require.context('./app');

export default function App() {
    return <ExpoRoot context={ctx} />;
}
