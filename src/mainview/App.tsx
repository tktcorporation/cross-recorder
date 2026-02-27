import { SourcePanel } from "./components/SourcePanel.js";
import { RecordPanel } from "./components/RecordPanel.js";
import { RecordingsList } from "./components/RecordingsList.js";
import { AudioPlayer } from "./components/AudioPlayer.js";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-900">
      {/* Title bar */}
      <header className="flex h-10 shrink-0 items-center bg-gray-950 px-4">
        <h1 className="text-sm font-semibold text-gray-300">Cross Recorder</h1>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col gap-4 p-4">
        {/* Top: Source + Record panels */}
        <div className="grid grid-cols-2 gap-4">
          <SourcePanel />
          <RecordPanel />
        </div>

        {/* Recordings list */}
        <RecordingsList />
      </main>

      {/* Audio player (bottom) */}
      <div className="shrink-0 border-t border-gray-700 p-4">
        <AudioPlayer />
      </div>
    </div>
  );
}
