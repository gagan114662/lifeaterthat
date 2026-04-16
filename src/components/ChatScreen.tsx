import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Phone, Mic, RotateCw } from "lucide-react";
import {
  sendMessageStream,
  checkHealth,
  buildSystemPrompt,
  buildStorageKey,
  type ChatHistoryTurn,
} from "@/lib/streamClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatScreenProps {
  name: string;
  photo: string;
  onBack: () => void;
  memoryId?: string;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadStoredMessages(storageKey: string): Message[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as Message[];
  } catch {
    return null;
  }
}

const ChatScreen = ({ name, photo, onBack, memoryId }: ChatScreenProps) => {
  const storageKey = buildStorageKey(memoryId, name);

  const welcomeMessage: Message = {
    id: "welcome",
    role: "assistant",
    content: `Hi sweetheart, it's ${name}. It's so good to hear from you. What's on your mind?`,
  };

  const [messages, setMessages] = useState<Message[]>(
    () => loadStoredMessages(storageKey) ?? [welcomeMessage],
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<"online" | "unavailable">("online");
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<{ abort: () => void } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore storage quota errors
    }
  }, [messages, storageKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const status = await checkHealth(controller.signal);
      if (!controller.signal.aborted) setServiceStatus(status);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      streamRef.current?.abort();
    };
  }, []);

  const streamReply = useCallback(
    (text: string, history: ChatHistoryTurn[]) => {
      setIsSending(true);
      setIsTyping(true);
      setError(null);

      const assistantId = makeId("a");

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      streamRef.current = sendMessageStream(
        {
          message: text,
          personName: name,
          systemPrompt: buildSystemPrompt(name),
          history,
          memoryId,
        },
        {
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m,
              ),
            );
          },
          onDone: () => {
            setIsTyping(false);
            setIsSending(false);
            setLastFailedText(null);
            streamRef.current = null;
          },
          onError: (kind) => {
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            setIsTyping(false);
            setIsSending(false);
            setError(
              kind === "network"
                ? "No connection. Please check your network and try again."
                : "Something went wrong. Please try again.",
            );
            setLastFailedText(text);
            streamRef.current = null;
          },
        },
      );
    },
    [name, memoryId],
  );

  const sendMessage = () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: Message = { id: makeId("u"), role: "user", content: text };
    const historyForApi: ChatHistoryTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    streamReply(text, historyForApi);
  };

  const retryLast = () => {
    if (!lastFailedText || isSending) return;
    const trimmed: Message[] = [];
    let removed = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (
        !removed &&
        m.role === "user" &&
        m.content === lastFailedText
      ) {
        removed = true;
        continue;
      }
      trimmed.unshift(m);
    }
    const historyForApi: ChatHistoryTurn[] = trimmed.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    streamReply(lastFailedText, historyForApi);
  };

  const statusLabel = serviceStatus === "online" ? "Online" : "Unavailable";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="glass-card flex items-center gap-3 px-4 pt-14 pb-4 border-b border-border/50">
        <button onClick={onBack} className="text-muted-foreground p-1">
          <ArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-full overflow-hidden border border-border">
          <img src={photo} alt={name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <p className="font-heading text-sm font-semibold text-foreground">{name}</p>
          <p className="font-body text-xs text-muted-foreground">{statusLabel}</p>
        </div>
        <button className="w-9 h-9 rounded-full bg-card flex items-center justify-center text-foreground">
          <Phone size={16} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl font-body text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-card text-card-foreground rounded-bl-md border border-border/50"
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div
          data-testid="typing-indicator"
          aria-live="polite"
          aria-hidden={!isTyping}
          className={isTyping ? "flex justify-start" : "hidden"}
        >
          <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" />
            <span
              className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse"
              style={{ animationDelay: "0.15s" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse"
              style={{ animationDelay: "0.3s" }}
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="font-body text-xs text-destructive">{error}</p>
            {lastFailedText && (
              <button
                type="button"
                onClick={retryLast}
                disabled={isSending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-foreground"
              >
                <RotateCw size={12} />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-8 pt-3 border-t border-border/30">
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
            <Mic size={18} />
          </button>
          <div className="flex-1 flex items-center bg-card border border-border rounded-full px-4 py-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-30"
          >
            <Send size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;
