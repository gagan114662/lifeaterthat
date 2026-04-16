import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

interface HeroScreenProps {
  onGetStarted: () => void;
}

const HeroScreen = ({ onGetStarted }: HeroScreenProps) => {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <img
        src={heroBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        width={1080}
        height={1920}
      />
      <div className="absolute inset-0 bg-background/40" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center text-center px-8"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-6"
        >
          <svg width="80" height="50" viewBox="0 0 80 50" className="text-foreground">
            <path
              d="M10 25 C10 12, 25 5, 40 15 C55 5, 70 12, 70 25 C70 38, 55 45, 40 35 C25 45, 10 38, 10 25Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="28" cy="22" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="52" cy="22" r="3" fill="currentColor" opacity="0.3" />
          </svg>
        </motion.div>

        <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground mb-3">
          Afterlife
        </h1>

        <p className="font-body text-muted-foreground text-base max-w-xs leading-relaxed mb-2">
          Relive Memories. Always.
        </p>
        <p className="font-body text-muted-foreground/70 text-sm max-w-[260px] leading-relaxed mb-12">
          Experience a conversation with those you've lost, powered by their photo and voice.
        </p>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onGetStarted}
          className="bg-primary text-primary-foreground font-body font-medium px-10 py-3.5 rounded-full text-sm tracking-wide shadow-lg"
        >
          Begin
        </motion.button>
      </motion.div>

      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-16 h-16 rounded-full bg-accent/40 blur-xl animate-float" />
      <div className="absolute bottom-32 right-8 w-20 h-20 rounded-full bg-accent/30 blur-2xl animate-float" style={{ animationDelay: "2s" }} />
    </div>
  );
};

export default HeroScreen;
