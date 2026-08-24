import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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
import appConfig from "../../app.json";
import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { LucideIcon } from "lucide-react-native";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  InfoIcon,
  LogOutIcon,
  MessageSquareIcon,
  MoonIcon,
  Share2Icon,
  ShieldIcon,
  ShieldAlertIcon,
  StarIcon,
  SunIcon,
  HelpCircleIcon,
  SendIcon,
  UsersIcon,
  Code2Icon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import * as React from "react";
import { Linking, View, Share, TouchableOpacity, Modal, Pressable } from "react-native";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { ApiEnvSwitch } from "@/components/ApiEnvSwitch";
import Constants from "expo-constants";
import { useCurrentUser, useMySupportChat } from "@/lib/api-hooks";

interface SettingItemProps {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  action?: React.ReactNode;
  destructive?: boolean;
  iconColor?: string;
  showBadge?: boolean;
}

function SettingItem({ icon, label, subtitle, onPress, action, destructive, iconColor, showBadge }: SettingItemProps) {
  return (
    <TouchableOpacity className="flex-row items-center justify-between w-full py-4 px-4" onPress={onPress} activeOpacity={0.7}>
      <View className="flex-row items-center gap-4 flex-1">
        <View className={`h-10 w-10 rounded-xl items-center justify-center ${iconColor || "bg-primary/10"}`}>
          <Icon as={icon} className={`size-5 ${destructive ? "text-destructive" : iconColor ? "text-white" : "text-primary"}`} />
        </View>
        <View className="flex-1">
          <Text className={`text-base font-semibold ${destructive ? "text-destructive" : "text-foreground"}`}>{label}</Text>
          {subtitle && <Text className="text-sm text-muted-foreground">{subtitle}</Text>}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {showBadge && <View className="w-2.5 h-2.5 bg-red-500 rounded-full" />}
        {action || <Icon as={ChevronRightIcon} className="size-5 text-muted-foreground/50" />}
      </View>
    </TouchableOpacity>
  );
}

function UserProfile({ onOpenGroupModal }: { onOpenGroupModal: () => void }) {
  const { user } = useUser();
  const { data: dbUser } = useCurrentUser();

  const { initials, imageSource, userName, email } = React.useMemo(() => {
    const userName = user?.fullName || user?.username || "User";
    const email = user?.emailAddresses[0]?.emailAddress;
    const initials = (user?.fullName || user?.username || "")
      .split(" ")
      .map((name) => name[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const imageSource = user?.imageUrl ? { uri: user.imageUrl } : undefined;
    return { initials, imageSource, userName, email };
  }, [user]);

  const isMember = Boolean(dbUser?.isGroupMember || dbUser?.googleGroupConfirmed);

  return (
    <Card className="mx-4 mb-4 border-0 overflow-hidden">
      <CardContent className="p-5">
        <View className="flex-row items-center gap-4">
          <View>
            <Avatar alt={`${userName}'s avatar`} className="h-20 w-20 border-4 border-primary/20">
              <AvatarImage source={imageSource} />
              <AvatarFallback className="bg-primary/10">
                <Text className="text-2xl font-bold text-primary">{initials}</Text>
              </AvatarFallback>
            </Avatar>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold text-foreground">{userName}</Text>
            </View>
            <Text className="text-muted-foreground font-medium mt-0.5">{email}</Text>

            {isMember ? (
              <TouchableOpacity onPress={onOpenGroupModal} activeOpacity={0.7} className="flex-row items-center mt-2 self-start">
                <View className="bg-green-500/10 px-3 py-1 rounded-full flex-row items-center gap-1.5 border border-green-500/20">
                  <Text className="text-xs text-green-600 dark:text-green-400 font-bold">✓ Verified Member</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onOpenGroupModal} activeOpacity={0.7} className="flex-row items-center mt-2 self-start">
                <View className="bg-amber-500/10 px-3 py-1 rounded-full flex-row items-center gap-1.5 border border-amber-500/20">
                  <Text className="text-xs text-amber-600 dark:text-amber-400 font-bold">Join Google Group</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const router = useRouter();

  const { data: currentUser } = useCurrentUser();
  const isAdmin = Boolean(currentUser?.isAdmin);

  const { data: mySupportChat } = useMySupportChat();
  const hasUnreadFromAdmin = mySupportChat?.hasUnreadUser ?? false;

  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const [showGroupModal, setShowGroupModal] = React.useState(false);

  const handleShare = async () => {
    try {
      await Share.share({
        message: "Check out The Closed Test on Google Play Store: https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest",
        url: "https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest",
      });
    } catch (error) {
      console.error("Error sharing app:", error);
    }
  };

  const handleRate = () => {
    handleLink("https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest");
  };

  const handleLink = (url: string) => {
    Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
  };

  return (
    <ScreenScrollView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-between">
        <Text className="text-3xl font-extrabold text-foreground tracking-tight">Settings</Text>
        <TouchableOpacity
          onPress={toggleColorScheme}
          className="p-2.5 rounded-full bg-secondary/50 border border-border/60 active:bg-secondary"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Toggle Dark Mode"
        >
          <Icon as={colorScheme === "dark" ? SunIcon : MoonIcon} className="size-5 text-foreground" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 gap-4">
        <UserProfile onOpenGroupModal={() => setShowGroupModal(true)} />

        {/* Settings Groups */}
        <View className="px-4 gap-6">
          {/* Community Section */}
          <View className="gap-3">
            <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Community</Text>
            <Card className="overflow-hidden p-0 gap-0 border-0">
              <CardContent className="p-0 gap-0 divide-y divide-border/30">
                <SettingItem
                  icon={SendIcon}
                  label="Telegram Community"
                  subtitle="Join our developer community"
                  onPress={() => handleLink("https://t.me/developers_community_official/1")}
                  iconColor="bg-sky-500"
                />
                <SettingItem
                  icon={Code2Icon}
                  label="Open Source on GitHub"
                  subtitle="Star & explore the source code"
                  onPress={() => handleLink("https://github.com/neerajlovecyber/TheClosedTest-apk")}
                  iconColor="bg-zinc-800 dark:bg-zinc-700"
                />
                <SettingItem icon={Share2Icon} label="Share App" subtitle="Invite other developers" onPress={handleShare} iconColor="bg-blue-500" />
                <SettingItem icon={StarIcon} label="Rate Us" subtitle="Leave a review on Google Play" onPress={handleRate} iconColor="bg-amber-500" />
              </CardContent>
            </Card>
          </View>

          {/* Help & Support Section */}
          <View className="gap-3">
            <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Help & Support</Text>
            <Card className="overflow-hidden p-0 gap-0 border-0">
              <CardContent className="p-0 gap-0 divide-y divide-border/30">
                <SettingItem
                  icon={HelpCircleIcon}
                  label="How It Works"
                  subtitle="Learn how to use the app"
                  onPress={() => router.push("/help" as any)}
                  iconColor="bg-indigo-500"
                />
                <SettingItem
                  icon={CheckCircleIcon}
                  label="Play Store Setup Guide"
                  subtitle="How to add Google Group to testers"
                  onPress={() => router.push("/playstore-guide" as any)}
                  iconColor="bg-emerald-500"
                />
                <SettingItem
                  icon={MessageSquareIcon}
                  label="Contact Support"
                  subtitle="Get help with issues"
                  onPress={() => router.push("/admin-chat")}
                  iconColor="bg-rose-500"
                  showBadge={hasUnreadFromAdmin}
                />
              </CardContent>
            </Card>
          </View>

          {/* Legal Section */}
          <View className="gap-3">
            <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Legal</Text>
            <Card className="overflow-hidden p-0 gap-0 border-0">
              <CardContent className="p-0 gap-0">
                <SettingItem
                  icon={ShieldIcon}
                  label="Terms & Privacy Policy"
                  subtitle="Terms of service and data protection"
                  onPress={() => router.push("/privacy-policy" as any)}
                  iconColor="bg-teal-500"
                />
              </CardContent>
            </Card>
          </View>

          {/* Admin Control Section (Only visible to authorized admins) */}
          {isAdmin && (
            <View className="gap-3">
              <Text className="text-xs font-bold text-amber-600 dark:text-amber-400 px-2 uppercase tracking-widest">Administration</Text>
              <Card className="overflow-hidden p-0 gap-0 border-0">
                <CardContent className="p-0 gap-0">
                  <SettingItem
                    icon={ShieldAlertIcon}
                    label="Admin Dashboard"
                    subtitle="Manage apps, inspect stats & support inbox"
                    onPress={() => router.push("/(tabs)/admin" as any)}
                    iconColor="bg-amber-600"
                  />
                </CardContent>
              </Card>
            </View>
          )}

          {/* Dev API Server Switch (dev builds only) */}
          {__DEV__ && <ApiEnvSwitch />}

          {/* App Version */}
          <View className="gap-3">
            <Card className="overflow-hidden p-0 gap-0 border-0 bg-transparent">
              <CardContent className="p-0">
                <View className="py-4 px-4 flex-row justify-between items-center">
                  <Text className="text-muted-foreground text-sm font-medium">Version</Text>
                  <Text className="text-muted-foreground text-sm font-bold">{appConfig.expo?.version || Constants.expoConfig?.version || "3.0.0"}</Text>
                </View>
              </CardContent>
            </Card>
          </View>

          {/* Logout Button */}
          <Button
            variant="destructive"
            className="w-full flex-row items-center justify-center gap-2 h-14 rounded-2xl"
            onPress={() => setShowLogoutConfirm(true)}
          >
            <Icon as={LogOutIcon} className="text-destructive-foreground size-5" />
            <Text className="text-destructive-foreground font-bold text-base">Log Out</Text>
          </Button>
        </View>
      </View>

      {/* Google Group Bottom Sheet Modal */}
      <Modal animationType="slide" transparent={true} visible={showGroupModal} onRequestClose={() => setShowGroupModal(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setShowGroupModal(false)}>
          <Pressable className="bg-background rounded-t-3xl p-6">
            <View className="flex-row items-center gap-3 mb-4">
              <View className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                <Icon as={UsersIcon} className="size-6 text-green-600 dark:text-green-400" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">Google Group</Text>
                <Text className="text-sm text-muted-foreground">Community Member</Text>
              </View>
            </View>

            <Text className="text-muted-foreground mb-4">You're a verified member of our developer community Google Group.</Text>

            <Button
              size="lg"
              className="bg-green-600 dark:bg-green-600"
              onPress={() => {
                Linking.openURL("https://groups.google.com/g/developers-community-official");
                setShowGroupModal(false);
              }}
            >
              <Text className="text-white font-bold">Open Google Group</Text>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log Out of Your Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out of The Closed Test? You can log back in at any time to resume your active test cycles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setShowLogoutConfirm(false)}>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setShowLogoutConfirm(false);
                signOut();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              <Text className="text-white font-bold">Yes, Log Out</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenScrollView>
  );
}
