import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import HeroScreen from "@/components/HeroScreen";
import CreateMemory from "@/components/CreateMemory";
import ChatScreen from "@/components/ChatScreen";

type Screen = "hero" | "create" | "chat";

interface MemoryData {
  name: string;
  photo: string;
  voiceSample: string;
  memoryId: string;
}

const Index = () => {
  const [screen, setScreen] = useState<Screen>("hero");
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);

  return (
    <div className="max-w-md mx-auto min-h-screen relative overflow-hidden">
      <AnimatePresence mode="wait">
        {screen === "hero" && (
          <motion.div key="hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <HeroScreen onGetStarted={() => setScreen("create")} />
          </motion.div>
        )}
        {screen === "create" && (
          <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <CreateMemory
              onComplete={(data) => {
                setMemoryData(data);
                setScreen("chat");
              }}
              onBack={() => setScreen("hero")}
            />
          </motion.div>
        )}
        {screen === "chat" && memoryData && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <ChatScreen
              name={memoryData.name}
              photo={memoryData.photo}
              memoryId={memoryData.memoryId}
              onBack={() => setScreen("create")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
