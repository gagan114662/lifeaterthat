import { useState, useRef, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Mic, ArrowRight, ArrowLeft, X, Upload } from "lucide-react";

interface CreateMemoryProps {
  onComplete: (data: {
    name: string;
    photo: string;
    voiceSample: string;
    memoryId: string;
  }) => void;
  onBack: () => void;
}

const CreateMemory = ({ onComplete, onBack }: CreateMemoryProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [voiceSample, setVoiceSample] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const uploadFile = async (path: string, file: File | Blob, filename: string) => {
    const formData = new FormData();
    formData.append("file", file, filename);

    const response = await fetch(path, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const data = (await response.json()) as { url?: string };
    if (!data.url) {
      throw new Error("Upload response missing url");
    }

    return data.url;
  };

  const createMemory = async () => {
    const response = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        photoUrl: photo,
        voiceSampleUrl: voiceSample,
      }),
    });

    if (!response.ok) {
      throw new Error(`Memory create failed: ${response.status}`);
    }

    return (await response.json()) as { id: string };
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      setIsUploading(true);
      try {
        const url = await uploadFile("/api/upload/photo", file, file.name);
        setPhoto(url);
      } catch {
        setPhoto(null);
        setError("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleVoiceUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      setIsUploading(true);
      try {
        const url = await uploadFile("/api/upload/audio", file, file.name);
        setVoiceSample(url);
      } catch {
        setVoiceSample(null);
        setError("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setError(null);
        setIsUploading(true);
        void (async () => {
          try {
            const url = await uploadFile("/api/upload/audio", blob, "voice.webm");
            setVoiceSample(url);
          } catch {
            setVoiceSample(null);
            setError("Upload failed. Please try again.");
          } finally {
            setIsUploading(false);
            stream.getTracks().forEach((t) => t.stop());
          }
        })();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      console.error("Microphone access denied");
    }
  };

  const pageVariants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };
  const canFinish = Boolean(name.trim() && photo && voiceSample);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-14 pb-4">
        <button onClick={onBack} className="text-muted-foreground p-2 -ml-2">
          <ArrowLeft size={20} />
        </button>
        <span className="font-body text-xs text-muted-foreground tracking-widest uppercase">
          Step {step} of 3
        </span>
        <div className="w-8" />
      </div>

      {/* Progress */}
      <div className="px-6 mb-8">
        <div className="h-0.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-foreground rounded-full"
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      <div className="flex-1 px-6">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoUpload}
        />
        <input
          ref={voiceInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleVoiceUpload}
        />
        {isUploading && (
          <div className="mb-4">
            <div role="progressbar" aria-label="Upload progress" className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-full bg-foreground animate-pulse" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Uploading...</p>
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div>{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-2 text-xs font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col"
            >
              <h2 className="font-heading text-2xl font-semibold text-foreground mb-2">
                Who would you like to remember?
              </h2>
              <p className="font-body text-sm text-muted-foreground mb-8">
                Enter their name to begin.
              </p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Their name..."
                className="w-full bg-card border border-border rounded-xl px-5 py-4 font-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/10 text-lg"
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col"
            >
              <h2 className="font-heading text-2xl font-semibold text-foreground mb-2">
                Upload their photo
              </h2>
              <p className="font-body text-sm text-muted-foreground mb-8">
                A clear face photo works best.
              </p>

              {photo ? (
                <div className="relative w-48 h-48 mx-auto rounded-2xl overflow-hidden shadow-lg">
                  <img src={photo} alt="Uploaded" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhoto(null)}
                    className="absolute top-2 right-2 bg-foreground/60 text-primary-foreground rounded-full p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-48 h-48 mx-auto rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-foreground/30 transition-colors"
                >
                  <Camera size={32} strokeWidth={1.5} />
                  <span className="font-body text-sm">Tap to upload</span>
                </button>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col"
            >
              <h2 className="font-heading text-2xl font-semibold text-foreground mb-2">
                Add a voice sample
              </h2>
              <p className="font-body text-sm text-muted-foreground mb-8">
                Record or upload a clip of their voice.
              </p>

              <div className="flex flex-col items-center gap-6">
                {/* Record button */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleRecording}
                  disabled={isUploading}
                  aria-label={isRecording ? "Recording... Tap to stop" : "Tap to record"}
                  aria-pressed={isRecording}
                  className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                    isRecording
                      ? "bg-destructive text-destructive-foreground animate-pulse-soft"
                      : "bg-card border border-border text-foreground"
                  }`}
                >
                  <Mic size={36} strokeWidth={1.5} />
                </motion.button>
                <span className="font-body text-sm text-muted-foreground">
                  {isRecording ? "Recording... Tap to stop" : "Tap to record"}
                </span>

                {/* Or upload */}
                <button
                  onClick={() => voiceInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 text-muted-foreground font-body text-sm hover:text-foreground transition-colors"
                >
                  <Upload size={16} />
                  Upload audio file
                </button>

                {voiceSample && (
                  <div className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-body text-sm text-foreground">Voice sample ready</span>
                    <button onClick={() => setVoiceSample(null)} className="text-muted-foreground">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-10 pt-6">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={
            isUploading ||
            isSaving ||
            (step === 1 && !name.trim()) ||
            (step === 2 && !photo) ||
            (step === 3 && !voiceSample)
          }
          onClick={async () => {
            if (!canFinish && step < 3) {
              setError(null);
              setStep((s) => (s + 1) as 1 | 2 | 3);
              return;
            }

            setError(null);
            setIsSaving(true);
            try {
              const memory = await createMemory();
              onComplete({
                name,
                photo: photo!,
                voiceSample: voiceSample!,
                memoryId: memory.id,
              });
            } catch {
              setError("Saving failed. Please try again.");
            } finally {
              setIsSaving(false);
            }
          }}
          className="w-full bg-primary text-primary-foreground font-body font-medium py-4 rounded-full text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-30 disabled:pointer-events-none shadow-lg"
        >
          {step === 3 ? (isSaving ? "Saving..." : "Start Conversation") : "Continue"}
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};

export default CreateMemory;
