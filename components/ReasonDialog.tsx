import React, { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";

interface ReasonDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  placeholder?: string;
  confirmText?: string;
  initialValue?: string;
}

export function ReasonDialog({
  visible,
  onClose,
  onConfirm,
  title,
  placeholder = "Reason...",
  confirmText = "Confirm",
  initialValue = "",
}: ReasonDialogProps) {
  const [reason, setReason] = useState(initialValue);

  const handleConfirm = () => {
    onConfirm(reason);
    setReason("");
  };

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <View className="py-2">
          <Textarea
            placeholder={placeholder}
            value={reason}
            onChangeText={setReason}
            className="min-h-[100px]"
            autoFocus
          />
        </View>

        <DialogFooter className="flex-row justify-end gap-2 pt-2">
          <Button variant="outline" onPress={onClose}>
            <Text>Cancel</Text>
          </Button>
          <Button onPress={handleConfirm} disabled={!reason.trim()}>
            <Text>{confirmText}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
