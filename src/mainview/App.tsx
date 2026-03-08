import { AnimatePresence, motion } from "framer-motion";
import { useViewStore } from "./stores/viewStore.js";
import { RecordingView } from "./views/RecordingView.js";
import { LibraryView } from "./views/LibraryView.js";
import { UpdateNotification } from "./components/UpdateNotification.js";

/**
 * スライドアニメーション variants。
 * direction に基づいて入退場方向を決定する。
 * spring ベースのトランジションで iOS ライクな慣性感を実現。
 */
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

const slideTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export default function App() {
  const currentView = useViewStore((s) => s.currentView);
  const direction = useViewStore((s) => s.direction);

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Title bar - draggable area for Electrobun window */}
      <header className="flex h-10 shrink-0 items-center justify-between bg-card px-4">
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          Cross Recorder
        </h1>
        <UpdateNotification />
      </header>

      {/* View container with AnimatePresence for smooth transitions */}
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentView}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            className="absolute inset-0"
          >
            {currentView === "recording" ? (
              <RecordingView />
            ) : (
              <LibraryView />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
