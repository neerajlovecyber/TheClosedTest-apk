import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { RefreshCwIcon } from "lucide-react-native";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ForceUpdateDialogProps {
  isVisible: boolean;
  onReload: () => void;
}

export function ForceUpdateDialog({ isVisible, onReload }: ForceUpdateDialogProps) {
  if (!isVisible) return null;

  return (
    <AlertDialog open={isVisible} onOpenChange={() => {}}>
      <AlertDialogContent className="w-[90%] max-w-sm p-0 border-0 bg-transparent shadow-none px-2">
        <View className="bg-background rounded-[2rem] overflow-hidden border border-orange-200/50 shadow-2xl shadow-orange-500/20">
          {/* Header Image / Graphic Area */}
          <View className="bg-orange-500 items-center pt-10 pb-8 px-6 relative overflow-hidden">
            {/* Decorative circles */}
            <View className="absolute -top-10 -right-10 w-32 h-32 bg-orange-400 rounded-full opacity-50" />
            <View className="absolute top-10 -left-10 w-24 h-24 bg-orange-600 rounded-full opacity-30" />

            <View className="bg-white/20 p-5 rounded-3xl backdrop-blur-sm shadow-inner mb-2 border border-white/30">
              <Icon as={RefreshCwIcon} className="text-white size-10" />
            </View>
          </View>

          {/* Content Body */}
          <View className="px-8 pb-8 pt-6 items-center bg-background relative">
            {/* Decorative Side Markings */}
            <View className="absolute left-0 top-10 bottom-10 w-1 bg-orange-500/20 rounded-r-full" />
            <View className="absolute right-0 top-10 bottom-10 w-1 bg-orange-500/20 rounded-l-full" />

            <AlertDialogTitle className="text-2xl font-black text-center text-foreground mb-2">Time to Update!</AlertDialogTitle>

            <AlertDialogDescription className="text-center text-base text-muted-foreground leading-relaxed mb-8">
              We've improved the app! Update now to keep testing without interruptions.
            </AlertDialogDescription>

            {/* Action Button */}
            <AlertDialogFooter className="w-full">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onReload}
                className="w-full bg-orange-500 h-14 rounded-2xl flex-row items-center justify-center gap-2 shadow-lg shadow-orange-500/30"
              >
                <Icon as={RefreshCwIcon} className="text-white size-5" />
                <Text className="text-white font-bold text-lg text-center">Reload App</Text>
              </TouchableOpacity>
            </AlertDialogFooter>
          </View>
        </View>
      </AlertDialogContent>
    </AlertDialog>
  );
}
