import React from "react";
import { View, Platform } from "react-native";
import { BaseToast, ErrorToast, ToastConfig as ToastConfigType } from "react-native-toast-message";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { CheckCircleIcon, XCircleIcon, InfoIcon, AlertCircleIcon } from "lucide-react-native";
import { cn } from "@/lib/utils";

/*
  Custom Toast Configuration
  Styles the toast to match the app's aesthetic using NativeWind (Tailwind) classes.
*/

const TOAST_WIDTH = "90%";

const CustomToast = ({ type, text1, text2, props }: any) => {
  let icon = InfoIcon;
  let iconBgColor = "bg-blue-500/10";
  let iconColor = "text-blue-600";

  if (type === "success") {
    icon = CheckCircleIcon;
    iconBgColor = "bg-green-500/10";
    iconColor = "text-green-600";
  } else if (type === "error") {
    icon = AlertCircleIcon;
    iconBgColor = "bg-red-500/10";
    iconColor = "text-red-600";
  }

  return (
    <Card className="flex-row items-center p-4 w-[90%] border-border shadow-sm bg-card">
      <View className={cn(iconBgColor, "p-2.5 rounded-xl mr-3")}>
        <Icon as={icon} className={cn("size-5", iconColor)} />
      </View>
      <View className="flex-1">
        {text1 && <Text className="font-semibold text-foreground text-base">{text1}</Text>}
        {text2 && <Text className="text-xs text-muted-foreground mt-0.5 leading-4">{text2}</Text>}
      </View>
    </Card>
  );
};

export const toastConfig: ToastConfigType = {
  success: (props) => <CustomToast {...props} type="success" />,
  error: (props) => <CustomToast {...props} type="error" />,
  info: (props) => <CustomToast {...props} type="info" />,
};
