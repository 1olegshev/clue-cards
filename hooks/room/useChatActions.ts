/**
 * Chat actions hook - handles chat functionality.
 */

import { useState, useCallback } from "react";
import * as actions from "@/lib/rtdb-actions";
import { useError } from "@/contexts/ErrorContext";
import { withRetry, isRetryableError } from "@/lib/retry";

export interface UseChatActionsReturn {
  chatInput: string;
  setChatInput: (value: string) => void;
  handleSendMessage: (e: React.FormEvent) => void;
  isSending: boolean;
}

export function useChatActions(
  roomCode: string,
  uid: string | null
): UseChatActionsReturn {
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { showError } = useError();

  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !uid || isSending) return;

    const messageToSend = chatInput.trim();
    setIsSending(true);
    
    // Clear input optimistically for better UX
    setChatInput("");
    
    withRetry(
      () => actions.sendMessage(roomCode, uid, messageToSend, "chat"),
      { 
        maxAttempts: 2, 
        initialDelayMs: 500,
        shouldRetry: isRetryableError 
      }
    )
      .catch((error) => {
        // Restore input on failure
        setChatInput(messageToSend);
        showError(error.message || "Failed to send message");
        console.error("[Chat] Failed to send message:", error);
      })
      .finally(() => {
        setIsSending(false);
      });
  }, [roomCode, chatInput, uid, isSending, showError]);

  return {
    chatInput,
    setChatInput,
    handleSendMessage,
    isSending,
  };
}
