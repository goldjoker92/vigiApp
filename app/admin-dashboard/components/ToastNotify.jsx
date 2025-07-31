// /components/ToastNotify.jsx
import { useEffect } from "react";
import { useToast } from "@chakra-ui/react";

export default function ToastNotify({ message, onClose }) {
  const toast = useToast();
  useEffect(() => {
    if (message)
      toast({ title: message, status: "info", duration: 5000, isClosable: true, onClose });
  }, [message, onClose, toast]);
  return null;
}
