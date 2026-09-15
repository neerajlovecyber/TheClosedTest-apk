import React, { useState, useEffect } from "react";
import { View, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { ServerIcon, CheckCircle2Icon, AlertCircleIcon, RefreshCwIcon, GlobeIcon, RotateCcwIcon, ZapIcon } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { getApiBaseUrl, getApiEnv, setCustomApiUrl, setApiEnv, TS_PROD_URL, RUST_PROD_URL, LOCAL_API_URL, type ApiEnv } from "@/lib/api";

export function AdminServerUrlCard() {
  const queryClient = useQueryClient();
  const [currentUrl, setCurrentUrl] = useState<string>(getApiBaseUrl());
  const [inputUrl, setInputUrl] = useState<string>(getApiBaseUrl());
  const [env, setEnv] = useState<ApiEnv>(getApiEnv());
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  useEffect(() => {
    const active = getApiBaseUrl();
    setCurrentUrl(active);
    setInputUrl(active);
    setEnv(getApiEnv());
  }, []);

  const handleTestConnection = async (targetUrl?: string) => {
    const urlToTest = (targetUrl || inputUrl).trim().replace(/\/+$/, "");
    if (!urlToTest.startsWith("http://") && !urlToTest.startsWith("https://")) {
      setTestResult({
        success: false,
        message: "URL must start with http:// or https://",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      // Try /health or /api/health
      let res: Response;
      try {
        res = await fetch(`${urlToTest}/api/health`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
      } catch {
        res = await fetch(`${urlToTest}/health`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const latency = Date.now() - start;

      if (res.ok) {
        let label = "Online";
        try {
          const json = await res.json();
          if (json.status) label = json.status.toUpperCase();
          if (json.service) label += ` (${json.service})`;
        } catch {
          // ignore json parse error
        }

        setTestResult({
          success: true,
          message: `Reachable [${res.status}] · ${label}`,
          latency,
        });
      } else {
        setTestResult({
          success: false,
          message: `Server returned HTTP ${res.status}: ${res.statusText}`,
          latency,
        });
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      const isTimeout = err?.name === "AbortError";
      setTestResult({
        success: false,
        message: isTimeout ? "Timed out after 6s (Unreachable)" : (err?.message || "Connection refused"),
        latency,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleApplyUrl = async (newUrl: string) => {
    const cleaned = newUrl.trim().replace(/\/+$/, "");
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      Alert.alert("Invalid URL", "Please enter a valid URL starting with http:// or https://");
      return;
    }

    await setCustomApiUrl(cleaned);
    const updated = getApiBaseUrl();
    setCurrentUrl(updated);
    setInputUrl(updated);
    setEnv(getApiEnv());
    setTestResult(null);

    await queryClient.invalidateQueries();

    const isRustNow = updated.replace(/\/+$/, "") === RUST_PROD_URL;
    Toast.show({
      type: "success",
      text1: isRustNow ? "Connected to Rust Backend 🦀" : "Connected to Server",
      text2: updated,
    });
  };

  const handlePreset = async (presetUrl: string, presetEnv: ApiEnv) => {
    setInputUrl(presetUrl);
    await setApiEnv(presetEnv);
    const updated = getApiBaseUrl();
    setCurrentUrl(updated);
    setEnv(getApiEnv());
    setTestResult(null);

    await queryClient.invalidateQueries();

    Toast.show({
      type: "success",
      text1: presetEnv === "rust" ? "Switched to Rust Backend 🦀" : presetEnv === "ts" ? "Switched to TypeScript Backend" : "Switched to Local Server",
      text2: updated,
    });
  };

  const isRust = env === "rust";
  const isTs = env === "ts";
  const isCustom = env === "custom";
  const isLocal = env === "local";

  return (
    <Card className="border-border shadow-sm mb-4 bg-card">
      <CardContent className="p-4">
        {/* Header */}
        <View className="flex-row items-center gap-2.5 mb-3">
          <View className={`p-2 rounded-xl ${isRust ? "bg-orange-500/15" : "bg-sky-500/10"}`}>
            <Icon as={isRust ? ZapIcon : ServerIcon} className={`size-5 ${isRust ? "text-orange-500" : "text-sky-500"}`} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-foreground">Backend Server Endpoint</Text>
            <Text className="text-xs text-muted-foreground">Switch between hosted Rust &amp; TS backends live</Text>
          </View>
        </View>

        {/* Current Active URL Display */}
        <View className="bg-muted/40 dark:bg-muted/20 border border-border/70 rounded-lg p-2.5 mb-3">
          <Text className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Active Target</Text>
          <Text className="text-xs font-mono text-foreground select-all" numberOfLines={2}>
            {currentUrl}
          </Text>
        </View>

        {/* Presets: Rust vs TS vs Local */}
        <View className="flex-row items-center gap-2 mb-3">
          {/* Rust Backend Button */}
          <TouchableOpacity
            onPress={() => void handlePreset(RUST_PROD_URL, "rust")}
            className={`flex-1 py-2 px-2.5 rounded-lg border items-center justify-center flex-row gap-1.5 ${
              isRust
                ? "bg-orange-500/15 border-orange-500/50 shadow-sm"
                : "bg-background border-border/70 active:bg-muted/50"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isRust ? "text-orange-600 dark:text-orange-400" : "text-foreground"
              }`}
            >
              🦀 Rust Backend
            </Text>
          </TouchableOpacity>

          {/* TS Backend Button */}
          <TouchableOpacity
            onPress={() => void handlePreset(TS_PROD_URL, "ts")}
            className={`flex-1 py-2 px-2.5 rounded-lg border items-center justify-center flex-row gap-1.5 ${
              isTs
                ? "bg-sky-500/15 border-sky-500/50 shadow-sm"
                : "bg-background border-border/70 active:bg-muted/50"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isTs ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
              }`}
            >
              TS Backend
            </Text>
          </TouchableOpacity>

          {/* Reset / Local button */}
          <TouchableOpacity
            onPress={() => void handlePreset(LOCAL_API_URL, "local")}
            className={`py-2 px-2.5 rounded-lg border items-center justify-center ${
              isLocal
                ? "bg-amber-500/15 border-amber-500/50"
                : "bg-background border-border/70 active:bg-muted/50"
            }`}
            accessibilityLabel="Local Dev Server"
          >
            <Text className={`text-xs font-semibold ${isLocal ? "text-amber-600" : "text-muted-foreground"}`}>
              Local
            </Text>
          </TouchableOpacity>
        </View>

        {/* Custom URL Input */}
        <View className="mb-3">
          <Text className="text-xs font-semibold text-foreground mb-1.5">Custom Endpoint Link</Text>
          <Input
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="https://p01--backend-rs--..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            className="text-xs font-mono h-10 px-3"
          />
        </View>

        {/* Ping result alert */}
        {testResult && (
          <View
            className={`p-2.5 rounded-lg border flex-row items-center gap-2 mb-3 ${
              testResult.success
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800"
            }`}
          >
            <Icon
              as={testResult.success ? CheckCircle2Icon : AlertCircleIcon}
              className={`size-4 shrink-0 ${
                testResult.success ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            />
            <View className="flex-1">
              <Text
                className={`text-xs font-medium ${
                  testResult.success ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"
                }`}
                numberOfLines={2}
              >
                {testResult.message}
              </Text>
              {testResult.latency !== undefined && (
                <Text className="text-[10px] text-muted-foreground">Ping: {testResult.latency}ms</Text>
              )}
            </View>
          </View>
        )}

        {/* Actions */}
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => void handleTestConnection()}
            disabled={isTesting}
            className="flex-1 py-2 px-3 rounded-lg border border-border bg-muted/40 active:bg-muted flex-row items-center justify-center gap-1.5"
          >
            {isTesting ? (
              <ActivityIndicator size="small" color="#ea580c" />
            ) : (
              <Icon as={GlobeIcon} className="size-4 text-sky-600 dark:text-sky-400" />
            )}
            <Text className="text-xs font-semibold text-foreground">
              {isTesting ? "Testing..." : "Test Connection"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void handleApplyUrl(inputUrl)}
            className="flex-1 py-2 px-3 rounded-lg bg-primary active:opacity-90 flex-row items-center justify-center gap-1.5 shadow-sm"
          >
            <Icon as={RefreshCwIcon} className="size-4 text-primary-foreground" />
            <Text className="text-xs font-semibold text-primary-foreground">Save &amp; Switch</Text>
          </TouchableOpacity>
        </View>
      </CardContent>
    </Card>
  );
}
