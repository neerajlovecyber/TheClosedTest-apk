import { buttonTextVariants, buttonVariants } from "@/components/ui/button";
import { NativeOnlyAnimatedView } from "@/components/ui/native-only-animated-view";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog";
import * as React from "react";
import { Platform, View, type ViewProps } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

function AlertDialogOverlay({
  className,
  children,
  ...props
}: Omit<AlertDialogPrimitive.OverlayProps, "asChild"> &
  React.RefAttributes<AlertDialogPrimitive.OverlayRef> & {
    children?: React.ReactNode;
  }) {
  return (
    <FullWindowOverlay>
      <AlertDialogPrimitive.Overlay
        className={cn(
          "absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-2",
          Platform.select({
            web: "animate-in fade-in-0 fixed",
          }),
          className,
        )}
        {...props}
      >
        <NativeOnlyAnimatedView entering={FadeIn.duration(200).delay(50)}>
          <>{children}</>
        </NativeOnlyAnimatedView>
      </AlertDialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function AlertDialogContent({
  className,
  portalHost,
  ...props
}: AlertDialogPrimitive.ContentProps &
  React.RefAttributes<AlertDialogPrimitive.ContentRef> & {
    portalHost?: string;
  }) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={cn(
            "bg-card border-border/80 z-50 flex w-full max-w-[calc(100%-2.5rem)] flex-col gap-4 rounded-3xl border p-6 shadow-2xl shadow-black/20 sm:max-w-md",
            Platform.select({
              web: "animate-in fade-in-0 zoom-in-95 duration-200",
            }),
            className,
          )}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-left">
      <View className={cn("flex flex-col gap-2", className)} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return <View className={cn("flex flex-row items-center gap-3 pt-2 w-full", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.TitleProps & React.RefAttributes<AlertDialogPrimitive.TitleRef>) {
  return <AlertDialogPrimitive.Title className={cn("text-foreground text-xl font-bold tracking-tight", className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.DescriptionProps & React.RefAttributes<AlertDialogPrimitive.DescriptionRef>) {
  return <AlertDialogPrimitive.Description className={cn("text-muted-foreground text-sm leading-relaxed", className)} {...props} />;
}

type AlertDialogActionProps = AlertDialogPrimitive.ActionProps &
  React.RefAttributes<AlertDialogPrimitive.ActionRef> & {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  };

function AlertDialogAction({ className, variant, ...props }: AlertDialogActionProps) {
  const isDestructive = variant === "destructive" || className?.includes("bg-destructive") || className?.includes("bg-red");
  const effectiveVariant = variant || (isDestructive ? "destructive" : "default");

  return (
    <TextClassContext.Provider value={buttonTextVariants({ className, variant: effectiveVariant, size: "default" })}>
      <AlertDialogPrimitive.Action
        className={cn(
          buttonVariants({ variant: effectiveVariant, size: "default" }),
          "flex-1 h-12 rounded-2xl items-center justify-center font-semibold active:opacity-85",
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

type AlertDialogCancelProps = AlertDialogPrimitive.CancelProps &
  React.RefAttributes<AlertDialogPrimitive.CancelRef> & {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  };

function AlertDialogCancel({ className, variant = "outline", ...props }: AlertDialogCancelProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className, variant, size: "default" })}>
      <AlertDialogPrimitive.Cancel
        className={cn(
          buttonVariants({ variant, size: "default" }),
          "flex-1 h-12 rounded-2xl items-center justify-center border-border/80 active:opacity-85",
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
