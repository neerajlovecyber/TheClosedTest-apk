import React, { useState, useMemo } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeftIcon,
  LogOutIcon,
  Trash2Icon,
  FlameIcon,
  StarIcon,
  SmartphoneIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from "lucide-react-native";
import { toast } from "@/lib/sonner";
import { useCurrentUser, useDeleteAccount } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";

export default function ManageAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { data: dbUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const deleteAccountMutation = useDeleteAccount();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { initials, imageSource, userName, email } = useMemo(() => {
    const userName = user?.fullName || user?.username || dbUser?.name || "Developer";
    const email = user?.emailAddresses[0]?.emailAddress || dbUser?.email || "";
    const initials =
      (userName || "")
        .split(" ")
        .map((name) => name[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "DV";

    const imageSource = user?.imageUrl || dbUser?.avatarUrl ? { uri: user?.imageUrl || dbUser?.avatarUrl || "" } : undefined;
    return { initials, imageSource, userName, email };
  }, [user, dbUser]);

  const isMember = Boolean(dbUser?.isGroupMember || dbUser?.googleGroupConfirmed);
  const memberSince = dbUser?.createdAt
    ? new Date(dbUser.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Recently";

  const handleLogout = async () => {
    try {
      setShowLogoutConfirm(false);
      queryClient.clear();
      await signOut();
      toast.success("Logged out", { description: "You have been signed out successfully." });
      router.replace("/(auth)/welcome" as any);
    } catch (err: any) {
      toast.error("Logout error", { description: err.message || "Failed to log out" });
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // 1. Delete all backend user data and cascades
      await deleteAccountMutation.mutateAsync();

      // 2. Attempt to delete Clerk account if supported
      try {
        if (user?.delete) {
          await user.delete();
        }
      } catch (clerkErr) {
        console.warn("Clerk user self-deletion skipped or not enabled:", clerkErr);
      }

      // 3. Clear local queries & sign out
      queryClient.clear();
      await signOut();

      setShowDeleteConfirm(false);
      toast.success("Account Deleted", {
        description: "Your account and all associated data have been permanently deleted.",
      });
      router.replace("/(auth)/welcome" as any);
    } catch (err: any) {
      console.error("Failed to delete account:", err);
      toast.error("Failed to delete account", {
        description: err.message || "An error occurred while deleting your account. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Navigation Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
        </Button>
        <Text className="text-xl font-bold ml-2 text-foreground">Manage Account</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-6" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <Card className="mb-6 overflow-hidden border-border/70">
          <CardContent className="p-5">
            <View className="flex-row items-center gap-4">
              <Avatar alt={`${userName}'s avatar`} className="h-16 w-16 border-2 border-primary/20">
                <AvatarImage source={imageSource} />
                <AvatarFallback className="bg-primary/10">
                  <Text className="text-xl font-bold text-primary">{initials}</Text>
                </AvatarFallback>
              </Avatar>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
                  {userName}
                </Text>
                <Text className="text-sm text-muted-foreground mt-0.5" numberOfLines={1}>
                  {email}
                </Text>
                <View className="flex-row items-center gap-2 mt-2">
                  {isMember ? (
                    <View className="bg-green-500/10 px-2.5 py-0.5 rounded-full flex-row items-center gap-1 border border-green-500/20">
                      <Icon as={CheckCircleIcon} className="size-3 text-green-600 dark:text-green-400" />
                      <Text className="text-[11px] text-green-600 dark:text-green-400 font-bold">Verified Member</Text>
                    </View>
                  ) : (
                    <View className="bg-secondary px-2.5 py-0.5 rounded-full border border-border">
                      <Text className="text-[11px] text-muted-foreground font-medium">Community Tester</Text>
                    </View>
                  )}
                  {dbUser?.isAdmin && (
                    <View className="bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                      <Text className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">Admin</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <View className="flex-row gap-3 mb-6">
          <Card className="flex-1 border-border/70">
            <CardContent className="p-3.5 items-center">
              <View className="h-9 w-9 rounded-full bg-primary/10 items-center justify-center mb-1.5">
                <Icon as={StarIcon} className="size-4 text-primary" />
              </View>
              <Text className="text-lg font-bold text-foreground">{dbUser?.reputation ?? 100}</Text>
              <Text className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reputation</Text>
            </CardContent>
          </Card>

          <Card className="flex-1 border-border/70">
            <CardContent className="p-3.5 items-center">
              <View className="h-9 w-9 rounded-full bg-orange-500/10 items-center justify-center mb-1.5">
                <Icon as={FlameIcon} className="size-4 text-orange-500" />
              </View>
              <Text className="text-lg font-bold text-foreground">{dbUser?.streak ?? 0}d</Text>
              <Text className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Streak</Text>
            </CardContent>
          </Card>

          <Card className="flex-1 border-border/70">
            <CardContent className="p-3.5 items-center">
              <View className="h-9 w-9 rounded-full bg-blue-500/10 items-center justify-center mb-1.5">
                <Icon as={SmartphoneIcon} className="size-4 text-blue-500" />
              </View>
              <Text className="text-lg font-bold text-foreground">{dbUser?.appsCount ?? 0}</Text>
              <Text className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Apps</Text>
            </CardContent>
          </Card>
        </View>

        {/* Account Details */}
        <Card className="mb-6 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="flex-row justify-between items-center py-1 border-b border-border/40">
              <Text className="text-sm text-muted-foreground">Active App Slots</Text>
              <Text className="text-sm font-semibold text-foreground">{dbUser?.unlockedAppSlots ?? 3} slots</Text>
            </View>
            <View className="flex-row justify-between items-center py-1 border-b border-border/40">
              <Text className="text-sm text-muted-foreground">Best Streak</Text>
              <Text className="text-sm font-semibold text-foreground">{dbUser?.bestStreak ?? 0} days</Text>
            </View>
            <View className="flex-row justify-between items-center py-1">
              <Text className="text-sm text-muted-foreground">Member Since</Text>
              <Text className="text-sm font-semibold text-foreground">{memberSince}</Text>
            </View>
          </CardContent>
        </Card>

        {/* Session Management */}
        <View className="gap-2 mb-6">
          <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Session</Text>
          <Button
            variant="outline"
            size="lg"
            className="w-full flex-row items-center justify-center gap-2 h-14 rounded-2xl border-border bg-card shadow-sm active:bg-secondary/60"
            onPress={() => setShowLogoutConfirm(true)}
            disabled={isDeleting}
          >
            <Icon as={LogOutIcon} className="size-5 text-foreground mr-1" />
            <Text className="text-foreground font-bold text-base">Log Out</Text>
          </Button>
        </View>

        {/* Danger Zone: Account Deletion */}
        <View className="gap-2 mb-4">
          <Text className="text-xs font-bold text-destructive px-2 uppercase tracking-widest">Danger Zone</Text>
          <Card className="border-destructive/30 bg-destructive/5 overflow-hidden">
            <CardContent className="p-4 gap-3">
              <View className="flex-row items-start gap-3">
                <View className="h-9 w-9 rounded-full bg-destructive/15 items-center justify-center shrink-0 mt-0.5">
                  <Icon as={AlertTriangleIcon} className="size-4 text-destructive" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-destructive">Delete Account</Text>
                  <Text className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Permanently delete your account, listed apps, testing pairs, and all testing history. This action cannot be undone.
                  </Text>
                </View>
              </View>

              <Button
                variant="destructive"
                size="lg"
                className="w-full flex-row items-center justify-center gap-2 h-14 rounded-2xl mt-1 shadow-sm bg-destructive active:bg-destructive/90"
                onPress={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Icon as={Trash2Icon} className="size-5 text-white mr-1" />
                    <Text className="text-white font-bold text-base">Delete Account</Text>
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log Out of Your Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You can sign back in anytime to resume your closed testing cycles and app swaps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setShowLogoutConfirm(false)}>
              <Text className="text-foreground font-bold text-base">Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleLogout}>
              <Text className="text-white font-bold text-base">Log Out</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <View className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center mb-2">
              <Icon as={AlertTriangleIcon} className="size-6 text-destructive" />
            </View>
            <AlertDialogTitle className="text-destructive font-extrabold text-xl">
              Permanently Delete Account?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              This action is <Text className="font-bold text-foreground">permanent and cannot be reversed</Text>.
              {"\n\n"}
              All of your data will be immediately and irreversibly deleted:
              {"\n"}• All submitted apps & testing tracks
              {"\n"}• All 14-day test matches & pairings
              {"\n"}• All uploaded screenshot proofs & logs
              {"\n"}• Chat messages, streak history & reputation
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-3">
            <AlertDialogCancel onPress={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
              <Text className="text-foreground font-bold text-base">Keep Account</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onPress={handleDeleteAccount}
              disabled={isDeleting}
            >
              <Text className="text-white font-bold text-base">
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeAreaView>
  );
}
