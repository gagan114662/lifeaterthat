import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Phone, Mic } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatScreenProps {
  name: string;
  photo: string;
  onBack: () => void;
}

const ChatScreen = ({ name, photo, onBack }: ChatScreenProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi there... it's so good to hear from you. What's on your mind?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulated response
    setTimeout(() => {
      const responses = [
        `I remember that too. Those were such beautiful times.`,
        `You know, I'm always here whenever you need me.`,
        `That means so much to me. Tell me more...`,
        `I think about those moments all the time.`,
        `You've always been so special to me. Never forget that.`,
      ];
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
      };
      setMessages((prev) => [...prev, reply]);
      setIsTyping(false);
    }, 1500 + Math.random() * 1000);
  };

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
          <p className="font-body text-xs text-muted-foreground">Online</p>
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

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.3s" }} />
            </div>
          </motion.div>
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
            disabled={!input.trim()}
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
