import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Phone, Mic, RotateCw } from "lucide-react";

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

const STORAGE_KEY = "afterlife-messages";

function buildSystemPrompt(name: string): string {
  return (
    `You are ${name}, a loving person who has passed away and is speaking ` +
    `with someone who misses you deeply. Respond with warmth, specific ` +
    `memories, and affection in the voice of ${name}. Keep replies short, ` +
    `personal, and gentle. Never break character or mention being an AI.`
  );
}

function loadStoredMessages(): Message[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as Message[];
  } catch {
    return null;
  }
}

const ChatScreen = ({ name, photo, onBack }: ChatScreenProps) => {
  const welcomeMessage: Message = {
    id: "welcome",
    role: "assistant",
    content: `Hi sweetheart, it's so good to hear from you. What's on your mind?`,
  };

  const [messages, setMessages] = useState<Message[]>(
    () => loadStoredMessages() ?? [welcomeMessage]
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<"online" | "unavailable">("online");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore storage quota errors
    }
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/health", { method: "GET" });
        setServiceStatus(res && res.ok ? "online" : "unavailable");
      } catch {
        setServiceStatus("unavailable");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  const callApi = useCallback(
    async (text: string, history: Message[]) => {
      setIsSending(true);
      setIsTyping(true);
      setError(null);

      try {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            personName: name,
            systemPrompt: buildSystemPrompt(name),
            history: history.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!response.ok) {
          throw new Error("server_error");
        }

        const data = await response.json();
        const reply: Message = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "assistant",
          content: typeof data?.reply === "string" ? data.reply : "",
        };
        setMessages((prev) => [...prev, reply]);
        setLastFailedText(null);
      } catch (err) {
        if (err instanceof TypeError) {
          setError("No connection. Please check your network and try again.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        setLastFailedText(text);
      } finally {
        setIsTyping(false);
        setIsSending(false);
      }
    },
    [name]
  );

  const sendMessage = () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: Message = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      content: text,
    };
    const historyForApi = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    void callApi(text, historyForApi);
  };

  const retryLast = () => {
    if (!lastFailedText || isSending) return;
    const historyForApi = messages;
    void callApi(lastFailedText, historyForApi);
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
