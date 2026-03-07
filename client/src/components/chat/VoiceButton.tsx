interface VoiceButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onToggle: () => void;
}

export function VoiceButton({ isListening, isSupported, onToggle }: VoiceButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={isSupported ? onToggle : undefined}
        disabled={!isSupported}
        aria-label={isListening ? 'Stop recording' : 'Start voice input'}
        className={[
          'w-10 h-10 rounded-full border-2 border-[#452B2B] flex items-center justify-center',
          'transition-colors cursor-pointer',
          isListening
            ? 'bg-red-500 border-red-600 mic-recording text-white'
            : 'bg-[#F3C8D7] text-[#452B2B] hover:bg-[#EDBBAB]',
          !isSupported && 'opacity-40 cursor-not-allowed',
        ].join(' ')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z" />
          <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.07A7 7 0 0 0 19 11Z" />
        </svg>
      </button>
      {!isSupported && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap font-body text-xs bg-[#452B2B] text-[#FDF6F0] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Voice coming soon
        </div>
      )}
    </div>
  );
}
